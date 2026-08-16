import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CATEGORY_META,
  SHIFT_LABEL,
  downloadCsv,
  formatDate,
} from "@/lib/inventory";
import { trpc } from "@/lib/trpc";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMemo, useState } from "react";

const NOW = new Date();
function isoDaysAgo(days: number) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const RANGE_DATES: Record<Exclude<string, "custom">, [number, number]> = {
  daily: [1, 0],
  weekly: [7, 0],
};

export default function Reports() {
  const [range, setRange] = useState<"daily" | "weekly" | "custom">("weekly");
  const [start, setStart] = useState(isoDaysAgo(7));
  const [end, setEnd] = useState(isoDaysAgo(0));

  function applyRange(v: string) {
    const r = v as "daily" | "weekly" | "custom";
    setRange(r);
    if (r !== "custom") {
      const [back, off] = RANGE_DATES[r];
      setStart(isoDaysAgo(back));
      setEnd(isoDaysAgo(off));
    }
  }

  const { data: report, isLoading } = trpc.reports.consumption.useQuery(
    { startDate: start, endDate: end },
    { enabled: !!start && !!end }
  );

  const totalQty = useMemo(
    () => report?.perItem.reduce((s, p) => s + p.qty, 0) ?? 0,
    [report]
  );

  function exportPerItem() {
    if (!report) return;
    downloadCsv(
      `consumption-by-item-${start}-to-${end}.csv`,
      [
        ["Item", "Category", "Unit", "Quantity used", "Sessions"],
        ...report.perItem.map((p) => [
          p.item.name,
          CATEGORY_META[p.item.category]?.label ?? p.item.category,
          p.item.unitOfMeasure,
          p.qty,
          p.sessions,
        ]),
      ]
    );
  }

  function exportPerCategory() {
    if (!report) return;
    downloadCsv(
      `consumption-by-category-${start}-to-${end}.csv`,
      [
        ["Category", "Quantity used", "Session lines"],
        ...report.perCategory
          .slice()
          .sort((a, b) => b.qty - a.qty)
          .map((c) => [
            CATEGORY_META[c.category as keyof typeof CATEGORY_META]?.label ?? c.category,
            c.qty,
            c.sessions,
          ]),
      ]
    );
  }

  function exportPerDay() {
    if (!report) return;
    downloadCsv(
      `consumption-by-day-${start}-to-${end}.csv`,
      [
        ["Date", "Items consumed"],
        ...report.perDay.map((d) => [d.date, d.qty]),
      ]
    );
  }

  return (
    <div className="space-y-6 animate-in-fade max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-display font-semibold tracking-tight">Consumption Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Daily and weekly summaries to support reorder forecasting
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Tabs value={range} onValueChange={applyRange}>
          <TabsList>
            <TabsTrigger value="daily">Last 24 hours</TabsTrigger>
            <TabsTrigger value="weekly">Last 7 days</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>
        </Tabs>
        {range === "custom" ? (
          <div className="flex gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="rep-start" className="text-xs">
                From
              </Label>
              <Input id="rep-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-end" className="text-xs">
                To
              </Label>
              <Input id="rep-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} max={isoDaysAgo(0)} />
            </div>
          </div>
        ) : null}
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={exportPerItem} disabled={!report}>
            Export by item
          </Button>
          <Button variant="outline" size="sm" onClick={exportPerCategory} disabled={!report}>
            Export by category
          </Button>
          <Button variant="outline" size="sm" onClick={exportPerDay} disabled={!report}>
            Export by day
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-20" />
            ) : (
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Sessions</dt>
                  <dd className="text-sm font-semibold tabular-nums">
                    {report?.sessionCount ?? 0}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Distinct items used</dt>
                  <dd className="text-sm font-semibold tabular-nums">
                    {report?.perItem.length ?? 0}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Total units consumed</dt>
                  <dd className="text-lg font-display font-semibold tabular-nums">
                    {totalQty.toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Period</dt>
                  <dd className="text-sm tabular-nums">
                    {formatDate(start)} – {formatDate(end)}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Consumption by day</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48" />
            ) : !report?.perDay.length ? (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No consumption recorded in this period
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={report.perDay} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(l) => formatDate(l)}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="qty" name="Units consumed" fill="oklch(0.42 0.09 200)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Consumption by item</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : !report?.perItem.length ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No items consumed in this period</p>
            </div>
          ) : (
            <div className="divide-y">
              {report.perItem
                .slice()
                .sort((a, b) => b.qty - a.qty)
                .map((p) => {
                  const max = report.perItem[0]?.qty ?? 1;
                  return (
                    <div key={p.item.id} className="py-3 flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.item.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {CATEGORY_META[p.item.category]?.label} · {p.item.unitOfMeasure} ·{" "}
                          {p.sessions} session{p.sessions === 1 ? "" : "s"}
                        </p>
                        <div className="h-1 rounded-full bg-muted overflow-hidden mt-1.5 max-w-md">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${(p.qty / max) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        {p.qty} {p.item.unitOfMeasure}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Consumption by category</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : !report?.perCategory.length ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No category data in this period</p>
            </div>
          ) : (
            <div className="divide-y">
              {report.perCategory
                .slice()
                .sort((a, b) => b.qty - a.qty)
                .map((c) => {
                  const max = report.perCategory[0]?.qty ?? 1;
                  return (
                    <div key={c.category} className="py-3 flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {CATEGORY_META[c.category as keyof typeof CATEGORY_META]?.label ??
                            c.category}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.sessions} line{c.sessions === 1 ? "" : "s"}
                        </p>
                        <div className="h-1 rounded-full bg-muted overflow-hidden mt-1.5 max-w-md">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${(c.qty / max) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        {c.qty.toLocaleString()} units
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Consumption by shift</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : !report?.perShift.length ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No shift data in this period</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-3 gap-4">
              {(["morning", "afternoon", "evening"] as const).map((s) => {
                const row = report.perShift.find((r) => r.shift === s);
                return (
                  <div key={s} className="rounded-lg border bg-card px-4 py-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      {SHIFT_LABEL[s]}
                    </p>
                    <p className="text-2xl font-display font-semibold tabular-nums mt-1">
                      {row?.qty ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">units consumed</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
