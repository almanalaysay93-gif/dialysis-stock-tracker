import { and, desc, eq, getTableColumns, gt, inArray, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, users } from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // prepare: false keeps the client compatible with Supabase's transaction
      // pooler (port 6543), which does not support prepared statements.
      _db = drizzle(postgres(process.env.DATABASE_URL, { prepare: false }));
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ── Users ────────────────────────────────────────────────────────────────────
const {
  passwordHash: _passwordHash,
  failedLogins: _failedLogins,
  lockedUntil: _lockedUntil,
  ...publicUserColumns
} = getTableColumns(users);

/** Full row including the password hash and lock state. Only for credential checks. */
export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return rows[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select(publicUserColumns).from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function createUser(data: InsertUser) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.insert(users).values(data).returning(publicUserColumns);
  return row;
}

/** Creates the Google admin account on first sign-in, or re-asserts the admin role. */
export async function upsertGoogleAdmin(email: string, name: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db
    .insert(users)
    .values({ username: email, email, name, role: "admin" })
    .onConflictDoUpdate({ target: users.email, set: { role: "admin", failedLogins: 0, lockedUntil: null } })
    .returning({ id: users.id });
  return row;
}

export async function setUserPassword(id: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // A reset also lifts any lock, so a locked-out user can get back in.
  await db.update(users).set({ passwordHash, failedLogins: 0, lockedUntil: null }).where(eq(users.id, id));
}

/**
 * Counts one wrong password. On the `maxFailures`-th in a row the counter
 * resets and the account is locked for `lockMinutes`. One atomic statement, so
 * concurrent attempts cannot skip the lock.
 */
export async function recordFailedLogin(id: number, maxFailures: number, lockMinutes: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const reachedLimit = sql`${users.failedLogins} + 1 >= ${maxFailures}`;
  await db
    .update(users)
    .set({
      failedLogins: sql`CASE WHEN ${reachedLimit} THEN 0 ELSE ${users.failedLogins} + 1 END`,
      lockedUntil: sql`CASE WHEN ${reachedLimit} THEN now() + make_interval(mins => ${lockMinutes}) ELSE ${users.lockedUntil} END`,
    })
    .where(eq(users.id, id));
}

export async function recordSignIn(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date(), failedLogins: 0, lockedUntil: null }).where(eq(users.id, id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory feature queries
// ─────────────────────────────────────────────────────────────────────────────
import {
  batches,
  consumptionTemplates,
  items,
  sessionConsumables,
  stockTransactions,
  treatmentSessions,
} from "../drizzle/schema";

export async function listItems(includeInactive = false) {
  const db = await getDb();
  if (!db) return [];
  if (includeInactive) return db.select().from(items).orderBy(items.name);
  return db.select().from(items).where(eq(items.isActive, true)).orderBy(items.name);
}

export async function getItemById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(items).where(eq(items.id, id)).limit(1);
  return rows[0];
}

export async function createItem(data: typeof items.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.insert(items).values(data).returning();
  return row;
}

export async function updateItem(id: number, data: Partial<typeof items.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(items).set(data).where(eq(items.id, id));
  return getItemById(id);
}

export async function deleteItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // soft delete: mark inactive
  await db.update(items).set({ isActive: false }).where(eq(items.id, id));
}

// ── Batches ──────────────────────────────────────────────────────────────────
export async function listBatches(filters?: { itemId?: number; showQuarantined?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conds = [];
  if (filters?.itemId) conds.push(eq(batches.itemId, filters.itemId));
  if (filters?.showQuarantined === false) conds.push(eq(batches.isQuarantined, false));
  return conds.length
    ? db.select().from(batches).where(and(...conds)).orderBy(batches.expiryDate)
    : db.select().from(batches).orderBy(batches.expiryDate);
}

export async function getBatchesByItem(itemId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(batches)
    .where(and(eq(batches.itemId, itemId), eq(batches.isQuarantined, false)))
    .orderBy(batches.expiryDate);
}

export async function createBatch(data: typeof batches.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.insert(batches).values(data).returning();
  return row;
}

// ── Stock transactions ───────────────────────────────────────────────────────
export async function listTransactions(limit = 500) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stockTransactions).orderBy(desc(stockTransactions.performedAt)).limit(limit);
}

