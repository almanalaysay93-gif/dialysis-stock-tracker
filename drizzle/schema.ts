import {
  bigint,
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// Every table enables row level security with no policies: the server connects
// as the table owner (which bypasses RLS), while Supabase's Data API roles
// (anon / authenticated) get no access to any row.

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const itemCategory = pgEnum("item_category", [
  "dialyzer",
  "bloodline",
  "needles",
  "saline",
  "medications",
  "disinfectants",
  "PPE",
  "PD supplies",
]);
export const transactionType = pgEnum("transaction_type", ["stock-in", "stock-out"]);
export const transactionReason = pgEnum("transaction_reason", ["issued", "adjusted", "written off", "returned"]);
export const sessionType = pgEnum("session_type", ["HD", "PD"]);
export const sessionShift = pgEnum("session_shift", ["morning", "afternoon", "evening"]);
export const sessionStatus = pgEnum("session_status", ["in-progress", "completed"]);
export const purchaseOrderStatus = pgEnum("purchase_order_status", [
  "ordered",
  "partially-delivered",
  "delivered",
  "cancelled",
]);

/**
 * Core user table backing auth flow.
 */
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  /** Stored lowercase; sign-in is case-insensitive. */
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  name: text("name"),
  role: userRole("role").default("user").notNull(),
  /** Consecutive wrong passwords since the last sign-in or lock. */
  failedLogins: integer("failedLogins").default(0).notNull(),
  /** Sign-in is refused until this time. Kept in the database so every server instance sees it. */
  lockedUntil: timestamp("lockedUntil", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Item catalog
// ─────────────────────────────────────────────────────────────────────────────
export const items = pgTable("items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 160 }).notNull(),
  category: itemCategory("category").notNull(),
  unitOfMeasure: varchar("unitOfMeasure", { length: 32 }).notNull(),
  minStockLevel: integer("minStockLevel").notNull().default(0),
  reorderLevel: integer("reorderLevel").notNull().default(0),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}).enableRLS();

export type Item = typeof items.$inferSelect;
export type InsertItem = typeof items.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Batch / lot records (FEFO unit)
// ─────────────────────────────────────────────────────────────────────────────
export const batches = pgTable("batches", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  itemId: integer("itemId").notNull(),
  lotNumber: varchar("lotNumber", { length: 80 }).notNull(),
  supplier: varchar("supplier", { length: 160 }),
  quantityReceived: integer("quantityReceived").notNull(),
  quantityOnHand: integer("quantityOnHand").notNull(),
  expiryDate: date("expiryDate", { mode: "string" }).notNull(),
  isQuarantined: boolean("isQuarantined").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export type Batch = typeof batches.$inferSelect;
export type InsertBatch = typeof batches.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Stock transaction ledger (every in/out movement)
// ─────────────────────────────────────────────────────────────────────────────
export const stockTransactions = pgTable("stock_transactions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  itemId: integer("itemId").notNull(),
  batchId: integer("batchId"),
  type: transactionType("type").notNull(),
  reason: transactionReason("reason").notNull(),
  quantity: integer("quantity").notNull(),
  supplier: varchar("supplier", { length: 160 }),
  lotNumber: varchar("lotNumber", { length: 80 }),
  expiryDate: date("expiryDate", { mode: "string" }),
  notes: text("notes"),
  performedBy: varchar("performedBy", { length: 120 }),
  performedAt: timestamp("performedAt", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export type StockTransaction = typeof stockTransactions.$inferSelect;
export type InsertStockTransaction = typeof stockTransactions.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Consumption templates (default items per session type)
// ─────────────────────────────────────────────────────────────────────────────
export const consumptionTemplates = pgTable("consumption_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sessionType: sessionType("sessionType").notNull(),
  itemId: integer("itemId").notNull(),
  defaultQty: integer("defaultQty").notNull(),
  label: varchar("label", { length: 120 }),
  isActive: boolean("isActive").default(true).notNull(),
}).enableRLS();

export type ConsumptionTemplate = typeof consumptionTemplates.$inferSelect;
export type InsertConsumptionTemplate = typeof consumptionTemplates.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Treatment sessions
// ─────────────────────────────────────────────────────────────────────────────
export const treatmentSessions = pgTable("treatment_sessions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  patientName: varchar("patientName", { length: 160 }).notNull(),
  chair: varchar("chair", { length: 16 }).notNull(),
  shift: sessionShift("shift").notNull(),
  sessionType: sessionType("sessionType").notNull(),
  sessionDate: date("sessionDate", { mode: "string" }).notNull(),
  status: sessionStatus("status").default("in-progress").notNull(),
  createdBy: varchar("createdBy", { length: 120 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export type TreatmentSession = typeof treatmentSessions.$inferSelect;
export type InsertTreatmentSession = typeof treatmentSessions.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Session consumables (items used in a session)
// ─────────────────────────────────────────────────────────────────────────────
export const sessionConsumables = pgTable("session_consumables", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  sessionId: bigint("sessionId", { mode: "number" }).notNull(),
  itemId: integer("itemId").notNull(),
  batchId: integer("batchId"),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export type SessionConsumable = typeof sessionConsumables.$inferSelect;
export type InsertSessionConsumable = typeof sessionConsumables.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Purchase orders & delivery tracking
// ─────────────────────────────────────────────────────────────────────────────
export const purchaseOrders = pgTable("purchase_orders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  /** Friendly reference, e.g. "PO-2026-004" */
  poNumber: varchar("poNumber", { length: 40 }).notNull(),
  supplier: varchar("supplier", { length: 160 }).notNull(),
  status: purchaseOrderStatus("status").default("ordered").notNull(),
  expectedDeliveryDate: date("expectedDeliveryDate", { mode: "string" }).notNull(),
  actualDeliveryDate: date("actualDeliveryDate", { mode: "string" }),
  itemsSummary: text("itemsSummary"),
  notes: text("notes"),
  createdBy: varchar("createdBy", { length: 120 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}).enableRLS();

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

// Purchase order line items (which items/quantities are expected)
export const purchaseOrderLines = pgTable("purchase_order_lines", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  poId: integer("poId").notNull(),
  itemId: integer("itemId").notNull(),
  quantityOrdered: integer("quantityOrdered").notNull(),
  quantityReceived: integer("quantityReceived").default(0).notNull(),
}).enableRLS();

export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type InsertPurchaseOrderLine = typeof purchaseOrderLines.$inferInsert;
