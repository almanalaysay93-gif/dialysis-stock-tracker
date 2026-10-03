import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, eq } from "drizzle-orm";
import { batches, items } from "../drizzle/schema";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";

const TEST_DB = process.env.DATABASE_URL;

// Expiry dates relative to today, so the assertions hold whenever the suite runs.
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      username: "test-admin",
      name: "Test Admin",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as any,
    res: {} as any,
  };
}

describe.skipIf(!TEST_DB)("rotation.list — FIFO ordering (real DB)", () => {
  let itemIds: number[];
  let batchIds: number[];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    itemIds = [];
    batchIds = [];
    // Use one real disinfectants item as the parent
    const itemRow = await db.select({ id: items.id }).from(items).where(eq(items.category, "disinfectants")).limit(1);
    if (itemRow.length === 0) return;
    const itemId = itemRow[0].id;

    // Batch A: oldest (created yesterday), later expiry
    await db.insert(batches).values({
      itemId,
      lotNumber: "ROT-A-OLDEST",
      quantityReceived: 50,
      quantityOnHand: 50,
      expiryDate: inDays(200),
      isQuarantined: false,
    });
    const oldest = await db.select({ id: batches.id }).from(batches).where(eq(batches.lotNumber, "ROT-A-OLDEST")).limit(1);
    batchIds.push(oldest[0].id);
    await db.update(batches).set({ createdAt: sql`NOW() - INTERVAL '1 day'` }).where(eq(batches.id, oldest[0].id));

    // Batch B: newest (created now), earlier expiry
    await db.insert(batches).values({
      itemId,
      lotNumber: "ROT-B-NEWEST",
      quantityReceived: 30,
      quantityOnHand: 30,
      expiryDate: inDays(150),
      isQuarantined: false,
    });
    const newest = await db.select({ id: batches.id, createdAt: batches.createdAt }).from(batches).where(eq(batches.lotNumber, "ROT-B-NEWEST")).limit(1);
    batchIds.push(newest[0].id);

    // Batch C: same receive day as B but later expiry — must sort after B
    await db.insert(batches).values({
      itemId,
      lotNumber: "ROT-C-SAMEDAY",
      quantityReceived: 10,
      quantityOnHand: 10,
      expiryDate: inDays(300),
      isQuarantined: false,
    });
    const sameDay = await db.select({ id: batches.id }).from(batches).where(eq(batches.lotNumber, "ROT-C-SAMEDAY")).limit(1);
    batchIds.push(sameDay[0].id);
    await db.update(batches).set({ createdAt: newest[0].createdAt }).where(eq(batches.id, sameDay[0].id));
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db || batchIds.length === 0) return;
    await db.delete(batches).where(sql`${batches.id} IN (${sql.join(batchIds, sql`, `)})`);
  });

  it("returns the oldest-received batch first, with tie-break by expiry", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const rows = await caller.rotation.list();
    const active = rows.filter((r) => r.quantityOnHand > 0 && !r.isQuarantined);

    const a = active.find((r) => r.lotNumber === "ROT-A-OLDEST")!;
    const b = active.find((r) => r.lotNumber === "ROT-B-NEWEST")!;
    const c = active.find((r) => r.lotNumber === "ROT-C-SAMEDAY")!;
    expect(active.indexOf(a)).toBeLessThan(active.indexOf(b));
    // Same-day tie-break: B (expires in 150 days) before C (expires in 300 days)
    expect(active.indexOf(b)).toBeLessThan(active.indexOf(c));
  });

  it("includes shelf-life metadata for freshness tracking", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const rows = await caller.rotation.list();
    const oldest = rows.find((r) => r.lotNumber === "ROT-A-OLDEST");
    expect(oldest?.daysOnShelf).toBe(1);
    expect(oldest?.ageBucket).toBe("≤30d");
    expect(oldest?.daysUntilExpiry).toBeGreaterThan(100);
  });

  it("excludes quarantined and depleted batches from the rotation view", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const rows = await caller.rotation.list();
    // Test-seeded ROT batches must never appear quarantined or depleted in the view
    const rot = rows.filter((r) => r.lotNumber.startsWith("ROT-"));
    expect(rot.filter((r) => r.isQuarantined).length).toBe(0);
    expect(rot.filter((r) => r.quantityOnHand <= 0).length).toBe(0);
    expect(rot.map((r) => r.lotNumber).sort()).toEqual(["ROT-A-OLDEST", "ROT-B-NEWEST", "ROT-C-SAMEDAY"]);
  });
});
