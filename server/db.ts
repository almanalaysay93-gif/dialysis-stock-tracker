import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.

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

export async function listItems() {
  const db = await getDb();
  if (!db) return [];
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
  await db.insert(items).values(data);
  const rows = await db.select().from(items).where(eq(items.name, data.name!)).limit(1);
  return rows[0];
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
  await db.insert(batches).values(data);
  const rows = await db.select().from(batches).orderBy(desc(batches.id)).limit(1);
  return rows[0];
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
  await db.insert(stockTransactions).values(data);
  const rows = await db.select().from(stockTransactions).orderBy(desc(stockTransactions.id)).limit(1);
  return rows[0];
}

// Deducts qty from FEFO batches (earliest expiry first) for an item.
// Returns array of {batchId, qty} actually deducted, or throws if insufficient stock.
export async function deductFefo(itemId: number, qty: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const available = await db
    .select()
    .from(batches)
    .where(and(eq(batches.itemId, itemId), eq(batches.isQuarantined, false), gt(batches.quantityOnHand, 0)))
    .orderBy(batches.expiryDate);
  const deductions: { batchId: number; qty: number }[] = [];
  let remaining = qty;
  for (const batch of available) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantityOnHand, remaining);
    deductions.push({ batchId: batch.id, qty: take });
    remaining -= take;
    await db.update(batches).set({ quantityOnHand: batch.quantityOnHand - take }).where(eq(batches.id, batch.id));
  }
  if (remaining > 0) throw new Error(`Insufficient stock for item ${itemId}: need ${qty}, available ${qty - remaining}`);
  return deductions;
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
  await db.insert(consumptionTemplates).values(data);
  const rows = await db.select().from(consumptionTemplates).orderBy(desc(consumptionTemplates.id)).limit(1);
  return rows[0];
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
  await db.insert(treatmentSessions).values(data);
  const rows = await db.select().from(treatmentSessions).orderBy(desc(treatmentSessions.id)).limit(1);
  return rows[0];
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
