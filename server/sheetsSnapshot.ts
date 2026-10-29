import { getTableColumns } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { getDb } from "./db";

export function inventoryAlerts(
  items: Pick<schema.Item, "id" | "name" | "subcategory" | "isActive" | "unitOfMeasure" | "reorderLevel">[],
  batches: Pick<schema.Batch, "id" | "itemId" | "lotNumber" | "quantityOnHand" | "expiryDate" | "isQuarantined">[],
  today: string,
) {
  const stock = items.map(item => {
    const lots = batches.filter(batch => batch.itemId === item.id);
    const onHand = lots.reduce((sum, batch) => sum + batch.quantityOnHand, 0);
    const usable = lots.filter(batch => !batch.isQuarantined && batch.expiryDate >= today)
      .reduce((sum, batch) => sum + batch.quantityOnHand, 0);
    return { itemId: item.id, name: item.name, subcategory: item.subcategory,
      unitOfMeasure: item.unitOfMeasure, onHand, usable, reorderLevel: item.reorderLevel,
      status: !item.isActive ? "inactive" : usable <= 0 ? "out_of_stock" : usable <= item.reorderLevel ? "low_stock" : "ok" };
  });
  const alerts: { key: string; type: string; itemId: number; item: string; details: string }[] = [];
  for (const item of stock) {
    if (item.status === "low_stock" || item.status === "out_of_stock") {
      alerts.push({ key: `item:${item.itemId}:${item.status}`, type: item.status, itemId: item.itemId,
        item: item.name, details: `${item.usable} usable ${item.unitOfMeasure}; reorder level ${item.reorderLevel}; total on hand ${item.onHand}` });
    }
  }
  for (const batch of batches) {
    const item = items.find(item => item.id === batch.itemId);
    if (item && batch.quantityOnHand > 0 && batch.expiryDate < today) {
      alerts.push({ key: `batch:${batch.id}:expired`, type: "expired", itemId: item.id, item: item.name,
        details: `Lot ${batch.lotNumber}: ${batch.quantityOnHand} ${item.unitOfMeasure}; expired ${batch.expiryDate}${batch.isQuarantined ? "; quarantined" : ""}` });
    }
  }
  return { stock, alerts };
}

export async function createSheetsSnapshot() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    // Explicit user columns exclude credentials and unused password fields.
    const userColumns = {
      id: schema.users.id, username: schema.users.username, email: schema.users.email,
      name: schema.users.name, role: schema.users.role, createdAt: schema.users.createdAt,
      updatedAt: schema.users.updatedAt, lastSignedIn: schema.users.lastSignedIn,
    };
    const tables = [schema.items, schema.batches, schema.stockTransactions,
      schema.consumptionTemplates, schema.treatmentSessions, schema.sessionConsumables,
      schema.purchaseOrders, schema.purchaseOrderLines] as const;
    const names = ["Items", "Batches", "StockTransactions", "ConsumptionTemplates",
      "TreatmentSessions", "SessionConsumables", "PurchaseOrders", "PurchaseOrderLines"];
    const exports: { name: string; headers: string[]; rows: unknown[][] }[] = [];
    let itemRows: schema.Item[] = [];
    let batchRows: schema.Batch[] = [];
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const headers = Object.keys(getTableColumns(table));
      const rows = await tx.select().from(table).orderBy(table.id);
      if (i === 0) itemRows = rows as schema.Item[];
      if (i === 1) batchRows = rows as schema.Batch[];
      exports.push({ name: names[i], headers, rows: rows.map(row => headers.map(key => (row as Record<string, unknown>)[key] ?? null)) });
    }
    const userRows = await tx.select(userColumns).from(schema.users).orderBy(schema.users.id);
    const headers = Object.keys(userColumns);
    exports.push({ name: "Users", headers, rows: userRows.map(row => headers.map(key => row[key as keyof typeof row] ?? null)) });
    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const { stock, alerts } = inventoryAlerts(itemRows, batchRows, today);
    const stockHeaders = ["itemId", "name", "subcategory", "unitOfMeasure", "onHand", "usable", "reorderLevel", "status"] as const;
    exports.push({ name: "StockSummary", headers: [...stockHeaders], rows: stock.map(row => stockHeaders.map(key => row[key])) });
    exports.push({ name: "Alerts", headers: ["key", "type", "itemId", "item", "details"],
      rows: alerts.map(alert => [alert.key, alert.type, alert.itemId, alert.item, alert.details]) });
    return { version: 1, generatedAt: now.toISOString(), businessDate: today, tables: exports, alerts };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
