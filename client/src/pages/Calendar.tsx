import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { formatDate, daysUntil, expiryStatus } from "@/lib/inventory";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Package,
  AlertTriangle,
  TrendingDown,
  Truck,
} from "lucide-react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type CalEvent = {
  date: string;
  type: "delivery" | "expiry" | "lowstock";
  title: string;
  subtitle: string;
  severity: "info" | "warning" | "danger";
};

const EVENT_LABEL: Record<CalEvent["type"], string> = {
  delivery: "Delivery",
  expiry: "Expiry",
  lowstock: "Low stock",
};

export default function CalendarPage() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string>(now.toISOString().slice(0, 10));

  const { data: events, isLoading } = trpc.calendar.list.useQuery({ month, year });
  const { data: metrics } = trpc.stockMetrics.list.useQuery();

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    (events ?? []).forEach((e) => {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    });
    return map;
  }, [events]);

  const selectedEvents = eventsByDay.get(selectedDay) ?? [];

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = firstDay.getDay();
    const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
    const arr: (number | null)[] = [];
    for (let i = 0; i < totalCells; i++) {
      arr.push(i < leading || i >= leading + daysInMonth ? null : i - leading + 1);
    }
    return arr;
  }, [year, month]);

  const stats = useMemo(() => {
    const list = events ?? [];
    return {
      deliveries: list.filter((e) => e.type === "delivery").length,
      expiries: list.filter((e) => e.type === "expiry").length,
      lowStock: list.filter((e) => e.type === "lowstock").length,
    };
  }, [events]);

  function go(delta: number) {
    let y = year;
    let m = month + delta;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setYear(y);
    setMonth(m);
    setSelectedDay("");
  }

  const severityDot = (sev: CalEvent["severity"]) =>
    sev === "danger" ? "bg-destructive" : sev === "warning" ? "bg-amber-500" : "bg-primary";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            <CalendarDays className="h-8 w-8 text-primary" />
            Delivery Calendar
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Track expected deliveries, batch expiries, and low-stock days at a glance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => go(-1)} aria-label="Previous month">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="min-w-44 text-center text-lg font-semibold">
            {MONTHS[month]} {year}
          </span>
          <Button variant="outline" size="icon" onClick={() => go(1)} aria-label="Next month">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: Truck, label: "Deliveries this month", value: stats.deliveries, cls: "bg-primary/10 text-primary" },
          { icon: AlertTriangle, label: "Expiries this month", value: stats.expiries, cls: "bg-amber-500/10 text-amber-600" },
          { icon: TrendingDown, label: "Low stock alerts", value: stats.lowStock, cls: "bg-destructive/10 text-destructive" },
          { icon: Package, label: "Items with incoming stock", value: metrics?.filter((m) => m.incomingQty > 0).length ?? 0, cls: "bg-primary/10 text-primary" },
        ].map((s, idx) => (
          <Card key={idx} className="glass">
            <CardContent className="flex items-center gap-3 py-5">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.cls}`}>
                <s.icon className="h-6 w-6" />
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight">{s.value}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="glass xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">Monthly View</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> Delivery</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Expiry / low stock</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Expired / critical</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : (
              <>
                <div className="mb-1 grid grid-cols-7 text-center text-sm font-medium text-muted-foreground">
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {cells.map((day, idx) => {
                    const iso =
                      day === null
                        ? null
                        : `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    if (iso === null) return <div key={idx} />;
                    const dayEvents = eventsByDay.get(iso) ?? [];
                    const today = new Date().toISOString().slice(0, 10);
                    const isSelected = selectedDay === iso;
                    const isToday = iso === today;
                    return (
                      <button
                        key={idx}
                        type="button"
                        className="text-left"
                        onClick={() => setSelectedDay(iso)}
                      >
                        <div
                          className="relative flex h-20 flex-col rounded-xl border border-border/60 p-1.5 transition-colors duration-150 sm:h-24"
                          style={isSelected ? { boxShadow: "0 0 0 2px var(--primary)" } : undefined}
                        >
                          <span className={`text-sm font-semibold ${isToday ? "rounded-full bg-primary px-1.5 text-primary-foreground" : "text-foreground/80"}`}>
                            {day}
                          </span>
                          <div className="mt-0.5 flex flex-wrap gap-0.5">
                            {dayEvents.slice(0, 3).map((e, eidx) => (
                              <span key={eidx} title={e.title} className={`h-1.5 w-1.5 rounded-full ${severityDot(e.severity)}`} />
                            ))}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-xl">{selectedDay ? formatDate(selectedDay) : "Select a day"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {selectedEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                <CalendarDays className="mb-3 h-10 w-10 opacity-40" />
                <p className="text-base">No events on this day</p>
                <p className="mt-1 text-sm">Deliveries, expiries and low-stock alerts will appear here</p>
              </div>
            ) : (
              selectedEvents.map((e, idx) => (
                <div key={idx} className="rounded-xl border border-border/60 bg-card/60 p-3.5 backdrop-blur">
                  <div className="flex items-center gap-2 font-semibold">
                    {e.type === "delivery" ? (
                      <Truck className={`h-5 w-5 ${e.severity === "danger" ? "text-destructive" : "text-primary"}`} />
                    ) : e.type === "expiry" ? (
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-destructive" />
                    )}
                    {e.title}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{e.subtitle}</p>
                  <div className="mt-2">
                    <Badge variant="outline" className={e.severity === "danger" ? "text-destructive" : e.severity === "warning" ? "text-amber-600" : "text-primary"}>
                      {EVENT_LABEL[e.type]}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-xl">Stock coverage — days of supply</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  <th className="pr-3 py-2.5 font-medium">Item</th>
                  <th className="pr-3 py-2.5 font-medium">On hand</th>
                  <th className="pr-3 py-2.5 font-medium">Avg / day</th>
                  <th className="pr-3 py-2.5 font-medium">Days of supply</th>
                  <th className="pr-3 py-2.5 font-medium">Last delivery</th>
                  <th className="pr-3 py-2.5 font-medium">Next delivery</th>
                  <th className="py-2.5 font-medium">Incoming</th>
                </tr>
              </thead>
              <tbody>
                {(metrics ?? []).map((m) => {
                  const dos = m.daysOfSupply === Infinity ? "—" : String(m.daysOfSupply);
                  const atRisk =
                    m.daysOfSupply !== Infinity &&
                    m.onHand > 0 &&
                    (m.nextDeliveryDate === null || m.daysOfSupply < daysUntil(m.nextDeliveryDate));
                  const critical = m.onHand <= m.minStockLevel;
                  return (
                    <tr key={m.itemId} className="border-b border-border/40 last:border-0">
                      <td className="pr-3 py-2.5">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.category}</div>
                      </td>
                      <td className={`pr-3 py-2.5 ${critical ? "font-semibold text-destructive" : ""}`}>{m.onHand}</td>
                      <td className="pr-3 py-2.5">{m.avgDailyConsumption}</td>
                      <td className="pr-3 py-2.5">
                        {dos}
                        {atRisk && (
                          <span title="Will run out before next delivery">
                            <AlertTriangle className="ml-1 inline h-4 w-4 text-destructive" />
                          </span>
                        )}
                      </td>
                      <td className="pr-3 py-2.5 text-muted-foreground">{m.lastDeliveryDate ? formatDate(m.lastDeliveryDate) : "—"}</td>
                      <td className="pr-3 py-2.5 text-primary">{m.nextDeliveryDate ? formatDate(m.nextDeliveryDate) : "—"}</td>
                      <td className="py-2.5 font-medium">{m.incomingQty > 0 ? m.incomingQty : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Days of supply = current on-hand ÷ average daily consumption over the last 14 days.
            A warning icon flags items that will run out before the next scheduled delivery.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
