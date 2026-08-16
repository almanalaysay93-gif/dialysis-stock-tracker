import { COOKIE_NAME } from "@shared/const";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
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
const sessionTypeEnum = z.enum(["HD", "PD"]);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ── Items ──────────────────────────────────────────────────────────────────
  items: router({
    list: publicProcedure.query(() => db.listItems()),
    get: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getItemById(input.id)),
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
    list: publicProcedure
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
    list: publicProcedure.query(() => db.listTransactions()),

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
          performedBy: ctx.user.name ?? ctx.user.email ?? "System",
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
          performedBy: ctx.user.name ?? ctx.user.email ?? "System",
        });
      }),
  }),

  // ── Stock dashboard (aggregated) ───────────────────────────────────────────
  stock: router({
    totals: publicProcedure.query(async () => {
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

    itemBatches: publicProcedure.input(z.object({ itemId: z.number() })).query(async ({ input }) => {
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
    list: publicProcedure.query(() => db.listTemplates()),
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
    list: publicProcedure.query(() => db.listSessions()),
    listWithLines: publicProcedure.query(() => db.listSessionsWithLines()),
    get: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
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
          createdBy: ctx.user.name ?? ctx.user.email ?? "System",
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
    consumption: publicProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .query(async ({ input }) => {
        const sessions = (await db.listSessions()).filter(
          (s) => s.sessionDate >= input.startDate && s.sessionDate <= input.endDate
        );
        const allItems = await db.listItems();
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
});

export type AppRouter = typeof appRouter;
