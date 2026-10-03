import { COOKIE_NAME, SESSION_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { checkCredentials, createSessionToken } from "./_core/auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { batches } from "../drizzle/schema";

const categoryEnum = z.enum([
  "dialyzer",
  "bloodline",
  "needles",
  "saline",
  "medications",
  "disinfectants",
  "PPE",
  "PD supplies",
]);
const reasonEnum = z.enum(["issued", "adjusted", "written off", "returned"]);

/** Signed whole-day difference between two ISO date strings (b - a). */
function daysBetween(a: string, b: string): number {
  const ms = new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime();
  return Math.round(ms / 86_400_000);
}
const sessionTypeEnum = z.enum(["HD", "PD"]);

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure
      .input(z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) }))
      .mutation(async ({ input, ctx }) => {
        const user = await checkCredentials(input.username.trim().toLowerCase(), input.password);
        if (!user) {
          // One message for a wrong password, an unknown username and a locked
          // username, so the reply does not reveal which usernames exist.
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message:
              "Username or password is incorrect. A username is locked for 15 minutes after 5 failed attempts.",
          });
        }
        await db.touchLastSignedIn(user.id);
        ctx.res.cookie(COOKIE_NAME, await createSessionToken(user.id), {
          ...getSessionCookieOptions(ctx.req),
          maxAge: SESSION_MS,
        });
        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ── Items ──────────────────────────────────────────────────────────────────
  items: router({
    list: protectedProcedure.query(() => db.listItems()),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getItemById(input.id)),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          category: categoryEnum,
          unitOfMeasure: z.string().min(1),
          minStockLevel: z.number().int().min(0),
          reorderLevel: z.number().int().min(0),
          description: z.string().optional(),
        })
      )
      .mutation(({ input }) => db.createItem(input)),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1),
          category: categoryEnum,
          unitOfMeasure: z.string().min(1),
          minStockLevel: z.number().int().min(0),
          reorderLevel: z.number().int().min(0),
          description: z.string().optional(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...rest } = input;
        return db.updateItem(id, rest);
      }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteItem(input.id)),
  }),

  // ── Batches ────────────────────────────────────────────────────────────────
  batches: router({
    list: protectedProcedure
      .input(z.object({ itemId: z.number().optional() }).optional())
      .query(({ input }) => db.listBatches(input)),
    create: protectedProcedure
      .input(
        z.object({
          itemId: z.number(),
          lotNumber: z.string().min(1),
          supplier: z.string().optional(),
          quantityReceived: z.number().int().min(1),
          expiryDate: z.string(), // YYYY-MM-DD
        })
      )
      .mutation(({ input }) => db.createBatch({ ...input, quantityOnHand: input.quantityReceived })),
  }),

  // ── Stock transactions ─────────────────────────────────────────────────────
  transactions: router({
    list: protectedProcedure.query(() => db.listTransactions()),

    stockIn: protectedProcedure
      .input(
        z.object({
          itemId: z.number(),
          lotNumber: z.string().min(1),
          supplier: z.string().min(1),
          quantity: z.number().int().min(1),
          expiryDate: z.string(), // YYYY-MM-DD
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const batch = await db.createBatch({
          itemId: input.itemId,
          lotNumber: input.lotNumber,
          supplier: input.supplier,
          quantityReceived: input.quantity,
          quantityOnHand: input.quantity,
          expiryDate: input.expiryDate,
        });
        return db.createTransaction({
          itemId: input.itemId,
          batchId: batch.id,
          type: "stock-in",
          reason: "issued",
          quantity: input.quantity,
          supplier: input.supplier,
          lotNumber: input.lotNumber,
          expiryDate: input.expiryDate,
          notes: input.notes,
          performedBy: ctx.user.name ?? ctx.user.username,
        });
      }),

    stockOut: protectedProcedure
      .input(
        z.object({
          itemId: z.number(),
          quantity: z.number().int().min(1),
          reason: reasonEnum,
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const deductions = await db.deductFefo(input.itemId, input.quantity);
        const first = deductions[0];
        return db.createTransaction({
          itemId: input.itemId,
          batchId: first.batchId,
          type: "stock-out",
          reason: input.reason,
          quantity: input.quantity,
          lotNumber: null,
          expiryDate: null,
          notes: input.notes,
          performedBy: ctx.user.name ?? ctx.user.username,
        });
      }),
  }),

  // ── Stock dashboard (aggregated) ───────────────────────────────────────────
  stock: router({
    totals: protectedProcedure.query(async () => {
      const totals = await db.getStockTotals();
      const batchesAll = await db.listBatches();
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const within = (days: number) => {
        const x = new Date(today);
        x.setDate(x.getDate() + days);
        return x.toISOString().slice(0, 10);
      };
      return totals.map((item) => {
        const itemBatches = batchesAll.filter((b) => b.itemId === item.id);
        const expired = itemBatches.filter(
          (b) => b.quantityOnHand > 0 && b.expiryDate < todayStr && !b.isQuarantined
        );
        const expiring30 = itemBatches.filter(
          (b) => b.quantityOnHand > 0 && b.expiryDate >= todayStr && b.expiryDate <= within(30)
        );
        const expiring60 = itemBatches.filter(
          (b) => b.quantityOnHand > 0 && b.expiryDate > within(30) && b.expiryDate <= within(60)
        );
        const expiring90 = itemBatches.filter(
          (b) => b.quantityOnHand > 0 && b.expiryDate > within(60) && b.expiryDate <= within(90)
        );
        const quarantineQty = itemBatches
          .filter((b) => b.isQuarantined)
          .reduce((s, b) => s + b.quantityOnHand, 0);
        return {
          ...item,
          isExpired: expired.length > 0,
          expiring30Qty: expiring30.reduce((s, b) => s + b.quantityOnHand, 0),
          expiring60Qty: expiring60.reduce((s, b) => s + b.quantityOnHand, 0),
          expiring90Qty: expiring90.reduce((s, b) => s + b.quantityOnHand, 0),
          expiredQty: expired.reduce((s, b) => s + b.quantityOnHand, 0),
          quarantineQty,
          isLowStock: item.onHand <= item.reorderLevel,
          isCritical: item.onHand <= item.minStockLevel,
        };
      });
    }),

    itemBatches: protectedProcedure.input(z.object({ itemId: z.number() })).query(async ({ input }) => {
      return db.getBatchesByItem(input.itemId);
    }),

    quarantine: protectedProcedure
      .input(z.object({ batchId: z.number(), isQuarantined: z.boolean() }))
      .mutation(async ({ input }) => {
        const dbs = await db.getDb();
        if (!dbs) throw new Error("Database unavailable");
        await dbs.update(batches).set({ isQuarantined: input.isQuarantined }).where(eq(batches.id, input.batchId));
        return { success: true } as const;
      }),
  }),

  // ── Consumption ────────────────────────────────────────────────────────────
  templates: router({
    list: protectedProcedure.query(() => db.listTemplates()),
    create: protectedProcedure
      .input(
        z.object({
          sessionType: sessionTypeEnum,
          itemId: z.number(),
          defaultQty: z.number().int().min(1),
          label: z.string().optional(),
        })
      )
      .mutation(({ input }) => db.createTemplate(input)),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteTemplate(input.id)),
  }),

  sessions: router({
    list: protectedProcedure.query(() => db.listSessions()),
    listWithLines: protectedProcedure.query(() => db.listSessionsWithLines()),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const session = await db.getSessionById(input.id);
      if (!session) return undefined;
      const lines = await db.getSessionConsumables(session.id);
      return { ...session, lines };
    }),
    create: protectedProcedure
      .input(
        z.object({
          patientName: z.string().min(1),
          chair: z.string().min(1),
          shift: z.enum(["morning", "afternoon", "evening"]),
          sessionType: sessionTypeEnum,
          sessionDate: z.string(),
          lines: z.array(
            z.object({
              itemId: z.number(),
              quantity: z.number().int().min(1),
            })
          ),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const session = await db.createSession({
          patientName: input.patientName,
          chair: input.chair,
          shift: input.shift,
          sessionType: input.sessionType,
          sessionDate: input.sessionDate,
          createdBy: ctx.user.name ?? ctx.user.username,
        });
        // Deduct FEFO per line and record
        const recorded: { itemId: number; batchId: number | null; quantity: number }[] = [];
        for (const line of input.lines) {
          try {
            const deductions = await db.deductFefo(line.itemId, line.quantity);
            recorded.push({ itemId: line.itemId, batchId: deductions[0].batchId, quantity: line.quantity });
          } catch {
            recorded.push({ itemId: line.itemId, batchId: null, quantity: line.quantity });
          }
        }
        await db.createSessionConsumables(session.id, recorded);
        await db.completeSession(session.id);
        return session;
      }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      // Restore stock when deleting a completed session is not supported to
      // preserve ledger integrity — surface a clear error instead.
      throw new Error("Cannot delete recorded sessions to preserve the audit trail.");
    }),
  }),

  // ── Reports ────────────────────────────────────────────────────────────────
  reports: router({
    consumption: protectedProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .query(async ({ input }) => {
        const sessions = (await db.listSessions()).filter(
          (s) => s.sessionDate >= input.startDate && s.sessionDate <= input.endDate
        );
        // Include deleted (inactive) items: past consumption still has to be
        // reported under its item, and a missing item crashes the page.
        const allItems = await db.listItems(true);
        const itemMap = new Map(allItems.map((i) => [i.id, i]));
        // Fetch all lines for the matched sessions in a single query
        // (avoids one DB round-trip per session).
        type LineRow = Awaited<ReturnType<typeof db.getSessionConsumablesByIds>>[number];
        const linesBySession = new Map<number, LineRow[]>();
        for (const l of sessions.length > 0 ? await db.getSessionConsumablesByIds(sessions.map((s) => s.id)) : []) {
          const list = linesBySession.get(l.sessionId) ?? [];
          list.push(l);
          linesBySession.set(l.sessionId, list);
        }
        const perItem = new Map<number, { item: (typeof allItems)[0]; qty: number; sessions: number }>();
        const perCategory = new Map<string, { category: string; qty: number; sessions: number }>();
        const perShift = new Map<string, number>();
        const perDay = new Map<string, number>();
        for (const s of sessions) {
          const lines = linesBySession.get(s.id) ?? [];
          for (const l of lines) {
            const item = itemMap.get(l.itemId);
            const cur = perItem.get(l.itemId) ?? { item: item!, qty: 0, sessions: 0 };
            cur.qty += l.quantity;
            cur.sessions += 1;
            perItem.set(l.itemId, cur);
            if (item) {
              const c = perCategory.get(item.category) ?? { category: item.category, qty: 0, sessions: 0 };
              c.qty += l.quantity;
              c.sessions += 1;
              perCategory.set(item.category, c);
            }
          }
          perShift.set(s.shift, (perShift.get(s.shift) ?? 0) + lines.reduce((sum, l) => sum + l.quantity, 0));
          perDay.set(s.sessionDate, (perDay.get(s.sessionDate) ?? 0) + lines.reduce((sum, l) => sum + l.quantity, 0));
        }
        return {
          sessionCount: sessions.length,
          perItem: Array.from(perItem.values()),
          perCategory: Array.from(perCategory.values()),
          perShift: Array.from(perShift.entries()).map(([shift, qty]) => ({ shift, qty })),
          perDay: Array.from(perDay.entries())
            .map(([date, qty]) => ({ date, qty }))
            .sort((a, b) => a.date.localeCompare(b.date)),
                };
      }),
  }),
  purchaseOrders: router({
    list: protectedProcedure.query(() => db.listPurchaseOrders()),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getPurchaseOrderById(input.id)),
    create: protectedProcedure
      .input(
        z.object({
          supplier: z.string().min(1),
          expectedDeliveryDate: z.string().min(8),
          itemsSummary: z.string().optional(),
          notes: z.string().optional(),
          lines: z.array(z.object({ itemId: z.number(), quantityOrdered: z.number().min(1) })).default([]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const poNumber = await db.nextPoNumber();
        return db.createPurchaseOrder(
          {
            poNumber,
            supplier: input.supplier,
            status: "ordered",
            expectedDeliveryDate: input.expectedDeliveryDate,
            itemsSummary: input.itemsSummary ?? null,
            notes: input.notes ?? null,
            createdBy: ctx.user.name ?? undefined,
          },
          input.lines
        );
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["ordered", "partially-delivered", "delivered", "cancelled"]).optional(),
          expectedDeliveryDate: z.string().min(8).optional(),
          actualDeliveryDate: z.string().min(8).nullable().optional(),
          notes: z.string().optional(),
          lines: z.array(z.object({ itemId: z.number(), quantityOrdered: z.number().min(1), quantityReceived: z.number().min(0).optional() })).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return db.updatePurchaseOrder(id, data, input.lines);
      }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deletePurchaseOrder(input.id)),
  }),

  /** Per-item stock-level metrics: days of supply, last/next delivery, incoming qty */
  stockMetrics: router({
    list: protectedProcedure.query(() => db.getDeliveryMetrics()),
  }),

  /** FIFO stock rotation: batches ordered earliest-received first so oldest stock is used first */
  rotation: router({
    list: protectedProcedure.query(async () => {
      const [batchRows, itemRows] = await Promise.all([db.listBatches(), db.listItems()]);
      const itemById = new Map(itemRows.map((i) => [i.id, i]));
      const todayIso = new Date().toISOString().slice(0, 10);

      const rows = batchRows.map((b) => {
        const item = itemById.get(b.itemId);
        const receivedAt = b.createdAt instanceof Date ? b.createdAt.toISOString().slice(0, 10) : String(b.createdAt).slice(0, 10);
        const daysOnShelf = Math.max(0, daysBetween(receivedAt, todayIso));
        const daysUntilExpiry = daysBetween(todayIso, b.expiryDate);
        const ageBucket = daysOnShelf > 90 ? ">90d" : daysOnShelf > 60 ? "61–90d" : daysOnShelf > 30 ? "31–60d" : "≤30d";
        return {
          batchId: b.id,
          itemId: b.itemId,
          itemName: item?.name ?? `Item #${b.itemId}`,
          category: item?.category ?? "other",
          lotNumber: b.lotNumber,
          supplier: b.supplier,
          quantityReceived: b.quantityReceived,
          quantityOnHand: b.quantityOnHand,
          expiryDate: b.expiryDate,
          isQuarantined: b.isQuarantined,
          receivedAt,
          daysOnShelf,
          daysUntilExpiry,
          ageBucket,
        };
      });

      // FIFO: earliest received first; tie-break by earliest expiry
      return rows.sort((a, b) => {
        if (a.receivedAt === b.receivedAt) return a.expiryDate.localeCompare(b.expiryDate);
        return a.receivedAt.localeCompare(b.receivedAt);
      });
    }),
  }),

  /** Calendar events for the delivery calendar: deliveries, expiry, low stock */
  calendar: router({
    list: protectedProcedure
      .input(z.object({ month: z.number().min(0).max(11), year: z.number().min(2024).max(2100) }))
      .query(async ({ input }) => {
        const [poRows, batchRows, stockTotalRows] = await Promise.all([
          db.listPurchaseOrders(),
          db.listBatches(),
          db.getStockTotals(),
        ]);
        const itemById = new Map(stockTotalRows.map((i) => [i.id, i]));
        const first = new Date(input.year, input.month, 1).toISOString().slice(0, 10);
        const last = new Date(input.year, input.month + 1, 0).toISOString().slice(0, 10);
        const inMonth = (iso: string) => iso >= first && iso <= last;
        const todayIso = new Date().toISOString().slice(0, 10);

        const events: { date: string; type: "delivery" | "expiry" | "lowstock"; title: string; subtitle: string; severity: "info" | "warning" | "danger" }[] = [];

        // Expected deliveries (POs with expected date in month)
        poRows.forEach((po) => {
          if (inMonth(po.expectedDeliveryDate)) {
            events.push({
              date: po.expectedDeliveryDate,
              type: "delivery",
              title: `${po.poNumber} · ${po.supplier}`,
              subtitle: po.status === "delivered" ? "Delivered" : po.status === "partially-delivered" ? "Partially delivered" : "Expected delivery",
              severity: po.status === "delivered" ? "warning" : "info",
            });
          }
        });

        // Expiry events: batches expiring within the month
        batchRows.forEach((b) => {
          if (inMonth(b.expiryDate) && b.quantityOnHand > 0 && !b.isQuarantined) {
            const item = itemById.get(b.itemId);
            events.push({
              date: b.expiryDate,
              type: "expiry",
              title: `${item?.name ?? `Item #${b.itemId}`} · LOT ${b.lotNumber}`,
              subtitle: `${b.quantityOnHand} ${item?.unitOfMeasure ?? "units"} expiring`,
              severity: b.expiryDate < todayIso ? "danger" : "warning",
            });
          }
        });

        // Low stock: items at or below reorder level, marked for today
        if (inMonth(todayIso)) {
          stockTotalRows
            .filter((i) => i.onHand <= i.reorderLevel)
            .forEach((i) => {
              events.push({
                date: todayIso,
                type: "lowstock",
                title: `${i.name} — low stock`,
                subtitle: `${i.onHand} ${i.unitOfMeasure} on hand (reorder ${i.reorderLevel})`,
                severity: i.onHand <= i.minStockLevel ? "danger" : "warning",
              });
            });
        }

        return events.sort((a, b) => a.date.localeCompare(b.date));
      }),
  }),
});

export type AppRouter = typeof appRouter;

