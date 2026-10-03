import { describe, expect, it } from "vitest";
import { sql, and, eq } from "drizzle-orm";
import { batches, items } from "../drizzle/schema";
import { deductFefo, getDb } from "./db";

const TEST_DB = process.env.DATABASE_URL;

describe("deductFefo ordering (real DB)", () => {
  it.skipIf(!TEST_DB)(
    "deducts from the earliest-expiring batch first",
    async () => {
      const db = await getDb();
      if (!db) return;

      // Create a scratch item and three batches with staggered expiry dates.
      await db.insert(items).values({
        name: "__fefo_test__",
        category: "saline",
        unitOfMeasure: "bag",
        minStockLevel: 0,
        reorderLevel: 0,
        isActive: true,
      });
      const [row] = (await db
        .select()
        .from(items)
        .where(eq(items.name, "__fefo_test__"))) as { id: number }[];
      const itemId = row.id;

      await db.insert(batches).values([
        {
          itemId,
          lotNumber: "F-3",
          quantityReceived: 10,
          quantityOnHand: 10,
          expiryDate: "2027-03-01",
        },
        {
          itemId,
          lotNumber: "F-1",
          quantityReceived: 10,
          quantityOnHand: 10,
          expiryDate: "2027-01-01",
        },
        {
          itemId,
          lotNumber: "F-2",
          quantityReceived: 10,
          quantityOnHand: 10,
          expiryDate: "2027-02-01",
        },
      ]);

      const deductions = await deductFefo(itemId, 6);

      // Earliest-expiring batch (F-1) must be taken first.
      expect(deductions[0]).toMatchObject({ batchId: expect.any(Number), qty: 6 });

      const remaining = await db
        .select()
        .from(batches)
        .where(eq(batches.itemId, itemId));
      const byLot = Object.fromEntries(
        remaining.map((b) => [b.lotNumber, b.quantityOnHand])
      );
      expect(byLot["F-1"]).toBe(4);
      expect(byLot["F-2"]).toBe(10);
      expect(byLot["F-3"]).toBe(10);

      // Cleanup
      await db.delete(batches).where(eq(batches.itemId, itemId));
      await db.delete(items).where(eq(items.id, itemId));
    },
    30000
  );

  it.skipIf(!TEST_DB)(
    "leaves every batch untouched when asked for more than is on hand",
    async () => {
      const db = await getDb();
      if (!db) return;

      const [item] = await db
        .insert(items)
        .values({ name: "__fefo_short_test__", category: "saline", unitOfMeasure: "bag" })
        .returning();
      await db.insert(batches).values([
        { itemId: item.id, lotNumber: "S-1", quantityReceived: 10, quantityOnHand: 10, expiryDate: "2027-01-01" },
        { itemId: item.id, lotNumber: "S-2", quantityReceived: 6, quantityOnHand: 6, expiryDate: "2027-02-01" },
      ]);

      await expect(deductFefo(item.id, 17)).rejects.toThrow("Insufficient stock");

      const remaining = await db.select().from(batches).where(eq(batches.itemId, item.id));
      expect(Object.fromEntries(remaining.map((b) => [b.lotNumber, b.quantityOnHand]))).toEqual({
        "S-1": 10,
        "S-2": 6,
      });

      // Cleanup
      await db.delete(batches).where(eq(batches.itemId, item.id));
      await db.delete(items).where(eq(items.id, item.id));
    },
    30000
  );
});
