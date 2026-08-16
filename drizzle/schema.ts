import {
  bigint,
  boolean,
  date,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Item catalog
// ─────────────────────────────────────────────────────────────────────────────
export const items = mysqlTable("items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  category: mysqlEnum("category", [
    "dialyzer",
    "bloodline",
    "needles",
    "saline",
    "medications",
    "disinfectants",
    "PPE",
    "PD supplies",
  ]).notNull(),
  unitOfMeasure: varchar("unitOfMeasure", { length: 32 }).notNull(),
  minStockLevel: int("minStockLevel").notNull().default(0),
  reorderLevel: int("reorderLevel").notNull().default(0),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Item = typeof items.$inferSelect;
export type InsertItem = typeof items.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Batch / lot records (FEFO unit)
// ─────────────────────────────────────────────────────────────────────────────
export const batches = mysqlTable("batches", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  lotNumber: varchar("lotNumber", { length: 80 }).notNull(),
  supplier: varchar("supplier", { length: 160 }),
  quantityReceived: int("quantityReceived").notNull(),
  quantityOnHand: int("quantityOnHand").notNull(),
  expiryDate: date("expiryDate", { mode: "string" }).notNull(),
  isQuarantined: boolean("isQuarantined").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Batch = typeof batches.$inferSelect;
export type InsertBatch = typeof batches.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Stock transaction ledger (every in/out movement)
// ─────────────────────────────────────────────────────────────────────────────
export const stockTransactions = mysqlTable("stock_transactions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  batchId: int("batchId"),
  type: mysqlEnum("type", ["stock-in", "stock-out"]).notNull(),
  reason: mysqlEnum("reason", ["issued", "adjusted", "written off", "returned"]).notNull(),
  quantity: int("quantity").notNull(),
  supplier: varchar("supplier", { length: 160 }),
  lotNumber: varchar("lotNumber", { length: 80 }),
  expiryDate: date("expiryDate", { mode: "string" }),
  notes: text("notes"),
  performedBy: varchar("performedBy", { length: 120 }),
  performedAt: timestamp("performedAt").defaultNow().notNull(),
});

export type StockTransaction = typeof stockTransactions.$inferSelect;
export type InsertStockTransaction = typeof stockTransactions.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Consumption templates (default items per session type)
// ─────────────────────────────────────────────────────────────────────────────
export const consumptionTemplates = mysqlTable("consumption_templates", {
  id: int("id").autoincrement().primaryKey(),
  sessionType: mysqlEnum("sessionType", ["HD", "PD"]).notNull(),
  itemId: int("itemId").notNull(),
  defaultQty: int("defaultQty").notNull(),
  label: varchar("label", { length: 120 }),
  isActive: boolean("isActive").default(true).notNull(),
});

export type ConsumptionTemplate = typeof consumptionTemplates.$inferSelect;
export type InsertConsumptionTemplate = typeof consumptionTemplates.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Treatment sessions
// ─────────────────────────────────────────────────────────────────────────────
export const treatmentSessions = mysqlTable("treatment_sessions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  patientName: varchar("patientName", { length: 160 }).notNull(),
  chair: varchar("chair", { length: 16 }).notNull(),
  shift: mysqlEnum("shift", ["morning", "afternoon", "evening"]).notNull(),
  sessionType: mysqlEnum("sessionType", ["HD", "PD"]).notNull(),
  sessionDate: date("sessionDate", { mode: "string" }).notNull(),
  status: mysqlEnum("status", ["in-progress", "completed"]).default("in-progress").notNull(),
  createdBy: varchar("createdBy", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TreatmentSession = typeof treatmentSessions.$inferSelect;
export type InsertTreatmentSession = typeof treatmentSessions.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Session consumables (items used in a session)
// ─────────────────────────────────────────────────────────────────────────────
export const sessionConsumables = mysqlTable("session_consumables", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  sessionId: bigint("sessionId", { mode: "number" }).notNull(),
  itemId: int("itemId").notNull(),
  batchId: int("batchId"),
  quantity: int("quantity").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SessionConsumable = typeof sessionConsumables.$inferSelect;
export type InsertSessionConsumable = typeof sessionConsumables.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Purchase orders & delivery tracking
// ─────────────────────────────────────────────────────────────────────────────
export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  /** Friendly reference, e.g. "PO-2026-004" */
  poNumber: varchar("poNumber", { length: 40 }).notNull(),
  supplier: varchar("supplier", { length: 160 }).notNull(),
  status: mysqlEnum("status", ["ordered", "partially-delivered", "delivered", "cancelled"]).default("ordered").notNull(),
  expectedDeliveryDate: date("expectedDeliveryDate", { mode: "string" }).notNull(),
  actualDeliveryDate: date("actualDeliveryDate", { mode: "string" }),
  itemsSummary: text("itemsSummary"),
  notes: text("notes"),
  createdBy: varchar("createdBy", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

// Purchase order line items (which items/quantities are expected)
export const purchaseOrderLines = mysqlTable("purchase_order_lines", {
  id: int("id").autoincrement().primaryKey(),
  poId: int("poId").notNull(),
  itemId: int("itemId").notNull(),
  quantityOrdered: int("quantityOrdered").notNull(),
  quantityReceived: int("quantityReceived").default(0).notNull(),
});

export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type InsertPurchaseOrderLine = typeof purchaseOrderLines.$inferInsert;
