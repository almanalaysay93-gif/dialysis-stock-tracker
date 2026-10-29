import { describe, expect, it } from "vitest";
import { inventoryAlerts } from "./sheetsSnapshot";

describe("Sheets stock alerts", () => {
  const item = { id: 1, name: "PD solution", subcategory: "PD solution 2L/Box 1.5%", isActive: true, unitOfMeasure: "box", reorderLevel: 5 };
  const lot = { id: 1, itemId: 1, lotNumber: "L1", quantityOnHand: 5, expiryDate: "2026-10-29", isQuarantined: false };
  it("alerts at the reorder boundary but not above it", () => {
    expect(inventoryAlerts([item], [lot], "2026-10-29").alerts[0].type).toBe("low_stock");
    expect(inventoryAlerts([item], [{ ...lot, quantityOnHand: 6 }], "2026-10-29").alerts).toEqual([]);
  });
  it("does not treat expired or quarantined stock as usable", () => {
    const result = inventoryAlerts([item], [{ ...lot, expiryDate: "2026-10-28" }, { ...lot, id: 2, isQuarantined: true }], "2026-10-29");
    expect(result.stock[0]).toMatchObject({ usable: 0, onHand: 10, status: "out_of_stock" });
    expect(result.alerts.map(a => a.type)).toEqual(["out_of_stock", "expired"]);
  });
  it("includes today's expiry as usable, ignores empty expired lots, and suppresses inactive shortage alerts", () => {
    expect(inventoryAlerts([item], [lot], "2026-10-29").stock[0].usable).toBe(5);
    const result = inventoryAlerts([{ ...item, isActive: false }], [{ ...lot, quantityOnHand: 0, expiryDate: "2026-10-28" }], "2026-10-29");
    expect(result.alerts).toEqual([]);
  });
});
