import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/_core/hooks/useAuth";
import { CATEGORY_META, SHIFT_LABEL, todayIso } from "@/lib/inventory";
import type { SessionLine, SessionType } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { Activity, Minus, Plus, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface LineDraft {
  itemId: number;
  quantity: number;
}

export default function Consumption() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [sessionType, setSessionType] = useState<SessionType>("HD");
  const [patientName, setPatientName] = useState("");
  const [chair, setChair] = useState("");
  const [shift, setShift] = useState<"morning" | "afternoon" | "evening">("morning");
  const [sessionDate, setSessionDate] = useState(todayIso());
  const [lines, setLines] = useState<LineDraft[]>([]);

  const { data: items } = trpc.items.list.useQuery();
  const { data: templates } = trpc.templates.list.useQuery();
  const { data: sessions, isLoading } = trpc.sessions.list.useQuery();

  const itemMap = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const templateMap = useMemo(
    () =>
      new Map(
        (templates ?? []).map((t) => [t.itemId, { qty: t.defaultQty, label: t.label }])
      ),
    [templates]
  );

  const createMut = trpc.sessions.create.useMutation({
    onSuccess: () => {
      utils.invalidate();
      setOpen(false);
      toast.success("Session recorded — stock deducted (FEFO)");
    },
    onError: (e) => toast.error(e.message),
  });

  function openDialog() {
    setSessionType("HD");
    setPatientName("");
    setChair("");
    setShift("morning");
    setSessionDate(todayIso());
    setLines([]);
    setOpen(true);
  }

  function populateFromTemplate() {
    const tpls = (templates ?? []).filter(
      (t) => t.sessionType === sessionType && t.itemId
    );
    if (tpls.length === 0) {
      toast.info("No template defined for this session type yet");
      return;
    }
    setLines(tpls.map((t) => ({ itemId: t.itemId, quantity: t.defaultQty })));
    toast.success("Template applied — adjust quantities as needed");
  }

  function setLineQty(itemId: number, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => (l.itemId === itemId ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  function addLine() {
    setLines((prev) => [...prev, { itemId: (items ?? [])[0]?.id ?? 0, quantity: 1 }]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientName.trim() || !chair.trim() || !sessionDate) {
      toast.error("Patient name, chair, and date are required");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one consumed item");
      return;
    }
    createMut.mutate({
      patientName: patientName.trim(),
      chair: chair.trim().slice(0, 16),
      shift,
      sessionType,
      sessionDate,
      lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
    });
  }

  return (
    <div className="space-y-6 animate-in-fade max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight">
            Daily Consumption
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Log consumables used per dialysis session — stock deducted automatically
          </p>
        </div>
        {isAuthenticated ? (
          <Button onClick={openDialog} className="gap-2">
            <Activity className="h-5 w-5" /> Log session
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Session log</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : !sessions?.length ? (
            <div className="py-12 text-center">
              <UserRound className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No sessions recorded</p>
              <p className="text-xs text-muted-foreground mt-1">
                Log a session to begin tracking daily consumption
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  itemMap={itemMap}
                  lines={(s as { lines?: SessionLine[] }).lines}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle className="font-display">Log session consumption</DialogTitle>
              <DialogDescription>
                Capture what was used during one treatment session.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Session type</Label>
                  <Select
                    value={sessionType}
                    onValueChange={(v) => setSessionType(v as SessionType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HD">HD — Hemodialysis</SelectItem>
                      <SelectItem value="PD">PD — Peritoneal dialysis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Shift</Label>
                  <Select value={shift} onValueChange={(v) => setShift(v as typeof shift)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Morning</SelectItem>
                      <SelectItem value="afternoon">Afternoon</SelectItem>
                      <SelectItem value="evening">Evening</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cx-patient">Patient</Label>
                  <Input
                    id="cx-patient"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Patient name / ID"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cx-chair">Chair</Label>
                  <Input
                    id="cx-chair"
                    value={chair}
                    onChange={(e) => setChair(e.target.value)}
                    placeholder="e.g. 1"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cx-date">Session date</Label>
                <Input
                  id="cx-date"
                  type="date"
                  value={sessionDate}
                  max={todayIso()}
                  onChange={(e) => setSessionDate(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Consumed items</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={populateFromTemplate}
                    className="text-xs"
                  >
                    Apply {sessionType} template
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={addLine}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {lines.length === 0 ? (
                  <div className="rounded-lg border border-dashed py-6 text-center">
                    <p className="text-xs text-muted-foreground px-4">
                      Tap <strong>Apply template</strong> to load standard {sessionType === "HD" ? "hemodialysis" : "peritoneal dialysis"} consumables, then adjust quantities.
                    </p>
                  </div>
                ) : (
                  lines.map((l) => {
                    const item = itemMap.get(l.itemId);
                    const tpl = templateMap.get(l.itemId);
                    return (
                      <div
                        key={l.itemId}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item?.name ?? `Item #${l.itemId}`}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal h-3.5">
                              {item ? CATEGORY_META[item.category]?.label : ""}
                            </Badge>
                            {tpl?.label ? <span>{tpl.label}</span> : null}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setLineQty(l.itemId, -1)}
                            className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-accent transition-colors"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center text-sm font-semibold tabular-nums">
                            {l.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => setLineQty(l.itemId, 1)}
                            className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-accent transition-colors"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                Record session
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionRow({
  session,
  itemMap,
  lines,
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
    lines?: SessionLine[];
  };
  itemMap: Map<number, { name: string; category: string }>;
  lines?: SessionLine[];
}) {
  const totalQty = (lines ?? []).reduce((s, l) => s + l.quantity, 0);
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <UserRound className="h-5 w-5 text-secondary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {session.patientName} · chair {session.chair}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
              <Badge
                variant={session.sessionType === "HD" ? "default" : "outline"}
                className="text-[11px] px-1.5 font-normal"
              >
                {session.sessionType}
              </Badge>
              <span>{SHIFT_LABEL[session.shift]}</span>
              <span>{session.sessionDate}</span>
              {lines ? <span>· {totalQty} items used</span> : null}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground shrink-0">
          {session.createdBy ?? "Staff"} · {new Date(session.createdAt).toLocaleDateString()}
        </p>
      </div>
      {lines && lines.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-12">
          {lines.map((l) => {
            const item = itemMap.get(l.itemId);
            return (
              <span
                key={l.id}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px]"
              >
                <span className="font-medium">{item?.name.split(" ").slice(0, 3).join(" ")}…</span>
                <span className="text-muted-foreground">×{l.quantity}</span>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
