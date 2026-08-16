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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { CATEGORY_META } from "@/lib/inventory";
import type { Category, Item } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { MoreHorizontal, PackagePlus, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const CATEGORIES = Object.keys(CATEGORY_META) as Category[];

const EMPTY_FORM = {
  name: "",
  category: "dialyzer" as Category,
  unitOfMeasure: "",
  minStockLevel: 0,
  reorderLevel: 10,
  description: "",
};

export default function Items() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filter, setFilter] = useState<string>("all");

  const { data: items, isLoading } = trpc.items.list.useQuery();
  const filtered = useMemo(() => {
    if (!items) return [];
    if (filter === "all") return items;
    return items.filter((i) => i.category === filter);
  }, [items, filter]);

  const createMut = trpc.items.create.useMutation({
    onSuccess: () => {
      utils.items.list.invalidate();
      setOpen(false);
      toast.success("Item added to catalog");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.items.update.useMutation({
    onSuccess: () => {
      utils.items.list.invalidate();
      setOpen(false);
      toast.success("Item updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);
  const deleteMut = trpc.items.delete.useMutation({
    onSuccess: () => {
      utils.items.list.invalidate();
      toast.success("Item removed from catalog");
      setPendingDelete(null);
    },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(item: Item) {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      unitOfMeasure: item.unitOfMeasure,
      minStockLevel: item.minStockLevel,
      reorderLevel: item.reorderLevel,
      description: item.description ?? "",
    });
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.unitOfMeasure.trim()) {
      toast.error("Name and unit of measure are required");
      return;
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, ...form });
    } else {
      createMut.mutate(form);
    }
  }

  return (
    <div className="space-y-6 animate-in-fade max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">Item Catalog</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage consumable items, categories, and reorder thresholds
          </p>
        </div>
        {isAuthenticated ? (
          <Button onClick={openCreate} className="gap-2">
            <PackagePlus className="h-4 w-4" /> Add item
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          All categories
        </Button>
        {CATEGORIES.map((c) => (
          <Button
            key={c}
            variant={filter === c ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(c)}
          >
            {CATEGORY_META[c].label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {filter === "all" ? "All items" : CATEGORY_META[filter]?.label}
            </CardTitle>
            <CardDescription>
              {filtered.length} item{filtered.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">No items in this category yet.</p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    canEdit={isAuthenticated}
                    onEdit={() => openEdit(item)}
                    onDelete={() => setPendingDelete(item)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogTitle>Delete item?</AlertDialogTitle>
          <AlertDialogDescription>
            Removing <span className="font-medium text-foreground">{pendingDelete?.name}</span> will
            hide it from the catalog. Existing stock batches and transaction history are kept for
            audit purposes, but the item can no longer be used in new transactions.
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && deleteMut.mutate({ id: pendingDelete.id })}
            >
              Delete item
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle className="font-display">
                {editing ? "Edit item" : "Add item to catalog"}
              </DialogTitle>
              <DialogDescription>
                {editing ? "Update item details and thresholds." : "Define a new consumable item."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="item-name">Name</Label>
                <Input
                  id="item-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. FX 60 High-Flux Dialyzer"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v as Category })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_META[c].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-uom">Unit of measure</Label>
                <Input
                  id="item-uom"
                  value={form.unitOfMeasure}
                  onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })}
                  placeholder="e.g. unit, bag, box, vial"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="item-min">Minimum stock level</Label>
                  <Input
                    id="item-min"
                    type="number"
                    min={0}
                    value={form.minStockLevel}
                    onChange={(e) =>
                      setForm({ ...form, minStockLevel: Math.max(0, parseInt(e.target.value) || 0) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="item-reorder">Reorder level</Label>
                  <Input
                    id="item-reorder"
                    type="number"
                    min={0}
                    value={form.reorderLevel}
                    onChange={(e) =>
                      setForm({ ...form, reorderLevel: Math.max(0, parseInt(e.target.value) || 0) })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-desc">Description (optional)</Label>
                <Textarea
                  id="item-desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Manufacturer, size, or specification details"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {editing ? "Save changes" : "Add item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemRow({
  item,
  canEdit,
  onEdit,
  onDelete,
}: {
  item: Item;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{item.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[11px] px-1.5 font-normal">
            {CATEGORY_META[item.category]?.label}
          </Badge>
          <span>
            {item.unitOfMeasure} · min {item.minStockLevel} · reorder {item.reorderLevel}
          </span>
        </p>
      </div>
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
