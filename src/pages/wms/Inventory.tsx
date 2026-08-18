import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Mono, PageHeader, Progress, SectionLabel, StatusPill } from "@/components/wms/ui";
import { useWarehouse } from "@/store/warehouse";
import { fmtMoney, stockStatus } from "@/store/engine";
import { findConflicts } from "@/store/engine";
import { Boxes, PackageCheck, PackagePlus, ScanLine, Search, Truck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CATEGORIES = ["All", "Electronics", "Accessories", "Apparel", "Home", "Grocery", "Fragile"];
const STATUSES = ["All", "Healthy", "Low", "Critical", "Out of Stock"];
const SORTS = [
  { id: "name", label: "Name" },
  { id: "sku", label: "SKU" },
  { id: "available", label: "Available stock" },
  { id: "value", label: "Stock value" },
  { id: "urgency", label: "Reorder urgency" },
];

export default function Inventory() {
  const wh = useWarehouse();
  const { state } = wh;
  const [params, setParams] = useSearchParams();
  const sku = params.get("sku");
  const zoneFilter = params.get("zone");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");
  const [sort, setSort] = useState("name");
  const [scanner, setScanner] = useState(false);

  const conflicts = useMemo(() => findConflicts(state), [state]);
  const conflictSkus = useMemo(() => new Set(conflicts.map((c) => c.sku)), [conflicts]);

  const filtered = useMemo(() => {
    let list = state.products.slice();
    if (category !== "All") list = list.filter((p) => p.category === category);
    if (status !== "All") list = list.filter((p) => stockStatus(p) === status);
    if (zoneFilter) list = list.filter((p) => p.zone === zoneFilter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
    switch (sort) {
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "sku":
        list.sort((a, b) => a.sku.localeCompare(b.sku));
        break;
      case "available":
        list.sort((a, b) => a.available - b.available);
        break;
      case "value":
        list.sort((a, b) => b.available * b.price - a.available * a.price);
        break;
      case "urgency":
        list.sort((a, b) => (a.available - a.reorderPoint) - (b.available - b.reorderPoint));
        break;
    }
    return list;
  }, [state.products, category, status, zoneFilter, query, sort]);

  const totalValue = state.products.reduce((s, p) => s + p.available * p.price, 0);
  const low = state.products.filter((p) => stockStatus(p) === "Low").length;
  const critical = state.products.filter((p) => stockStatus(p) === "Critical").length;
  const out = state.products.filter((p) => stockStatus(p) === "Out of Stock").length;
  const incoming = state.products.reduce((s, p) => s + p.incoming, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Inventory"
        title="Stock & SKU management"
        description="One consistent stock model across the facility — available, reserved, damaged and incoming reconcile automatically with every allocation, pick and dispatch."
        actions={
          <>
            <Button
              variant={scanner ? "default" : "outline"}
              size="sm"
              className={cn("h-8 gap-1.5 text-xs", scanner && "border-copper bg-copper/10 text-copper hover:bg-copper/20")}
              onClick={() => setScanner((s) => !s)}
            >
              <ScanLine className="size-3.5" /> Scanner mode {scanner ? "on" : "off"}
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setStatus("Critical")}>
              <PackagePlus className="size-3.5" /> Review critical
            </Button>
          </>
        }
      />

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: "SKUs", value: state.products.length },
          { label: "Stock value", value: fmtMoney(totalValue) },
          { label: "Low stock", value: low, tone: "warn" },
          { label: "Critical", value: critical, tone: "danger" },
          { label: "Out of stock", value: out, tone: "danger" },
        ].map((s) => (
          <Card key={s.label} className="shadow-none">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{s.label}</p>
              <p className={cn("mt-1.5 font-display text-2xl font-medium", s.tone === "warn" && "text-warn", s.tone === "danger" && "text-danger")}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {scanner && (
        <div className="rounded-lg border border-copper/30 bg-copper/5 px-4 py-3 text-[12.5px] leading-5">
          <span className="font-semibold text-copper">Scanner mode —</span> rows below highlight LOW STOCK, CRITICAL, OUT OF STOCK, DAMAGED and
          MISALLOCATED items. Click any row to see the recommended action.
        </div>
      )}

      {/* controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search SKU or product…" className="pl-9" aria-label="Search inventory" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-[140px] text-xs" aria-label="Filter by category"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c === "All" ? "All categories" : c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[140px] text-xs" aria-label="Filter by stock status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s === "All" ? "All statuses" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-9 w-[160px] text-xs" aria-label="Sort products"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {zoneFilter && (
            <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" onClick={() => {
              const next = new URLSearchParams(params);
              next.delete("zone");
              setParams(next);
            }}>
              Zone {zoneFilter} <X className="size-3" />
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} SKUs · {incoming} inbound</span>
        </div>
      </div>

      {/* table */}
      <Card className="overflow-hidden shadow-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="border-b border-border/70 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">SKU / Product</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Zone</th>
                  <th className="px-4 py-2.5 text-right font-medium">Available</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reserved</th>
                  <th className="px-4 py-2.5 text-right font-medium">Damaged</th>
                  <th className="px-4 py-2.5 text-right font-medium">Incoming</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reorder pt</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map((p) => {
                  const st = stockStatus(p);
                  const mis = conflictSkus.has(p.sku);
                  const flagged = scanner && (st !== "Healthy" || p.damaged > 0 || mis);
                  return (
                    <tr
                      key={p.sku}
                      onClick={() => setParams({ sku: p.sku })}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-accent/40",
                        flagged && st === "Critical" && "bg-danger/5",
                        flagged && st === "Low" && "bg-warn/5",
                        flagged && (st === "Out of Stock" || mis) && "bg-danger/5",
                        flagged && p.damaged > 0 && st === "Healthy" && "bg-copper/5",
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Mono className="font-semibold text-foreground">{p.sku}</Mono>
                          {scanner && flagged && (
                            <span className={cn("rounded-full px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase",
                              st === "Out of Stock" || mis ? "bg-danger/15 text-danger" : st === "Critical" ? "bg-danger/15 text-danger" : st === "Low" ? "bg-warn/15 text-warn" : "bg-copper/15 text-copper")}>
                              {mis ? "MISALLOC" : st === "Out of Stock" ? "OUT" : p.damaged > 0 && st === "Healthy" ? "DAMAGED" : st.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 max-w-[220px] truncate text-muted-foreground">{p.name}</p>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.category}</td>
                      <td className="px-4 py-2.5"><Mono>{p.zone}-{p.location.split("-").slice(1).join("-")}</Mono></td>
                      <td className={cn("px-4 py-2.5 text-right font-mono", p.available === 0 ? "text-danger" : p.available <= p.reorderPoint ? "text-warn" : "")}>{p.available}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-info">{p.reserved}</td>
                      <td className={cn("px-4 py-2.5 text-right font-mono", p.damaged > 0 && "text-copper")}>{p.damaged}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{p.incoming}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{p.reorderPoint}</td>
                      <td className="px-4 py-2.5"><StatusPill label={st} dot={false} className="scale-90" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ProductDetailDrawer
        open={!!sku}
        onOpenChange={(open) => {
          if (!open) {
            const next = new URLSearchParams(params);
            next.delete("sku");
            setParams(next);
          }
        }}
        sku={sku ?? null}
      />
    </div>
  );
}

function ProductDetailDrawer({ open, onOpenChange, sku }: { open: boolean; onOpenChange: (open: boolean) => void; sku: string | null }) {
  const wh = useWarehouse();
  const { state } = wh;
  const navigate = useNavigate();
  const product = sku ? state.products.find((p) => p.sku === sku) : undefined;
  const [editOpen, setEditOpen] = useState(false);
  const [avail, setAvail] = useState(0);
  const [incoming, setIncoming] = useState(0);
  const [damaged, setDamaged] = useState(0);
  const [actionQty, setActionQty] = useState(1);

  if (!product) return null;
  const st = stockStatus(product);
  const conflict = findConflicts(state).find((c) => c.sku === product.sku);
  const demanders = state.orders.filter((o) => o.stage !== "Dispatched" && o.stage !== "Cancelled" && o.items.some((i) => i.sku === product.sku && i.qty > i.allocated));

  const run = (res: { ok: boolean; error?: string }, msg: string) => {
    if (res.ok) toast.success(msg);
    else toast.error(res.error ?? "Action failed");
  };

  const openEdit = () => {
    setAvail(product.available);
    setIncoming(product.incoming);
    setDamaged(product.damaged);
    setEditOpen(true);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b border-border/70 px-5 pb-4 pt-5 text-left">
          <SectionLabel>SKU</SectionLabel>
          <SheetTitle className="mt-1 font-display text-2xl font-medium tracking-tight">
            <Mono>{product.sku}</Mono>
          </SheetTitle>
          <p className="text-sm text-muted-foreground">{product.name} · {product.category}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusPill label={st} />
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">Zone {product.zone}</span>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{product.location}</span>
          </div>
        </SheetHeader>

        <div className="overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Available", value: product.available, tone: product.available === 0 ? "text-danger" : product.available <= product.reorderPoint ? "text-warn" : "" },
              { label: "Reserved", value: product.reserved, tone: "text-info" },
              { label: "Damaged", value: product.damaged, tone: product.damaged > 0 ? "text-copper" : "" },
              { label: "Incoming", value: product.incoming, tone: product.incoming > 0 ? "text-ok" : "" },
            ].map((b) => (
              <div key={b.label} className="rounded-lg border border-border/70 py-3">
                <p className={cn("font-display text-xl font-medium", b.tone)}>{b.value}</p>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{b.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Stock vs reorder point ({product.reorderPoint})</span>
              <Mono>{product.available}/{product.reorderPoint}</Mono>
            </div>
            <Progress value={Math.min(100, (product.available / Math.max(1, product.reorderPoint * 2)) * 100)} tone={st === "Healthy" ? "ok" : st === "Low" ? "warn" : "danger"} className="mt-1.5" />
          </div>

          {conflict && (
            <div className="mt-4 rounded-lg border border-warn/30 bg-warn/5 p-3.5">
              <p className="text-xs font-semibold text-warn">Stock conflict detected</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {conflict.available} units available, {conflict.demand} demanded by {conflict.orders.length} order(s).
              </p>
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => { onOpenChange(false); navigate("/decisions"); }}>
                Review in Decision Center
              </Button>
            </div>
          )}

          {st !== "Healthy" && (
            <div className="mt-4 rounded-lg border border-border/70 bg-accent/30 p-3.5">
              <p className="text-xs font-semibold">Recommended action</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {st === "Out of Stock" && `Zero available stock. Create a resupply mission for ${product.minOrderQty}+ units.`}
                {st === "Critical" && `Available (${product.available}) is at or below half the reorder point (${product.reorderPoint}). Create a resupply mission for ${Math.max(product.minOrderQty, product.reorderPoint * 2 - product.available)} units.`}
                {st === "Low" && `Available (${product.available}) is at or below the reorder point (${product.reorderPoint}). Plan replenishment of ${Math.max(product.minOrderQty, product.reorderPoint * 2 - product.available)} units.`}
              </p>
              <Button size="sm" className="mt-2 h-7 gap-1.5 text-xs" onClick={() => run(wh.createReorder(product.sku), `Resupply mission created for ${product.sku}`)}>
                <Truck className="size-3.5" /> Create resupply mission
              </Button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={openEdit}><Boxes className="size-3.5" /> Edit stock</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run(wh.reserveStock(product.sku, actionQty), `${actionQty} × ${product.sku} reserved`)}>
              Reserve {actionQty}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run(wh.releaseStock(product.sku, Math.min(actionQty, product.reserved)), `${actionQty} × ${product.sku} released`)}>
              Release {actionQty}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-danger" onClick={() => run(wh.markDamaged(product.sku, actionQty), `${actionQty} × ${product.sku} damaged`)}>
              Mark damaged
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run(wh.restock(product.sku, actionQty), `+${actionQty} × ${product.sku} received`)}>
              <PackageCheck className="size-3.5" /> Restock {actionQty}
            </Button>
            {product.incoming > 0 && (
              <Button size="sm" variant="outline" className="gap-1.5 text-ok" onClick={() => run(wh.receiveIncoming(product.sku), `Inbound ${product.incoming} × ${product.sku} received`)}>
                <Truck className="size-3.5" /> Receive inbound
              </Button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Batch actions qty</span>
            <Input type="number" min={1} value={actionQty} onChange={(e) => setActionQty(Math.max(1, Number(e.target.value)))} className="h-8 w-20 font-mono text-right" aria-label="Quantity for batch actions" />
          </div>

          {demanders.length > 0 && (
            <div className="mt-5">
              <SectionLabel className="mb-2">Open demand</SectionLabel>
              <ul className="space-y-1.5">
                {demanders.map((o) => {
                  const it = o.items.find((i) => i.sku === product.sku)!;
                  return (
                    <li key={o.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs">
                      <span><Mono className="font-medium">{o.id}</Mono> · {o.customer}</span>
                      <span className="font-mono text-muted-foreground">{it.allocated}/{it.qty} allocated</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </SheetContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit stock — <Mono>{product.sku}</Mono></DialogTitle>
            <DialogDescription>Changing stock here updates allocation risk and reorder logic across the system.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ea">Available</Label>
              <Input id="ea" type="number" min={0} value={avail} onChange={(e) => setAvail(Math.max(0, Number(e.target.value)))} className="font-mono" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ei">Incoming</Label>
              <Input id="ei" type="number" min={0} value={incoming} onChange={(e) => setIncoming(Math.max(0, Number(e.target.value)))} className="font-mono" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed">Damaged</Label>
              <Input id="ed" type="number" min={0} value={damaged} onChange={(e) => setDamaged(Math.max(0, Number(e.target.value)))} className="font-mono" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const res = wh.editStock(product.sku, { available: avail, incoming, damaged });
                if (res.ok) {
                  toast.success(`${product.sku} stock updated`);
                  setEditOpen(false);
                } else {
                  toast.error(res.error ?? "Update failed");
                }
              }}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
