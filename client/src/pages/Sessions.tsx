import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/_core/hooks/useAuth";
import { SHIFT_LABEL } from "@/lib/inventory";
import type { SessionType } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { HeartPulse, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

export default function Sessions() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<"all" | "HD" | "PD">("all");

  const { data: sessions, isLoading } = trpc.sessions.listWithLines.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: items } = trpc.items.list.useQuery();
  const itemMap = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);

  const filtered = useMemo(() => {
    if (!sessions) return [];
    if (filter === "all") return sessions;
    return sessions.filter((s) => s.sessionType === filter);
  }, [sessions, filter]);

  return (
    <div className="space-y-6 animate-in-fade max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-display font-semibold tracking-tight">Treatment Sessions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Completed dialysis sessions with recorded consumable usage
        </p>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "HD" | "PD")}>
        <TabsList>
          <TabsTrigger value="all">All sessions</TabsTrigger>
          <TabsTrigger value="HD">HD</TabsTrigger>
          <TabsTrigger value="PD">PD</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Session history</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : !filtered.length ? (
            <div className="py-12 text-center">
              <HeartPulse className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">
                No {filter === "all" ? "" : filter + " "}sessions recorded yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Log a session from the Consumption page
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((s) => (
                <SessionCard key={s.id} session={s} itemMap={itemMap} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SessionCard({
  session,
  itemMap,
}: {
  session: {
    id: number;
    patientName: string;
    chair: string;
    shift: "morning" | "afternoon" | "evening";
    sessionType: SessionType;
    sessionDate: string;
    status: string;
    createdBy: string | null;
    createdAt: Date;
    lines: { id: number; itemId: number; batchId: number | null; quantity: number; sessionId: number }[];
  };
  itemMap: Map<number, { name: string; category: string; unitOfMeasure: string }>;
}) {
  const lines = session.lines ?? [];
  return (
    <div className="py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
            <UserRound className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{session.patientName}</p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>Chair {session.chair}</span>
              <span>·</span>
              <Badge
                variant={session.sessionType === "HD" ? "default" : "outline"}
                className="text-[11px] px-1.5 font-normal"
              >
                {session.sessionType}
              </Badge>
              <span>{SHIFT_LABEL[session.shift]}</span>
              <span>·</span>
              <span>{session.sessionDate}</span>
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground shrink-0">
          {lines.length} item line{lines.length === 1 ? "" : "s"}
        </p>
      </div>
      {lines.length > 0 ? (
        <div className="mt-2.5 grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5 pl-13">
          {lines.map((l) => {
            const item = itemMap.get(l.itemId);
            return (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-md bg-muted/60 px-2.5 py-1.5 text-xs"
              >
                <span className="truncate pr-2">{item?.name ?? `Item #${l.itemId}`}</span>
                <span className="font-semibold tabular-nums shrink-0">×{l.quantity}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
