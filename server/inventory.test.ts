import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// ── Mock the db module so tests run without a real database connection ───────
const mockListItems = vi.fn();
const mockCreateBatch = vi.fn();
const mockCreateTransaction = vi.fn();
const mockDeductFefo = vi.fn();
const mockCreateSession = vi.fn();
const mockCreateSessionConsumables = vi.fn();
const mockCompleteSession = vi.fn();
const mockListSessions = vi.fn();
const mockGetSessionConsumables = vi.fn();
const mockGetSessionConsumablesByIds = vi.fn();

const mockListTemplates = vi.fn();
const mockListBatches = vi.fn();
const mockListTransactions = vi.fn();
const mockGetStockTotals = vi.fn();
const mockGetSessionById = vi.fn();
const mockCreateItem = vi.fn();
const mockUpdateItem = vi.fn();
const mockDeleteItem = vi.fn();
const mockDeleteTemplate = vi.fn();
const mockDeleteSession = vi.fn();

vi.mock("./db", () => ({
  getDb: async () => null,
  listItems: (...args: unknown[]) => mockListItems(...args),
  getItemById: async () => undefined,
  createItem: (...args: unknown[]) => mockCreateItem(...args),
  updateItem: (...args: unknown[]) => mockUpdateItem(...args),
  deleteItem: (...args: unknown[]) => mockDeleteItem(...args),
  listBatches: (...args: unknown[]) => mockListBatches(...args),
  getBatchesByItem: async () => [],
  createBatch: (...args: unknown[]) => mockCreateBatch(...args),
  listTransactions: (...args: unknown[]) => mockListTransactions(...args),
  createTransaction: (...args: unknown[]) => mockCreateTransaction(...args),
  deductFefo: (...args: unknown[]) => mockDeductFefo(...args),
  getStockTotals: (...args: unknown[]) => mockGetStockTotals(...args),
  listTemplates: (...args: unknown[]) => mockListTemplates(...args),
  createTemplate: async () => undefined,
  deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
  listSessions: (...args: unknown[]) => mockListSessions(...args),
  getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  completeSession: (...args: unknown[]) => mockCompleteSession(...args),
  deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
  getSessionConsumables: (...args: unknown[]) => mockGetSessionConsumables(...args),
  getSessionConsumablesByIds: (...args: unknown[]) => mockGetSessionConsumablesByIds(...args),
  createSessionConsumables: (...args: unknown[]) => mockCreateSessionConsumables(...args),
}));

type CookieCall = { name: string; options: Record<string, unknown> };
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctx(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const clearedCookies: CookieCall[] = [];
  return {
    user: {
      id: 1,
      username: "test-user",
      name: "Nurse Test",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => clearedCookies.push({ name, options }),
    } as unknown as TrpcContext["res"],
  };
}

describe("transactions.stockIn", () => {
  it("creates a batch and a stock-in transaction record", async () => {
    mockCreateBatch.mockResolvedValueOnce({ id: 7, quantityOnHand: 20 });
    mockCreateTransaction.mockResolvedValueOnce({ id: 1, type: "stock-in" } as never);

    const caller = appRouter.createCaller(ctx());
    const result = await caller.transactions.stockIn({
      itemId: 3,
      supplier: "Fresenius Kabi",
      lotNumber: "LOT-2502",
      quantity: 20,
      expiryDate: "2027-06-01",
    });

    expect(result.type).toBe("stock-in");
    expect(mockCreateBatch).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 3, lotNumber: "LOT-2502", quantityOnHand: 20 })
    );
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "stock-in", reason: "issued", performedBy: "Nurse Test" })
    );
  });

  it("rejects stock-in for anonymous users", async () => {
    const caller = appRouter.createCaller({ ...ctx(), user: null } as TrpcContext);
    await expect(
      caller.transactions.stockIn({
        itemId: 3,
        supplier: "X",
        lotNumber: "L1",
        quantity: 1,
        expiryDate: "2027-01-01",
      })
    ).rejects.toThrow();
  });
});

