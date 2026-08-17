import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/inventory";
import { RotateCcw, AlertTriangle, CheckCircle2, Archive } from "lucide-react";

type CategoryKey = "All" | string;

const CATEGORY_ORDER: CategoryKey[] = [
  "All",
  "Dialyzer",
  "Bloodline",
  "Needles",
  "Saline",
  "Medications",
  "Disinfectants",
  "PPE",
  "PD Supplies",
];

export default function RotationPage() {
  const { data: rows, isLoading } = trpc.rotation.list.useQuery();
  const [filter, setFilter] = useState<CategoryKey>("All");

  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          (filter === "All" || r.category === filter) &&
          r.quantityOnHand > 0 &&
          !r.isQuarantined,
      ),
    [rows, filter],
  );

  // Oldest batch on top = first-in, first-out priority order
  const oldest = filtered[0];

  const expiryLabel = (days: number) => {
    if (days <= 0) return { text: "Expired", cls: "bg-destructive text-destructive-foreground" };
    if (days <= 30) return { text: `${days}d left`, cls: "bg-destructive/10 text-destructive" };
    if (days <= 60) return { text: `${days}d left`, cls: "bg-amber-500/10 text-amber-600" };
    if (days <= 90) return { text: `${days}d left`, cls: "bg-primary/10 text-primary" };
    return { text: `${days}d left`, cls: "bg-muted text-muted-foreground" };
  };

  const ageCls = (bucket: string) =>
    bucket === ">90d"
      ? "text-destructive"
      : bucket === "61–90d"
        ? "text-amber-600"
        : bucket === "31–60d"
          ? "text-primary"
          : "text-muted-foreground";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            <RotateCcw className="h-8 w-8 text-primary" />
            Stock Rotation — First In, First Out
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Batches are arranged first-in, first-out: use the top row of each table before anything below it to keep stock fresh
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORY_ORDER.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={filter === c ? "default" : "outline"}
              onClick={() => setFilter(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="glass">
          <CardContent className="flex items-center gap-3 py-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <RotateCcw className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl font-bold leading-tight">{filtered.length}</div>
              <div className="text-sm text-muted-foreground">Active batches in rotation</div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="flex items-center gap-3 py-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl font-bold leading-tight">
                {filtered.filter((r) => r.daysUntilExpiry <= 30 && r.daysUntilExpiry > 0).length}
              </div>
              <div className="text-sm text-muted-foreground">Batches expiring within 30 days</div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="flex items-center gap-3 py-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl font-bold leading-tight">
                {filtered.filter((r) => r.ageBucket === "≤30d" || r.ageBucket === "31–60d").length}
              </div>
              <div className="text-sm text-muted-foreground">Fresh batches (≤60 days on shelf)</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <Archive className="h-5 w-5 text-primary" />
            {filter === "All" ? "All stock — FIFO priority order" : `${filter} stock — FIFO priority order`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Rows are sorted by the date each batch was received — the <strong>first in is first out</strong>.
            Pull from the top of the list for every session; quarantine rows are already removed from use.
            When two batches arrived on the same day, the one expiring sooner goes first.
          </p>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <RotateCcw className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-base">No stock in rotation</p>
              <p className="mt-1 text-sm">Stock-in some batches to see the FIFO tables here</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-muted-foreground">
                      <th className="py-2.5 pr-3 font-medium">#</th>
                      <th className="py-2.5 pr-3 font-medium">Item</th>
                      <th className="py-2.5 pr-3 font-medium">Lot</th>
                      <th className="py-2.5 pr-3 font-medium">On hand</th>
                      <th className="py-2.5 pr-3 font-medium">Received</th>
                      <th className="py-2.5 pr-3 font-medium">Age on shelf</th>
                      <th className="py-2.5 pr-3 font-medium">Expires</th>
                      <th className="py-2.5 pr-3 font-medium">Shelf life left</th>
                      <th className="py-2.5 font-medium">Use order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, idx) => {
                      const first = idx === 0;
                      const exp = expiryLabel(r.daysUntilExpiry);
                      return (
                        <tr key={r.batchId} className="border-b border-border/40 last:border-0">
                          <td className="py-2.5 pr-3 text-muted-foreground">{idx + 1}</td>
                          <td className="py-2.5 pr-3">
                            <div className="font-medium">{r.itemName}</div>
                            <div className="text-xs text-muted-foreground">{r.category}{r.supplier ? ` · ${r.supplier}` : ""}</div>
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-xs">{r.lotNumber}</td>
                          <td className="py-2.5 pr-3 font-semibold">{r.quantityOnHand}</td>
                          <td className="py-2.5 pr-3">{formatDate(r.receivedAt)}</td>
                          <td className={`py-2.5 pr-3 font-medium ${ageCls(r.ageBucket)}`}>{r.ageBucket}</td>
                          <td className="py-2.5 pr-3">{formatDate(r.expiryDate)}</td>
                          <td className="py-2.5 pr-3">
                            <Badge variant="outline" className={exp.cls}>{exp.text}</Badge>
                          </td>
                          <td className="py-2.5">
                            {first ? (
                              <Badge className="bg-primary text-primary-foreground">Use first</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">After #{idx}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                <span>
                  Next to issue: <strong>{oldest?.itemName ?? "—"}</strong> — LOT {oldest?.lotNumber ?? "—"} · {oldest ? `${oldest.quantityOnHand} units · expires ${formatDate(oldest.expiryDate)}` : ""}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-xl">Fresh batches</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <FreshTable rows={filtered.filter((r) => r.ageBucket === "≤30d" || r.ageBucket === "31–60d")} />
            )}
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Aging stock — use soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <FreshTable rows={filtered.filter((r) => r.ageBucket === "61–90d" || r.ageBucket === ">90d")} emphasizeAge />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FreshTable({ rows, emphasizeAge }: { rows: ReturnType<typeof Object.values> extends never ? never : { batchId: number; itemName: string; lotNumber: string; quantityOnHand: number; receivedAt: string; expiryDate: string; ageBucket: string; daysUntilExpiry: number }[]; emphasizeAge?: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
        <CheckCircle2 className="mb-3 h-9 w-9 opacity-40" />
        <p className="text-sm">None — all stock is current</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Item</th>
            <th className="py-2 pr-3 font-medium">Lot</th>
            <th className="py-2 pr-3 font-medium">On hand</th>
            <th className="py-2 pr-3 font-medium">Received</th>
            <th className="py-2 pr-3 font-medium">Age</th>
            <th className="py-2 font-medium">Expires</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.batchId} className="border-b border-border/40 last:border-0">
              <td className="py-2 pr-3 font-medium">{r.itemName}</td>
              <td className="py-2 pr-3 font-mono text-xs">{r.lotNumber}</td>
              <td className="py-2 pr-3 font-semibold">{r.quantityOnHand}</td>
              <td className="py-2 pr-3">{formatDate(r.receivedAt)}</td>
              <td className={`py-2 pr-3 font-medium ${emphasizeAge ? "text-destructive" : "text-muted-foreground"}`}>{r.ageBucket}</td>
              <td className="py-2">{formatDate(r.expiryDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
