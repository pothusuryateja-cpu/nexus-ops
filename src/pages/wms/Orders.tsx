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
import { Mono, PageHeader, Progress, SectionLabel, StatusPill } from "@/components/wms/ui";
import { OrderDetailDrawer } from "@/components/wms/OrderDetailDrawer";
import { useWarehouse } from "@/store/warehouse";
import { fmtDateTime, fmtMoney } from "@/store/engine";
import type { Order, Tier } from "@/store/types";
import { Ban, Layers, PackagePlus, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STAGE_FILTERS = ["All", "Created", "Prioritized", "Allocated", "Picking", "Packing", "QC", "Dispatched"] as const;
const SORTS = [
  { id: "priority", label: "Priority" },
  { id: "risk", label: "Risk" },
  { id: "created", label: "Created (newest)" },
  { id: "value", label: "Order value" },
  { id: "promised", label: "Promise (soonest)" },
] as const;

type Row = [string, number];

export default function Orders() {
  const wh = useWarehouse();
  const { state } = wh;
  const [params, setParams] = useSearchParams();
  const detailId = params.get("order");
  const zoneFilter = params.get("zone");

  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<string>("All");
  const [sort, setSort] = useState<string>("priority");
  const [showNew, setShowNew] = useState(false);

  // new order form
  const [customer, setCustomer] = useState("");
  const [tier, setTier] = useState<Tier>("Standard");
  const [rows, setRows] = useState<Row[]>([["SKU-101", 2]]);

  const active = state.orders.filter((o) => o.stage !== "Dispatched" && o.stage !== "Cancelled");
  const awaiting = active.filter((o) => o.allocationStatus === "None").length;
  const atRisk = active.filter((o) => o.risk >= 70).length;
  const dispatchedToday = state.orders.filter((o) => o.dispatchedAt && new Date(o.dispatchedAt).toDateString() === new Date().toDateString()).length;

  const filtered = useMemo(() => {
    let list = state.orders.slice();
    if (stage !== "All") list = list.filter((o) => o.stage === stage);
    if (zoneFilter) list = list.filter((o) => o.zone === zoneFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const inItems = o.items.some((i) => i.sku.toLowerCase().includes(q));
        return o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || inItems;
      });
    }
    switch (sort) {
      case "priority":
        list.sort((a, b) => b.priority - a.priority || b.risk - a.risk);
        break;
      case "risk":
        list.sort((a, b) => b.risk - a.risk);
        break;
      case "created":
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "value":
        list.sort((a, b) => b.value - a.value);
        break;
      case "promised":
        list.sort((a, b) => new Date(a.promisedAt).getTime() - new Date(b.promisedAt).getTime());
        break;
    }
    return list;
  }, [state.orders, stage, zoneFilter, query, sort]);

  const openOrder = (id: string) => setParams({ order: id });
  const closeOrder = () => {
    const next = new URLSearchParams(params);
    next.delete("order");
    setParams(next);
  };

  const submitNew = () => {
    const items = rows.filter(([sku, qty]) => sku.trim() && qty > 0).map(([sku, qty]) => ({ sku: sku.trim(), qty }));
    const res = wh.createOrder({ customer, tier, items });
    if (res.ok) {
      toast.success("Order created");
      setShowNew(false);
      setCustomer("");
      setRows([["SKU-101", 2]]);
    } else {
      toast.error(res.error ?? "Failed to create order");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Orders"
        title="Order management"
        description="Every order runs through the same pipeline — prioritize, allocate, pick, pack, QC, dispatch — with the priority engine scoring each one live."
        actions={
          <Button className="gap-1.5" onClick={() => setShowNew(true)}>
            <Plus className="size-4" /> New order
          </Button>
        }
      />

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Active orders", value: active.length },
          { label: "Awaiting allocation", value: awaiting, tone: awaiting > 0 ? "warn" : "" },
          { label: "At risk", value: atRisk, tone: atRisk > 0 ? "danger" : "" },
          { label: "Dispatched today", value: dispatchedToday, tone: "ok" },
        ].map((s) => (
          <Card key={s.label} className="shadow-none">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{s.label}</p>
              <p className={cn("mt-1.5 font-display text-2xl font-medium", s.tone === "warn" && "text-warn", s.tone === "danger" && "text-danger", s.tone === "ok" && "text-ok")}>
                {s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order ID, customer, SKU…"
            className="pl-9"
            aria-label="Search orders"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="h-9 w-[150px] text-xs" aria-label="Filter by stage">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              {STAGE_FILTERS.map((s) => (
                <SelectItem key={s} value={s}>{s === "All" ? "All stages" : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-9 w-[170px] text-xs" aria-label="Sort orders">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
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
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} orders</span>
        </div>
      </div>

      {/* order cards */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3">
            <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
              <p className="text-sm font-medium">No orders match</p>
              <p className="mt-1 text-xs text-muted-foreground">Try clearing the search or filters.</p>
            </div>
          </div>
        )}
        {filtered.map((o) => (
          <OrderCard key={o.id} order={o} onOpen={() => openOrder(o.id)} />
        ))}
      </div>

      {/* new order dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PackagePlus className="size-4" /> New order</DialogTitle>
            <DialogDescription>Enter order details — priority and risk are computed by the engine immediately.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ocustomer">Customer</Label>
                <Input id="ocustomer" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer name" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="otier">Customer tier</Label>
                <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
                  <SelectTrigger id="otier" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard">Standard</SelectItem>
                    <SelectItem value="Enterprise">Enterprise</SelectItem>
                    <SelectItem value="Premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <SectionLabel className="mb-2">Items</SectionLabel>
              <div className="flex flex-col gap-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select
                      value={row[0]}
                      onValueChange={(v) => setRows((r) => r.map((x, j) => (j === i ? [v, x[1]] : x)))}
                    >
                      <SelectTrigger className="h-9 flex-1 text-xs" aria-label={`Item ${i + 1} SKU`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {state.products.map((p) => (
                          <SelectItem key={p.sku} value={p.sku}>
                            <Mono>{p.sku}</Mono> — {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      value={row[1]}
                      onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? [x[0], Math.max(0, Number(e.target.value))] : x)))}
                      className="h-9 w-20 text-right font-mono"
                      aria-label={`Item ${i + 1} quantity`}
                    />
                    <Button variant="ghost" size="icon" className="size-9 text-muted-foreground" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} disabled={rows.length === 1} aria-label="Remove item">
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-2 h-8 gap-1 text-xs" onClick={() => setRows((r) => [...r, ["SKU-101", 1]])}>
                <Plus className="size-3.5" /> Add item
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={submitNew}>Create order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OrderDetailDrawer open={!!detailId} onOpenChange={(open) => { if (!open) closeOrder(); }} orderId={detailId ?? null} />
    </div>
  );
}

function OrderCard({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const wh = useWarehouse();
  const overdue = new Date(order.promisedAt).getTime() < Date.now() && order.stage !== "Dispatched" && order.stage !== "Cancelled";
  return (
    <Card className="group shadow-none transition-colors hover:border-foreground/20">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onOpen} className="text-left">
            <Mono className="text-[13px] font-semibold text-foreground group-hover:text-copper">{order.id}</Mono>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">{order.customer}</p>
          </button>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <StatusPill label={order.stage} />
            <StatusPill label={order.tier} dot={false} className="scale-90" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="font-display text-lg font-medium">{order.priority}</p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">priority</p>
          </div>
          <div>
            <p className={cn("font-display text-lg font-medium", order.risk >= 70 ? "text-danger" : order.risk >= 45 ? "text-warn" : "")}>{order.risk}</p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">risk</p>
          </div>
          <div>
            <p className="font-display text-lg font-medium">{fmtMoney(order.value)}</p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">value</p>
          </div>
        </div>

        <Progress value={order.priority} tone={order.priority >= 70 ? "danger" : order.priority >= 45 ? "warn" : "ok"} />

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{order.totalQty} units · {order.items.length} line(s)</span>
          <span className={cn("font-mono", overdue && "text-danger")}>
            {overdue ? "OVERDUE" : fmtDateTime(order.promisedAt)}
          </span>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onOpen}>Details</Button>
          {(order.stage === "Created" || order.stage === "Prioritized") && !order.held && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-copper" onClick={() => {
              const r = wh.allocateOrder(order.id);
              if (r.ok) toast.success(`${order.id} allocated`);
              else toast.error(r.error ?? "Allocation failed");
            }}>
              <Layers className="size-3" /> Allocate
            </Button>
          )}
          {order.stage === "Created" && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => {
              const r = wh.prioritizeOrder(order.id);
              if (r.ok) toast.success(`${order.id} prioritized`);
              else toast.error(r.error ?? "Prioritize failed");
            }}>
              Prioritize
            </Button>
          )}
          {order.qcStatus === "Passed" && order.stage !== "Dispatched" && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => {
              const r = wh.dispatchOrder(order.id);
              if (r.ok) toast.success(`${order.id} dispatched`);
              else toast.error(r.error ?? "Dispatch failed");
            }}>
              Dispatch
            </Button>
          )}
          {(order.stage === "Created" || order.stage === "Prioritized" || order.stage === "Allocated") && !order.held && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={() => {
              const r = wh.holdOrder(order.id);
              if (r.ok) toast.success(`${order.id} held`);
            }}>
              <Ban className="size-3" /> Hold
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