export async function createTransaction(data: typeof stockTransactions.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.insert(stockTransactions).values(data).returning();
  return row;
}

// Deducts qty from FEFO batches (earliest expiry first) for an item.
// Returns array of {batchId, qty} actually deducted, or throws if insufficient stock.
export async function deductFefo(itemId: number, qty: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // One transaction with row locks: asking for more than is on hand rolls back
  // instead of leaving the batches emptied, and two concurrent issues cannot
  // both deduct from the same stale quantity.
  return db.transaction(async (tx) => {
    const available = await tx
      .select()
      .from(batches)
      .where(and(eq(batches.itemId, itemId), eq(batches.isQuarantined, false), gt(batches.quantityOnHand, 0)))
      .orderBy(batches.expiryDate)
      .for("update");
    const deductions: { batchId: number; qty: number }[] = [];
    let remaining = qty;
    for (const batch of available) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantityOnHand, remaining);
      deductions.push({ batchId: batch.id, qty: take });
      remaining -= take;
      await tx.update(batches).set({ quantityOnHand: batch.quantityOnHand - take }).where(eq(batches.id, batch.id));
    }
    if (remaining > 0) throw new Error(`Insufficient stock for item ${itemId}: need ${qty}, available ${qty - remaining}`);
    return deductions;
  });
}


// ── Stock totals per item ────────────────────────────────────────────────────
export async function getStockTotals() {
  const db = await getDb();
  if (!db) return [];
  const batchRows = await db.select().from(batches);
  const itemRows = await listItems();
  const totals = new Map<number, { itemId: number; onHand: number }>();
  for (const b of batchRows) {
    const cur = totals.get(b.itemId) ?? { itemId: b.itemId, onHand: 0 };
    cur.onHand += b.quantityOnHand;
    totals.set(b.itemId, cur);
  }
  return itemRows.map((item) => ({
    ...item,
    onHand: totals.get(item.id)?.onHand ?? 0,
  }));
}

// ── Consumption templates ────────────────────────────────────────────────────
export async function listTemplates(sessionType?: "HD" | "PD") {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(consumptionTemplates.isActive, true)];
  if (sessionType) conds.push(eq(consumptionTemplates.sessionType, sessionType));
  return db.select().from(consumptionTemplates).where(and(...conds));
}

export async function createTemplate(data: typeof consumptionTemplates.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.insert(consumptionTemplates).values(data).returning();
  return row;
}

export async function deleteTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(consumptionTemplates).set({ isActive: false }).where(eq(consumptionTemplates.id, id));
}

// ── Treatment sessions ──────────────────────────────────────────────────────
export async function listSessions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(treatmentSessions).orderBy(desc(treatmentSessions.createdAt));
}

// Fetch sessions with their consumable lines in a single round-trip pair,
// avoiding one DB query per session on list views.
export async function listSessionsWithLines(): Promise<
  Array<
    Awaited<ReturnType<typeof listSessions>>[number] & {
      lines: Awaited<ReturnType<typeof getSessionConsumables>>;
    }
  >
> {
  const db = await getDb();
  if (!db) return [];
  const sessions = await db
    .select()
    .from(treatmentSessions)
    .orderBy(desc(treatmentSessions.createdAt));
  if (sessions.length === 0) return [];
  const lines = await db
    .select()
    .from(sessionConsumables)
    .where(inArray(sessionConsumables.sessionId, sessions.map((s) => s.id)));
  const bySession = new Map<number, typeof lines>();
  for (const line of lines) {
    const list = bySession.get(line.sessionId) ?? [];
    list.push(line);
    bySession.set(line.sessionId, list);
  }
  return sessions.map((s) => ({ ...s, lines: bySession.get(s.id) ?? [] }));
}

