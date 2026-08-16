import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  CATEGORY_META,
  REASON_META,
  formatDateTime,
  stockHealth,
  todayIso,
} from "@/lib/inventory";
import type { Reason } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, Package } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const IN_FORM = {
  itemId: "" as string,
  supplier: "",
  lotNumber: "",
  quantity: 10,
  expiryDate: "",
  notes: "",
};

const OUT_FORM = {
  itemId: "" as string,
  quantity: 1,
  reason: "issued" as Reason,
  notes: "",
};

export default function Transactions() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"history" | "batches">("history");
  const [inOpen, setInOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  const [inForm, setInForm] = useState(IN_FORM);
  const [outForm, setOutForm] = useState(OUT_FORM);
  const [batchFilter, setBatchFilter] = useState<string>("all");

  const { data: items, isLoading: itemsLoading } = trpc.items.list.useQuery();
  const { data: totals, isLoading: totalsLoading } = trpc.stock.totals.useQuery();
  const { data: txs, isLoading: txLoading } = trpc.transactions.list.useQuery();
  const { data: batches, isLoading: batchLoading } = trpc.batches.list.useQuery();

  const stockInMut = trpc.transactions.stockIn.useMutation({
    onSuccess: () => {
      utils.invalidate();
      setInOpen(false);
      setInForm(IN_FORM);
      toast.success("Stock received — inventory updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const stockOutMut = trpc.transactions.stockOut.useMutation({
    onSuccess: () => {
      utils.invalidate();
      setOutOpen(false);
      setOutForm(OUT_FORM);
      toast.success("Stock movement recorded (FEFO deduction)");
    },
    onError: (e) => toast.error(e.message),
  });
  const [pendingQuarantine, setPendingQuarantine] = useState<{
    batchId: number;
    isQuarantined: boolean;
  } | null>(null);
  const quarantineMut = trpc.stock.quarantine.useMutation({
    onSuccess: () => {
      utils.invalidate();
      toast.success("Batch status updated");
      setPendingQuarantine(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const totalMap = useMemo(
    () => new Map((totals ?? []).map((t) => [t.id, t])),
    [totals]
  );
  const itemName = (id: number) => items?.find((i) => i.id === id)?.name ?? `Item #${id}`;
  const itemCategory = (id: number) => items?.find((i) => i.id === id)?.category;

  const itemOptions = useMemo(
    () => (items ?? []).map((i) => ({ value: String(i.id), label: `${i.name} (${i.category})` })),
    [items]
  );

  function submitIn(e: React.FormEvent) {
    e.preventDefault();
    const itemId = parseInt(inForm.itemId);
    if (!itemId || !inForm.supplier.trim() || !inForm.lotNumber.trim() || !inForm.expiryDate) {
      toast.error("Item, supplier, lot number, and expiry date are required");
      return;
    }
    if (new Date(inForm.expiryDate) <= new Date()) {
      toast.error("Expiry date must be in the future for new receipts");
      return;
    }
    stockInMut.mutate({
      itemId,
      supplier: inForm.supplier.trim(),
      lotNumber: inForm.lotNumber.trim(),
      quantity: inForm.quantity,
      expiryDate: inForm.expiryDate,
      notes: inForm.notes.trim() || undefined,
    });
  }

  function submitOut(e: React.FormEvent) {
    e.preventDefault();
    const itemId = parseInt(outForm.itemId);
    if (!itemId || outForm.quantity < 1) {
      toast.error("Select an item and enter a valid quantity");
      return;
    }
    const total = totalMap.get(itemId);
    if (total && outForm.quantity > total.onHand) {
      toast.error(`Only ${total.onHand} ${total.unitOfMeasure} available for this item`);
      return;
    }
    stockOutMut.mutate({
      itemId,
      quantity: outForm.quantity,
      reason: outForm.reason,
      notes: outForm.notes.trim() || undefined,
    });
  }

  const filteredBatches = useMemo(() => {
    if (!batches) return [];
    if (batchFilter === "all") return batches;
    return batches.filter((b) => String(b.itemId) === batchFilter);
  }, [batches, batchFilter]);

  return (
    <div className="space-y-6 animate-in-fade max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight">
            Stock In / Stock Out
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Record goods receipts, manual issues, adjustments, and write-offs
          </p>
        </div>
        {isAuthenticated ? (
          <div className="flex gap-2">
            <Button onClick={() => setInOpen(true)} className="gap-2">
              <ArrowDownToLine className="h-5 w-5" /> Stock in
            </Button>
            <Button variant="outline" onClick={() => setOutOpen(true)} className="gap-2">
              <ArrowUpFromLine className="h-5 w-5" /> Stock out
            </Button>
          </div>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "history" | "batches")}>
        <TabsList>
          <TabsTrigger value="history">Transaction history</TabsTrigger>
          <TabsTrigger value="batches">Batch / lot register</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "history" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Audit log</CardTitle>
          </CardHeader>
          <CardContent>
            {txLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : !txs?.length ? (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">No stock movements recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y">
                {txs.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                          tx.type === "stock-in"
                            ? "bg-ok/10 text-ok"
                            : tx.reason === "written off"
                              ? "bg-danger/10 text-danger"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {tx.type === "stock-in" ? (
                          <ArrowDownToLine className="h-5 w-5" />
                        ) : (
                          <ArrowUpFromLine className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{itemName(tx.itemId)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 flex gap-2 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Badge
                              variant={tx.type === "stock-in" ? "default" : "secondary"}
                              className="text-[11px] px-1.5 font-normal"
                            >
                              {tx.type}
                            </Badge>
                            <span className={REASON_META[tx.reason]?.color}>
                              {REASON_META[tx.reason]?.label}
                            </span>
                          </span>
                          {tx.supplier ? <span>supplier: {tx.supplier}</span> : null}
                          {tx.lotNumber ? (
                            <span className="font-mono text-[11px]">lot {tx.lotNumber}</span>
                          ) : null}
                          {tx.notes ? <span className="truncate max-w-48">{tx.notes}</span> : null}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-semibold tabular-nums ${
                          tx.type === "stock-in" ? "text-ok" : "text-foreground"
                        }`}
                      >
                        {tx.type === "stock-in" ? "+" : "−"}
                        {tx.quantity}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tx.performedAt ? formatDateTime(tx.performedAt) : ""}
                        {tx.performedBy ? ` · ${tx.performedBy}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Batch register</CardTitle>
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem>
                {(items ?? []).map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {batchLoading || itemsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="divide-y">
                {filteredBatches.map((b) => {
                  const total = totalMap.get(b.itemId);
                  const health = total ? stockHealth(total) : "ok";
                  return (
                    <div key={b.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{itemName(b.itemId)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                          lot {b.lotNumber} · {b.supplier ?? "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">{b.quantityOnHand}</p>
                          <p className="text-xs text-muted-foreground">of {b.quantityReceived} received</p>
                        </div>
                        <div className="text-right min-w-24">
                          <p
                            className={`text-xs font-semibold flex items-center justify-end gap-1 ${
                              b.isQuarantined
                                ? "text-danger"
                                : b.expiryDate < todayIso()
                                  ? "text-danger"
                                  : new Date(b.expiryDate) <=
                                      new Date(new Date().getTime() + 30 * 86400000)
                                    ? "text-warning"
                                    : "text-muted-foreground"
                            }`}
                          >
                            <CalendarDays className="h-3 w-3" />
                            {b.expiryDate}
                          </p>
                          <div className="flex items-center gap-1.5 justify-end mt-0.5">
                            <span className="text-[11px] text-muted-foreground">Quarantine</span>
                            {isAuthenticated ? (
                              <Switch
                                checked={b.isQuarantined}
                                onCheckedChange={(v) =>
                                  setPendingQuarantine({ batchId: b.id, isQuarantined: v })
                                }
                              />
                            ) : (
                              <span className="text-xs">{b.isQuarantined ? "Yes" : "No"}</span>
                            )}
                          </div>
                        </div>
                        {total ? (
                          <span
                            className={`h-2 w-2 rounded-full ${
                              health === "danger"
                                ? "bg-danger"
                                : health === "warning"
                                  ? "bg-warning"
                                  : "bg-ok"
                            }`}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stock-in dialog */}
      <AlertDialog
        open={!!pendingQuarantine}
        onOpenChange={(o) => !o && setPendingQuarantine(null)}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogTitle>
            {pendingQuarantine?.isQuarantined ? "Quarantine batch?" : "Release batch?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingQuarantine?.isQuarantined
              ? "Quarantined stock is excluded from FEFO deduction and cannot be issued. Use this for expired or damaged batches pending disposal."
              : "Releasing this batch makes its stock available again for FEFO deduction. Only release batches that are safe for use."}
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pendingQuarantine &&
                quarantineMut.mutate({
                  batchId: pendingQuarantine.batchId,
                  isQuarantined: pendingQuarantine.isQuarantined,
                })
              }
            >
              {pendingQuarantine?.isQuarantined ? "Quarantine" : "Release"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={inOpen} onOpenChange={setInOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitIn}>
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" /> Record stock in
              </DialogTitle>
              <DialogDescription>
                Goods receipt — lot number and expiry date are mandatory.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Item</Label>
                <Select
                  value={inForm.itemId}
                  onValueChange={(v) => setInForm({ ...inForm, itemId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {itemOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="in-supplier">Supplier</Label>
                  <Input
                    id="in-supplier"
                    value={inForm.supplier}
                    onChange={(e) => setInForm({ ...inForm, supplier: e.target.value })}
                    placeholder="e.g. Fresenius Kabi"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="in-lot">Lot number</Label>
                  <Input
                    id="in-lot"
                    value={inForm.lotNumber}
                    onChange={(e) => setInForm({ ...inForm, lotNumber: e.target.value })}
                    placeholder="e.g. LOT-2502"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="in-qty">Quantity received</Label>
                  <Input
                    id="in-qty"
                    type="number"
                    min={1}
                    value={inForm.quantity}
                    onChange={(e) =>
                      setInForm({ ...inForm, quantity: Math.max(1, parseInt(e.target.value) || 1) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="in-exp">Expiry date</Label>
                  <Input
                    id="in-exp"
                    type="date"
                    value={inForm.expiryDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setInForm({ ...inForm, expiryDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="in-notes">Notes (optional)</Label>
                <Textarea
                  id="in-notes"
                  rows={2}
                  value={inForm.notes}
                  onChange={(e) => setInForm({ ...inForm, notes: e.target.value })}
                  placeholder="PO reference, delivery notes…"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={stockInMut.isPending}>
                Record receipt
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stock-out dialog */}
      <Dialog open={outOpen} onOpenChange={setOutOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitOut}>
            <DialogHeader>
              <DialogTitle className="font-display">Record stock out</DialogTitle>
              <DialogDescription>
                Deducts from the earliest-expiring available batch first (FEFO).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Item</Label>
                <Select
                  value={outForm.itemId}
                  onValueChange={(v) => setOutForm({ ...outForm, itemId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {itemOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {outForm.itemId ? (
                <p className="text-xs text-muted-foreground -mt-2">
                  On hand: {totalMap.get(parseInt(outForm.itemId))?.onHand ?? "—"}{" "}
                  {totalMap.get(parseInt(outForm.itemId))?.unitOfMeasure ?? ""}
                </p>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="out-qty">Quantity</Label>
                <Input
                  id="out-qty"
                  type="number"
                  min={1}
                  value={outForm.quantity}
                  onChange={(e) =>
                    setOutForm({ ...outForm, quantity: Math.max(1, parseInt(e.target.value) || 1) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Select
                  value={outForm.reason}
                  onValueChange={(v) => setOutForm({ ...outForm, reason: v as Reason })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="issued">Issued</SelectItem>
                    <SelectItem value="adjusted">Adjusted</SelectItem>
                    <SelectItem value="written off">Written off</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="out-notes">Notes (optional)</Label>
                <Textarea
                  id="out-notes"
                  rows={2}
                  value={outForm.notes}
                  onChange={(e) => setOutForm({ ...outForm, notes: e.target.value })}
                  placeholder="Reason for the movement…"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOutOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={stockOutMut.isPending}>
                Record movement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
