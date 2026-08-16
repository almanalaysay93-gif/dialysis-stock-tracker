import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatDate, todayIso } from "@/lib/inventory";
import { ClipboardList, PackageCheck, Plus, ShoppingBag, Trash2 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  ordered: "bg-primary/10 text-primary",
  "partially-delivered": "bg-amber-500/10 text-amber-600",
  delivered: "bg-primary/10 text-primary",
  cancelled: "bg-muted text-muted-foreground",
};

type LineInput = { itemId: string; quantityOrdered: string };
type CreateForm = {
  supplier: string;
  expectedDeliveryDate: string;
  notes: string;
  lines: LineInput[];
};

const EMPTY_CREATE: CreateForm = {
  supplier: "",
  expectedDeliveryDate: "",
  notes: "",
  lines: [{ itemId: "", quantityOrdered: "" }],
};

export default function PurchaseOrdersPage() {
  const utils = trpc.useUtils();
  const { data: items, isLoading: itemsLoading } = trpc.items.list.useQuery();
  const { data: orders, isLoading: poLoading } = trpc.purchaseOrders.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [receiveTarget, setReceiveTarget] = useState<number | null>(null);
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const createMut = trpc.purchaseOrders.create.useMutation({
    onSuccess: () => {
      utils.invalidate();
      setCreateOpen(false);
      setForm(EMPTY_CREATE);
      toast.success("Purchase order created");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.purchaseOrders.update.useMutation({
    onSuccess: () => {
      utils.invalidate();
      toast.success("Purchase order updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const stockInMut = trpc.transactions.stockIn.useMutation({
    onSuccess: () => {
      utils.invalidate();
      toast.success("Stock received — inventory updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.purchaseOrders.delete.useMutation({
    onSuccess: () => {
      utils.invalidate();
      setDeleteTarget(null);
      toast.success("Purchase order deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const itemById = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);

  const pendingDeliveries = useMemo(
    () => (orders ?? []).filter((o) => o.status === "ordered" || o.status === "partially-delivered"),
    [orders]
  );

  function setLine(idx: number, patch: Partial<LineInput>) {
    setForm((f) => {
      const lines = f.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
      return { ...f, lines };
    });
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplier.trim() || !form.expectedDeliveryDate) {
      toast.error("Supplier and expected delivery date are required");
      return;
    }
    const lines = form.lines
      .filter((l) => l.itemId && Number(l.quantityOrdered) > 0)
      .map((l) => ({ itemId: Number(l.itemId), quantityOrdered: Number(l.quantityOrdered) }));
    if (lines.length === 0) {
      toast.error("Add at least one item line with a quantity");
      return;
    }
    createMut.mutate({
      supplier: form.supplier.trim(),
      expectedDeliveryDate: form.expectedDeliveryDate,
      itemsSummary: lines.map((l) => `${itemById.get(l.itemId)?.name ?? "?"} x${l.quantityOrdered}`).join(", "),
      notes: form.notes.trim() || undefined,
      lines,
    });
  }

  /** Mark a PO as delivered, update line quantities received, and receive stock for every unreceived line */
  async function receiveAll(poId: number) {
    const po = orders?.find((o) => o.id === poId);
    if (!po) return;
    const pendingLines = po.lines.filter((l) => l.quantityReceived < l.quantityOrdered);
    // Mark delivered and bump received quantities on lines
    await updateMut.mutateAsync({
      id: poId,
      status: "delivered",
      actualDeliveryDate: todayIso(),
      lines: po.lines.map((l) => ({
        itemId: l.itemId,
        quantityOrdered: l.quantityOrdered,
        quantityReceived: l.quantityOrdered,
      })),
    });
    if (updateMut.isError) return;
    // Then create stock-in transactions for pending quantities
    let received = 0;
    for (const line of pendingLines) {
      const qty = line.quantityOrdered - line.quantityReceived;
      if (qty <= 0) continue;
      const expiry = expiryDates[String(line.itemId)] ?? "";
      try {
        await stockInMut.mutateAsync({
          itemId: line.itemId,
          quantity: qty,
          supplier: po.supplier,
          lotNumber: `${po.poNumber}-${line.itemId}`,
          expiryDate: expiry,
          notes: `Received against ${po.poNumber}`,
        });
        received += qty;
      } catch {
        // continue with remaining lines; per-item failures surfaced individually
      }
    }
    setReceiveTarget(null);
    setExpiryDates({});
    toast.success(`Received ${received} units against ${po.poNumber}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            <ShoppingBag className="h-8 w-8 text-primary" />
            Purchase Orders
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Schedule supplier deliveries and receive them straight into stock
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="h-11 px-5 text-base">
              <Plus className="h-5 w-5" />
              New Purchase Order
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-strong max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-xl">New Purchase Order</DialogTitle>
              <DialogDescription>The number is assigned automatically (PO-YYYY-NNNN)</DialogDescription>
            </DialogHeader>
            <form onSubmit={submitCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="po-supplier">Supplier</Label>
                <Input
                  id="po-supplier"
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                  placeholder="e.g. Fresenius Medical Care"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="po-date">Expected Delivery Date</Label>
                <Input
                  id="po-date"
                  type="date"
                  value={form.expectedDeliveryDate}
                  onChange={(e) => setForm({ ...form, expectedDeliveryDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Order Lines</Label>
                {form.lines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={line.itemId}
                      onChange={(e) => setLine(idx, { itemId: e.target.value })}
                      className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-base"
                    >
                      <option value="">Select item…</option>
                      {(items ?? []).map((i) => (
                        <option key={i.id} value={String(i.id)}>
                          {i.name} ({i.category})
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={line.quantityOrdered}
                      onChange={(e) => setLine(idx, { quantityOrdered: e.target.value })}
                      className="w-24"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={form.lines.length === 1}
                      onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, { itemId: "", quantityOrdered: "" }] }))}
                >
                  <Plus className="h-4 w-4" /> Add item
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="po-notes">Notes (optional)</Label>
                <Input
                  id="po-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="e.g. Urgent restock for week 34"
                />
              </div>
              <DialogFooter>
                <Button type="submit" className="h-11 px-6" disabled={createMut.isPending}>
                  {createMut.isPending ? "Creating…" : "Create Purchase Order"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {pendingDeliveries.length > 0 && (
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <ClipboardList className="h-5 w-5 text-primary" />
              Pending deliveries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {pendingDeliveries.map((po) => (
                <div key={po.id} className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3.5 py-2">
                  <PackageCheck className="h-5 w-5 text-primary" />
                  <span className="text-sm font-semibold">{po.poNumber}</span>
                  <span className="text-sm text-muted-foreground">· {po.supplier}</span>
                  <span className={`text-sm ${po.expectedDeliveryDate < todayIso() ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                    due {formatDate(po.expectedDeliveryDate)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">All Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {poLoading || itemsLoading ? (
            <div className="h-40" />
          ) : (orders ?? []).length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <ShoppingBag className="mb-2 h-10 w-10 opacity-40" />
              <p className="text-base">No purchase orders yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(orders ?? []).map((po) => {
                    const unreceived = po.lines.some((l) => l.quantityReceived < l.quantityOrdered);
                    return (
                      <TableRow key={po.id}>
                        <TableCell className="font-semibold">{po.poNumber}</TableCell>
                        <TableCell>{po.supplier}</TableCell>
                        <TableCell className="max-w-64 truncate" title={po.itemsSummary ?? undefined}>
                          {po.itemsSummary ?? po.lines.map((l) => `${itemById.get(l.itemId)?.name ?? "#"} x${l.quantityOrdered}`).join(", ")}
                        </TableCell>
                        <TableCell>{formatDate(po.expectedDeliveryDate)}</TableCell>
                        <TableCell>{po.actualDeliveryDate ? formatDate(po.actualDeliveryDate) : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_COLORS[po.status]}>
                            {po.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {unreceived && po.status !== "cancelled" && (
                            <Button
                              size="sm"
                              className="h-9"
                              onClick={() => setReceiveTarget(po.id)}
                            >
                              <PackageCheck className="h-4 w-4" /> Receive
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => setDeleteTarget(po.id)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receive dialog: expiry dates per line + confirmation */}
      <Dialog open={receiveTarget !== null} onOpenChange={(o) => !o && setReceiveTarget(null)}>
        <DialogContent className="glass-strong max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Receive delivery — {orders?.find((p) => p.id === receiveTarget)?.poNumber}</DialogTitle>
            <DialogDescription>
              Stock will be received under auto-generated lot numbers (PO-item). Enter each
              item's expiry date so lot tracking stays accurate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(orders?.find((p) => p.id === receiveTarget)?.lines ?? [])
              .filter((l) => l.quantityReceived < l.quantityOrdered)
              .map((l) => (
                <div key={l.itemId} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{itemById.get(l.itemId)?.name ?? `Item #${l.itemId}`}</div>
                    <div className="text-xs text-muted-foreground">
                      Quantity: {l.quantityOrdered - l.quantityReceived} {itemById.get(l.itemId)?.unitOfMeasure ?? ""}
                    </div>
                  </div>
                  <div className="w-44">
                    <Label className="text-xs">Expiry date</Label>
                    <Input
                      type="date"
                      value={expiryDates[String(l.itemId)] ?? ""}
                      onChange={(e) =>
                        setExpiryDates((m) => ({ ...m, [String(l.itemId)]: e.target.value }))
                      }
                    />
                  </div>
                </div>
              ))}
            {! (orders?.find((p) => p.id === receiveTarget)?.lines ?? []).some(
              (l) => l.quantityReceived < l.quantityOrdered
            ) && (
              <p className="text-sm text-muted-foreground">All lines already received.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => receiveTarget !== null && receiveAll(receiveTarget)}
            >
              Mark delivered &amp; receive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Delete purchase order?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget !== null && deleteMut.mutate({ id: deleteTarget })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
