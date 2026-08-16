export type Category =
  | "dialyzer"
  | "bloodline"
  | "needles"
  | "saline"
  | "medications"
  | "disinfectants"
  | "PPE"
  | "PD supplies";

export type Reason = "issued" | "adjusted" | "written off" | "returned";

export type SessionType = "HD" | "PD";

export interface Item {
  id: number;
  name: string;
  category: Category;
  unitOfMeasure: string;
  minStockLevel: number;
  reorderLevel: number;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Batch {
  id: number;
  itemId: number;
  lotNumber: string;
  supplier: string | null;
  quantityReceived: number;
  quantityOnHand: number;
  expiryDate: string;
  isQuarantined: boolean;
  createdAt: Date;
}

export interface StockTransaction {
  id: number;
  itemId: number;
  batchId: number | null;
  type: "stock-in" | "stock-out";
  reason: Reason;
  quantity: number;
  supplier: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
  notes: string | null;
  performedBy: string | null;
  performedAt: Date;
}

export interface StockTotal extends Item {
  onHand: number;
  isExpired: boolean;
  expiring30Qty: number;
  expiring60Qty: number;
  expiring90Qty: number;
  expiredQty: number;
  quarantineQty: number;
  isLowStock: boolean;
  isCritical: boolean;
}

export interface ConsumptionTemplate {
  id: number;
  sessionType: SessionType;
  itemId: number;
  defaultQty: number;
  label: string | null;
  isActive: boolean;
}

export interface TreatmentSession {
  id: number;
  patientName: string;
  chair: string;
  shift: "morning" | "afternoon" | "evening";
  sessionType: SessionType;
  sessionDate: string;
  status: "in-progress" | "completed";
  createdBy: string | null;
  createdAt: Date;
  lines?: SessionLine[];
}

export interface SessionLine {
  id: number;
  sessionId: number;
  itemId: number;
  batchId: number | null;
  quantity: number;
  createdAt: Date;
}

export interface ConsumptionReport {
  sessionCount: number;
  perItem: { item: Item; qty: number; sessions: number }[];
  perShift: { shift: string; qty: number }[];
  perDay: { date: string; qty: number }[];
}