export async function getSessionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(treatmentSessions).where(eq(treatmentSessions.id, id)).limit(1);
  return rows[0];
}

export async function createSession(data: typeof treatmentSessions.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.insert(treatmentSessions).values(data).returning();
  return row;
}

export async function completeSession(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(treatmentSessions).set({ status: "completed" }).where(eq(treatmentSessions.id, id));
}

export async function deleteSession(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(treatmentSessions).where(eq(treatmentSessions.id, id));
}

// ── Session consumables ──────────────────────────────────────────────────────
export async function getSessionConsumables(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sessionConsumables).where(eq(sessionConsumables.sessionId, sessionId));
}

// Batched variant: fetch lines for many sessions in one query.
export async function getSessionConsumablesByIds(sessionIds: number[]) {
  const db = await getDb();
  if (!db || sessionIds.length === 0) return [];
  return db.select().from(sessionConsumables).where(inArray(sessionConsumables.sessionId, sessionIds));
}

export async function createSessionConsumables(
  sessionId: number,
  lines: { itemId: number; batchId?: number | null; quantity: number }[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (lines.length === 0) return [];
  await db.insert(sessionConsumables).values(
    lines.map((l) => ({ sessionId, itemId: l.itemId, batchId: l.batchId ?? null, quantity: l.quantity }))
  );
  return db.select().from(sessionConsumables).where(eq(sessionConsumables.sessionId, sessionId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchase orders & delivery metrics
// ─────────────────────────────────────────────────────────────────────────────
import {
  purchaseOrderLines,
  purchaseOrders,
} from "../drizzle/schema";

export async function listPurchaseOrders() {
  const db = await getDb();
  if (!db) return [];
  const orders = await db.select().from(purchaseOrders).orderBy(purchaseOrders.expectedDeliveryDate);
  const lines = await db.select().from(purchaseOrderLines);
  return orders.map((po) => ({ ...po, lines: lines.filter((l) => l.poId === po.id) }));
}

export async function getPurchaseOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!po) return undefined;
  const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
  return { ...po, lines };
}

export async function createPurchaseOrder(
  data: typeof purchaseOrders.$inferInsert,
  lines: { itemId: number; quantityOrdered: number }[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [{ id: poId }] = await db.insert(purchaseOrders).values(data).returning({ id: purchaseOrders.id });
  if (lines.length > 0) {
    await db.insert(purchaseOrderLines).values(lines.map((l) => ({ poId, ...l, quantityReceived: 0 })));
  }
  return getPurchaseOrderById(poId);
}

export async function updatePurchaseOrder(
  id: number,
  data: Partial<typeof purchaseOrders.$inferInsert>,
  lines?: { itemId: number; quantityOrdered: number; quantityReceived?: number }[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (Object.keys(data).length > 0) {
    await db.update(purchaseOrders).set(data).where(eq(purchaseOrders.id, id));
  }
  if (lines) {
    await db.delete(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
    if (lines.length > 0) {
      await db.insert(purchaseOrderLines).values(lines.map((l) => ({ poId: id, ...l })));
    }
  }
  return getPurchaseOrderById(id);
}

export async function deletePurchaseOrder(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
  await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  return { success: true } as const;
}

/** Auto-generate next PO number like PO-2026-0004 */
export async function nextPoNumber() {
  const db = await getDb();
  if (!db) return `PO-${new Date().getFullYear()}-0001`;
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const rows = await db
    .select({ poNumber: purchaseOrders.poNumber })
    .from(purchaseOrders)
    .where(like(purchaseOrders.poNumber, `${prefix}%`));
  const nums = rows
    .map((r) => Number(r.poNumber.slice(prefix.length)))
    .filter((n) => !Number.isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/**
 * Delivery metrics per item:
 * - daysOfSupply: onHand / avg daily consumption (last 14 days), Infinity when no consumption
 * - lastDeliveryDate: most recent stock-in
 * - nextDeliveryDate: earliest expected delivery of open POs containing this item
 * - incomingQty: quantity ordered but not yet received on open POs
 */
export async function getDeliveryMetrics() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  const cutoffIso = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);
  const todayIso = now.toISOString().slice(0, 10);

  const [allItems, stockTotals, txRows, poRows, poLineRows] = await Promise.all([
    db.select().from(items).where(eq(items.isActive, true)),
    db.select().from(batches),
    db.select().from(stockTransactions).where(and(eq(stockTransactions.type, "stock-out"), gt(stockTransactions.performedAt, new Date(cutoffIso + "T00:00:00")))),
    db.select().from(purchaseOrders).where(inArray(purchaseOrders.status, ["ordered", "partially-delivered"])),
    db.select().from(purchaseOrderLines),
  ]);

  const itemIdSet = new Set(allItems.map((i) => i.id));

  // On-hand per item
  const onHand = new Map<number, number>();
  stockTotals.forEach((b) => onHand.set(b.itemId, (onHand.get(b.itemId) ?? 0) + (b.isQuarantined ? 0 : b.quantityOnHand)));

  // Avg daily consumption (stock-out ledger over 14 days)
  const consumedQty = new Map<number, number>();
  txRows.forEach((t) => {
    if (!itemIdSet.has(t.itemId)) return;
    consumedQty.set(t.itemId, (consumedQty.get(t.itemId) ?? 0) + Math.abs(t.quantity));
  });

  // Last delivery per item (most recent stock-in)
  const insRows = await db.select().from(stockTransactions).where(eq(stockTransactions.type, "stock-in"));
  const stockInByItem = new Map<number, string>();
  insRows.forEach((t) => {
    const iso = new Date(t.performedAt).toISOString().slice(0, 10);
    if (!stockInByItem.has(t.itemId) || iso > (stockInByItem.get(t.itemId) ?? "")) {
      stockInByItem.set(t.itemId, iso);
    }
  });

  // Next delivery per item from open POs
  const nextDelivery = new Map<number, string>();
  const incomingQty = new Map<number, number>();
  const openPoIds = new Set(poRows.map((p) => p.id));
  poLineRows
    .filter((l) => openPoIds.has(l.poId))
    .forEach((l) => {
      const po = poRows.find((p) => p.id === l.poId)!;
      if (po.expectedDeliveryDate < todayIso) return; // already past — don't count as "next"
      const cur = nextDelivery.get(l.itemId);
      if (!cur || po.expectedDeliveryDate < cur) nextDelivery.set(l.itemId, po.expectedDeliveryDate);
      incomingQty.set(l.itemId, (incomingQty.get(l.itemId) ?? 0) + (l.quantityOrdered - l.quantityReceived));
    });

  return allItems.map((item) => {
    const hand = onHand.get(item.id) ?? 0;
    const consumed = consumedQty.get(item.id) ?? 0;
    const avgDaily = consumed / 14;
    const daysOfSupply = avgDaily > 0 ? Math.round((hand / avgDaily) * 10) / 10 : Infinity;
    return {
      itemId: item.id,
      name: item.name,
      category: item.category,
      unitOfMeasure: item.unitOfMeasure,
      onHand: hand,
      minStockLevel: item.minStockLevel,
      reorderLevel: item.reorderLevel,
      avgDailyConsumption: Math.round(avgDaily * 100) / 100,
      daysOfSupply,
      lastDeliveryDate: stockInByItem.get(item.id) ?? null,
      nextDeliveryDate: nextDelivery.get(item.id) ?? null,
      incomingQty: incomingQty.get(item.id) ?? 0,
    };
  });
}
