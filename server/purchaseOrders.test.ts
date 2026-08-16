import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    listPurchaseOrders: vi.fn(),
    getPurchaseOrderById: vi.fn(),
    nextPoNumber: vi.fn(),
    createPurchaseOrder: vi.fn(),
    updatePurchaseOrder: vi.fn(),
    deletePurchaseOrder: vi.fn(),
    getDeliveryMetrics: vi.fn(),
    listBatches: vi.fn(),
    getStockTotals: vi.fn(),
    getDb: vi.fn().mockResolvedValue(null),
  };
});

// Resolve mocks after the module factory to avoid temporal-dead-zone errors
import * as db from "./db";

const mockDb = {
  listPurchaseOrders: db.listPurchaseOrders as ReturnType<typeof vi.fn>,
  getPurchaseOrderById: db.getPurchaseOrderById as ReturnType<typeof vi.fn>,
  nextPoNumber: db.nextPoNumber as ReturnType<typeof vi.fn>,
  createPurchaseOrder: db.createPurchaseOrder as ReturnType<typeof vi.fn>,
  updatePurchaseOrder: db.updatePurchaseOrder as ReturnType<typeof vi.fn>,
  deletePurchaseOrder: db.deletePurchaseOrder as ReturnType<typeof vi.fn>,
  getDeliveryMetrics: db.getDeliveryMetrics as ReturnType<typeof vi.fn>,
  listBatches: db.listBatches as ReturnType<typeof vi.fn>,
  getStockTotals: db.getStockTotals as ReturnType<typeof vi.fn>,
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-test",
      email: "admin@example.com",
      name: "Admin Test",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("purchaseOrders.create", () => {
  it("assigns the next PO number, creates the order with its lines", async () => {
    mockDb.nextPoNumber.mockResolvedValue("PO-2026-001");
    mockDb.createPurchaseOrder.mockResolvedValue({ id: 1, poNumber: "PO-2026-001" });

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.purchaseOrders.create({
      supplier: "Fresenius Medical Care",
      expectedDeliveryDate: "2026-09-01",
      itemsSummary: "Dialyzer FX CorDiax 800 x 20",
      notes: "Restock",
      lines: [{ itemId: 3, quantityOrdered: 20 }],
    });

    expect(mockDb.nextPoNumber).toHaveBeenCalledOnce();
    expect(mockDb.createPurchaseOrder).toHaveBeenCalledOnce();
    const [po, lines] = mockDb.createPurchaseOrder.mock.calls[0];
    expect(po.supplier).toBe("Fresenius Medical Care");
    expect(po.expectedDeliveryDate).toBe("2026-09-01");
    expect(lines).toEqual([{ itemId: 3, quantityOrdered: 20 }]);
    expect(result.poNumber).toBe("PO-2026-001");
  });

  it("rejects empty supplier", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.purchaseOrders.create({
        supplier: "",
        expectedDeliveryDate: "2026-09-01",
        lines: [{ itemId: 1, quantityOrdered: 5 }],
      })
    ).rejects.toThrow();
  });
});

describe("purchaseOrders.update — marking delivered", () => {
  it("updates status, actual delivery date and line received quantities", async () => {
    const poId = 7;
    mockDb.updatePurchaseOrder.mockResolvedValue({ id: poId, status: "delivered" });

    const caller = appRouter.createCaller(createAdminContext());
    await caller.purchaseOrders.update({
      id: poId,
      status: "delivered",
      actualDeliveryDate: "2026-08-16",
      lines: [
        { itemId: 1, quantityOrdered: 10, quantityReceived: 10 },
        { itemId: 2, quantityOrdered: 5, quantityReceived: 5 },
      ],
    });

    expect(mockDb.updatePurchaseOrder).toHaveBeenCalledOnce();
    const [id, data, lines] = mockDb.updatePurchaseOrder.mock.calls[0];
    expect(id).toBe(poId);
    expect(data.status).toBe("delivered");
    expect(data.actualDeliveryDate).toBe("2026-08-16");
    expect(lines).toEqual([
      { itemId: 1, quantityOrdered: 10, quantityReceived: 10 },
      { itemId: 2, quantityOrdered: 5, quantityReceived: 5 },
    ]);
  });
});

describe("stockMetrics.list — days-of-supply", () => {
  it("computes days of supply and picks next expected delivery from open POs", async () => {
    // Simulate: one item with 10 on hand, avg daily consumption 2 → 5 days of supply;
    // one open PO expected 2026-08-20 with 6 incoming.
    mockDb.getDeliveryMetrics.mockResolvedValue([
      {
        itemId: 1,
        name: "Dialyzer",
        category: "dialyzer",
        onHand: 10,
        minStockLevel: 5,
        reorderLevel: 8,
        avgDailyConsumption: 2,
        daysOfSupply: 5,
        lastDeliveryDate: "2026-08-01",
        nextDeliveryDate: "2026-08-20",
        incomingQty: 6,
      },
    ]);

    const caller = appRouter.createCaller(createAdminContext());
    const metrics = await caller.stockMetrics.list();

    expect(metrics).toHaveLength(1);
    expect(metrics[0].daysOfSupply).toBe(5);
    expect(metrics[0].nextDeliveryDate).toBe("2026-08-20");
    expect(metrics[0].incomingQty).toBe(6);
    expect(mockDb.getDeliveryMetrics).toHaveBeenCalledOnce();
  });
});

describe("calendar.list — events within selected month", () => {
  it("includes expected deliveries, expiring batches and low-stock items in month", async () => {
    mockDb.listPurchaseOrders.mockResolvedValue([
      {
        id: 1,
        poNumber: "PO-2026-001",
        supplier: "Baxter",
        expectedDeliveryDate: "2026-09-15",
        status: "ordered",
      },
    ]);
    mockDb.listBatches.mockResolvedValue([
      { id: 1, itemId: 2, expiryDate: "2026-09-10", quantityOnHand: 4, isQuarantined: false },
    ]);
    mockDb.getStockTotals.mockResolvedValue([
      { id: 2, name: "Saline", category: "saline", onHand: 4, minStockLevel: 10, reorderLevel: 20 },
    ]);

    const caller = appRouter.createCaller(createAdminContext());
    const events = await caller.calendar.list({ month: 8, year: 2026 });

    const delivery = events.find((e) => e.type === "delivery");
    const expiry = events.find((e) => e.type === "expiry");
    expect(delivery?.date).toBe("2026-09-15");
    expect(expiry?.date).toBe("2026-09-10");
    expect(events).toHaveLength(2); // low-stock events only emit when today falls in the requested month

    // Low-stock items ARE emitted when the requested month contains today
    const todayIso = new Date().toISOString().slice(0, 10);
    const [year, month] = todayIso.split("-").map(Number);
    const augEvents = await caller.calendar.list({ month: month - 1, year });
    const lowStock = augEvents.find((e) => e.type === "lowstock");
    expect(lowStock?.date).toBe(todayIso);
  });
});