describe("transactions.stockOut", () => {
  it("deducts via FEFO and records a stock-out transaction", async () => {
    mockDeductFefo.mockResolvedValueOnce([{ batchId: 4, qty: 5 }]);
    mockCreateTransaction.mockResolvedValueOnce({ id: 2 } as never);

    const caller = appRouter.createCaller(ctx());
    const result = await caller.transactions.stockOut({
      itemId: 3,
      quantity: 5,
      reason: "issued",
    });

    expect(mockDeductFefo).toHaveBeenCalledWith(3, 5);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "stock-out", reason: "issued", batchId: 4, quantity: 5 })
    );
    expect(result).toBeTruthy();
  });

  it("rejects invalid reason codes", async () => {
    const caller = appRouter.createCaller(ctx());
    await expect(
      // @ts-expect-error testing schema validation
      caller.transactions.stockOut({ itemId: 3, quantity: 1, reason: "stolen" })
    ).rejects.toThrow();
  });
});

describe("sessions.create", () => {
  it("creates a session, records consumables per line, and completes it", async () => {
    mockCreateSession.mockResolvedValueOnce({ id: 11 } as never);
    mockDeductFefo
      .mockResolvedValueOnce([{ batchId: 1, qty: 1 }])
      .mockResolvedValueOnce([{ batchId: 2, qty: 2 }]);
    mockCreateSessionConsumables.mockResolvedValueOnce([]);
    mockCompleteSession.mockResolvedValueOnce(undefined);

    const caller = appRouter.createCaller(ctx());
    const result = await caller.sessions.create({
      patientName: "Patient A",
      chair: "1",
      shift: "morning",
      sessionType: "HD",
      sessionDate: "2026-08-16",
      lines: [
        { itemId: 1, quantity: 1 },
        { itemId: 2, quantity: 2 },
      ],
    });

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionType: "HD", shift: "morning", createdBy: "Nurse Test" })
    );
    expect(mockDeductFefo).toHaveBeenCalledTimes(2);
    expect(mockCompleteSession).toHaveBeenCalledWith(11);
    expect(result).toEqual({ id: 11 });
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("stock.totals", () => {
  it("computes low-stock and expiry alert flags", async () => {
    mockGetStockTotals.mockResolvedValueOnce([
      {
        id: 1,
        name: "FX 60",
        category: "dialyzer",
        unitOfMeasure: "unit",
        minStockLevel: 10,
        reorderLevel: 20,
        description: null,
        isActive: true,
        onHand: 15,
      },
    ] as never);
    mockListBatches.mockResolvedValueOnce([
      {
        id: 1,
        itemId: 1,
        lotNumber: "L1",
        supplier: "X",
        quantityReceived: 20,
        quantityOnHand: 15,
        expiryDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10), // within 30 days
        isQuarantined: false,
      },
    ] as never);

    const caller = appRouter.createCaller(ctx());
    const totals = await caller.stock.totals();

    expect(totals[0].isLowStock).toBe(true);
    expect(totals[0].expiring30Qty).toBe(15);
  });
});

describe("reports.consumption", () => {
  it("still reports consumption of an item that was later deleted", async () => {
    mockListSessions.mockResolvedValueOnce([{ id: 1, sessionDate: "2026-10-02", shift: "morning" }] as never);
    // listItems(true) includes inactive items; the deleted one must still resolve.
    mockListItems.mockImplementationOnce(async (includeInactive?: boolean) =>
      includeInactive
        ? [{ id: 9, name: "Deleted Saline", category: "saline", unitOfMeasure: "bag", isActive: false }]
        : []
    );
    mockGetSessionConsumablesByIds.mockResolvedValueOnce([{ sessionId: 1, itemId: 9, quantity: 3 }] as never);

    const report = await appRouter
      .createCaller(ctx())
      .reports.consumption({ startDate: "2026-10-01", endDate: "2026-10-31" });

    expect(report.perItem).toHaveLength(1);
    expect(report.perItem[0].item.name).toBe("Deleted Saline");
    expect(report.perCategory[0]).toMatchObject({ category: "saline", qty: 3 });
  });
});

// Real-DB FEFO test lives in server/fefo.test.ts (separate module to avoid
// vitest mock pollution with the mocked ./db used here).
