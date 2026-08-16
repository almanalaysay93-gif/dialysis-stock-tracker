import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CATEGORY_META,
  daysUntil,
  expiryStatus,
  formatDate,
  stockHealth,
} from "@/lib/inventory";
import type { StockTotal } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArchiveX,
  Box,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  Layers,
  ShieldAlert,
  Snowflake,
} from "lucide-react";
import { Link } from "wouter";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: typeof HeartPulse;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "neutral" | "danger" | "warning" | "ok" | "info";
}) {
  const toneCls = {
    neutral: "text-primary bg-primary/8 border border-primary/10",
    danger: "text-danger bg-destructive/8 border border-destructive/15",
    warning: "text-warning bg-warning/10 border border-warning/20",
    ok: "text-ok bg-ok/8 border border-ok/12",
    info: "text-info bg-info/8 border border-info/10",
  }[tone];
  return (
    <Card className="animate-in-rise">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] text-muted-foreground font-medium">{label}</p>
            <p className="text-4xl font-display font-semibold tracking-tight mt-1">{value}</p>
            {sub ? <p className="text-sm text-muted-foreground mt-1">{sub}</p> : null}
          </div>
          <div className={`rounded-2xl p-3 ${toneCls}`}>
            <Icon className="h-7 w-7" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExpiryPill({ qty, days, color }: { qty: number; days: string; color: string }) {
  if (qty <= 0) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${color}`}>
      <Snowflake className="h-4 w-4" />
      {qty} {days}
    </span>
  );
}

export default function Dashboard() {
  const { data: totals, isLoading } = trpc.stock.totals.useQuery();

  const alerts = (totals ?? []).filter(
    (t) => t.isExpired || t.expiring30Qty > 0 || t.isLowStock || t.quarantineQty > 0
  );

  return (
    <div className="space-y-6 animate-in-fade max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight">Stock Overview</h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            Real-time visibility across all consumable stock
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Expiry thresholds: 30 / 60 / 90 days · FEFO rotation enforced
        </p>
      </div>

      {isLoading || !totals ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Layers}
              label="SKUs tracked"
              value={totals.length}
              sub={`${totals.filter((t) => t.onHand > 0).length} with stock on hand`}
            />
            <StatCard
              icon={HeartPulse}
              label="Units on hand"
              value={totals.reduce((s, t) => s + t.onHand, 0).toLocaleString()}
              sub="All categories combined"
            />
            <StatCard
              icon={AlertTriangle}
              label="Low stock items"
              value={totals.filter((t) => t.isLowStock).length}
              sub="At or below reorder level"
              tone={totals.some((t) => t.isLowStock) ? "warning" : "neutral"}
            />
            <StatCard
              icon={ArchiveX}
              label="Expired stock"
              value={totals.filter((t) => t.isExpired).length}
              sub="Units flagged for quarantine"
              tone={totals.some((t) => t.isExpired) ? "danger" : "neutral"}
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-[17px] flex items-center gap-2.5">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Expiry watchlist
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(totals ?? [])
                    .filter((t) => t.expiring30Qty > 0 || t.expiring60Qty > 0 || t.expiring90Qty > 0 || t.isExpired)
                    .slice(0, 8)
                    .map((t) => (
                      <div
                        key={t.id}
                        className="glass rounded-2xl px-4 py-3 hover:shadow-md transition-shadow"
                      >
                        <div className="min-w-0">
                          <p className="text-[15px] font-medium truncate">{t.name}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {CATEGORY_META[t.category]?.label} · {t.onHand} on hand
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <ExpiryPill qty={t.expiring30Qty} days="≤30d" color="text-danger" />
                          <ExpiryPill qty={t.expiring60Qty} days="≤60d" color="text-warning" />
                          <ExpiryPill qty={t.expiring90Qty} days="≤90d" color="text-muted-foreground" />
                          {t.isExpired ? (
                            <Badge variant="destructive" className="shrink-0">
                              Expired
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  {(totals ?? []).every(
                    (t) => !t.isExpired && t.expiring30Qty === 0 && t.expiring60Qty === 0 && t.expiring90Qty === 0
                  ) ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <ShieldAlert className="h-9 w-9 text-ok mb-2" />
                      <p className="text-[15px] font-medium">All clear</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        No stock expiring within the next 90 days
                      </p>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[17px]">Category split</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(totals ?? [])
                    .filter((t) => t.onHand > 0)
                    .reduce(
                      (acc, t) => {
                        const cur = acc.get(t.category) ?? 0;
                        acc.set(t.category, cur + t.onHand);
                        return acc;
                      },
                      new Map<string, number>()
                    )
                    .entries()
                    .toArray()
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, qty]) => {
                      const max = Math.max(
                        ...Array.from(
                          (totals ?? []).reduce(
                            (acc, t) => {
                              const cur = acc.get(t.category) ?? 0;
                              acc.set(t.category, cur + t.onHand);
                              return acc;
                            },
                            new Map<string, number>()
                          ).values()
                        )
                      );
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="font-medium">{CATEGORY_META[cat]?.label}</span>
                            <span className="text-muted-foreground">{qty.toLocaleString()}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${(qty / max) * 100}%`,
                                background: CATEGORY_META[cat]?.accent,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-[17px] flex items-center gap-2.5">
                  <ClipboardList className="h-5 w-5 text-primary" />
                Items requiring attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Box className="h-9 w-9 text-ok mb-2" />
                  <p className="text-[15px] font-medium">Nothing needs attention</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    All stock levels are healthy and clear of expiry concerns
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {alerts.slice(0, 10).map((t) => (
                    <AlertRow key={t.id} t={t} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function AlertRow({ t }: { t: StockTotal }) {
  const health = stockHealth(t);
  const reasons: string[] = [];
  if (t.isExpired) reasons.push(`${t.expiredQty} units expired — quarantine for disposal`);
  if (t.isCritical) reasons.push("below minimum stock level");
  else if (t.isLowStock) reasons.push("at or below reorder level");
  if (t.quarantineQty > 0) reasons.push(`${t.quarantineQty} units quarantined`);
  return (
    <Link
      href="/transactions"
          className="flex items-center justify-between gap-3 py-3.5 group hover:bg-accent/50 rounded-xl px-3 -mx-3 transition-colors"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <span
          className={`h-3 w-3 rounded-full shrink-0 ${
            health === "danger" ? "bg-danger" : health === "warning" ? "bg-warning" : "bg-ok"
          }`}
        />
        <div className="min-w-0">
          <p className="text-[15px] font-medium truncate">{t.name}</p>
          <p className="text-sm text-muted-foreground truncate mt-0.5">{reasons.join(" · ")}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[15px] font-semibold tabular-nums">{t.onHand}</span>
        <span className="text-sm text-muted-foreground">{t.unitOfMeasure}</span>
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
      </div>
    </Link>
  );
}
