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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mono, PageHeader, Progress, SectionLabel, StatusPill, StatBlock } from "@/components/wms/ui";
import { OrderDetailDrawer } from "@/components/wms/OrderDetailDrawer";
import { useWarehouse } from "@/store/warehouse";
import { fmtDateTime, fmtMoney, fmtTime } from "@/store/engine";
import type { Order } from "@/store/types";
import { CheckCircle2, Clock, PackageCheck, Plus, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CARRIERS = ["NEXUS Fleet", "Swift Logistics", "DHL Express", "UPS Ground", "Local Courier"];

export default function Dispatch() {
  const wh = useWarehouse();
  const { state } = wh;
  const [params, setParams] = useSearchParams();
  const detailId = params.get("order");
  const [carrier, setCarrier] = useState(CARRIERS[0]);
  const [showNewBatch, setShowNewBatch] = useState(false);

  // Orders that finished QC and are ready to ship (not yet in a dispatched batch)
  const readyToDispatch = state.orders.filter(
    (o) => o.stage === "QC" && o.qcStatus === "Passed" && o.allocationStatus !== "Released",
  );
  const inBatches = new Set(state.batches.filter((b) => b.status !== "Dispatched").flatMap((b) => b.orderIds));
  const unbatched = readyToDispatch.filter((o) => !inBatches.has(o.id));
  const dispatchedToday = state.orders.filter(
    (o) => o.dispatchedAt && new Date(o.dispatchedAt).toDateString() === new Date().toDateString(),
  );
  const delayed = state.orders.filter((o) => o.risk >= 70 && o.stage !== "Dispatched" && o.stage !== "Cancelled");
  const batches = state.batches.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const picked = useMemo(() => {
    const c = new Map<string, number>();
    for (const o of state.orders) for (const i of o.items) c.set(i.sku, (c.get(i.sku) ?? 0) + (i.packed || 0));
    return c;
  }, [state.orders]);

  const openOrder = (id: string) => setParams({ order: id });
  const closeOrder = () => {
    const next = new URLSearchParams(params);
    next.delete("order");
    setParams(next);
  };

  const createBatch = () => {
    const ids = unbatched.slice(0, 6).map((o) => o.id);
    if (!ids.length) {
      toast.error("No orders ready to dispatch");
      return;
    }
    const res = wh.createBatch(ids, carrier);
    if (res.ok) {
      toast.success(`Batch ${res.id ?? ""} created with ${ids.length} orders`);
      setShowNewBatch(false);
    } else toast.error(res.error ?? "Failed to create batch");
  };

  const dispatchBatch = (id: string) => {
    const res = wh.dispatchBatch(id);
    if (res.ok) toast.success(`Batch ${id} dispatched — inventory committed & orders closed`);
    else toast.error(res.error ?? "Dispatch failed");
  };

  const markReady = (id: string) => {
    const res = wh.markBatchReady(id);
    if (res.ok) toast.success(`Batch ${id} marked ready for shipment`);
    else toast.error(res.error ?? "Could not mark batch ready");
  };

  const dispatchSingle = (o: Order) => {
    // dispatch a QC-passed order directly through a one-order batch
    const batch = wh.createBatch([o.id], carrier);
    if (!batch.ok) {
      toast.error(batch.error ?? "Dispatch failed");
      return;
    }
    if (!batch.id) {
      toast.error("Dispatch failed — batch could not be created");
      return;
    }
    const res = wh.dispatchBatch(batch.id);
    if (res.ok) toast.success(`${o.id} dispatched · ${carrier}`);
    else toast.error(res.error ?? "Dispatch failed");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Dispatch"
        title="Dispatch control"
        description="Shipments leave the dock in batches. QC-passed orders are packed into batches, marked ready, then dispatched — at which point stock is committed out of inventory."
        actions={
          <Button className="gap-1.5" onClick={() => setShowNewBatch(true)} disabled={!unbatched.length}>
            <Plus className="size-4" /> Create batch
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <StatBlock label="Ready for dispatch" value={unbatched.length} sub={`${readyToDispatch.length} passed QC`} spark={[3, 5, 4, 7, 6, 8]} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <StatBlock label="Dispatched today" value={dispatchedToday.length} sub={`${batches.filter((b) => b.status === "Dispatched").length} batches moved`} spark={[1, 2, 4, 3, 6, 5]} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <StatBlock label="Open batches" value={batches.filter((b) => b.status !== "Dispatched").length} sub={`${state.batches.reduce((n, b) => n + b.orderIds.length, 0)} orders staged`} spark={[2, 3, 2, 4, 3, 5]} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <StatBlock label="At-risk shipments" value={delayed.length} sub="orders flagged by risk engine" spark={[4, 5, 6, 5, 7, 8]} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        {/* left: ready queue + batches */}
        <div className="flex flex-col gap-6 xl:col-span-3">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium">Dock queue — ready to ship</CardTitle>
              <span className="font-mono text-[11px] text-muted-foreground">{unbatched.length} orders</span>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {unbatched.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No orders waiting at the dock. Orders reach the queue after QC passes.
                </p>
              )}
              {unbatched.slice(0, 12).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => openOrder(o.id)}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/70 px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-muted/50"
                >
                  <Mono className="w-20 shrink-0 text-[12px] text-foreground">{o.id}</Mono>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{o.customer}</span>
                  <span className="hidden text-[11px] text-muted-foreground sm:block">
                    {o.items.length} line{o.items.length > 1 ? "s" : ""} · {o.totalQty} units
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{fmtMoney(o.value)}</span>
                  <StatusPill label={o.risk >= 70 ? "High" : o.risk >= 45 ? "Medium" : "Low"} />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatchSingle(o);
                    }}
                  >
                    <Truck className="size-3.5" /> Dispatch
                  </Button>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <SectionLabel>Dispatch batches</SectionLabel>
            {batches.length === 0 && <p className="text-xs text-muted-foreground">No batches created yet.</p>}
            {batches.map((b) => {
              const orders = b.orderIds.map((id) => state.orders.find((o) => o.id === id)).filter(Boolean) as Order[];
              const units = orders.reduce((n, o) => n + o.totalQty, 0);
              return (
                <Card key={b.id}>
                  <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-3 py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Mono className="text-sm text-foreground">#{b.id}</Mono>
                        <StatusPill label={b.status} />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {b.carrier} · {orders.length} orders · {units} units · {fmtDateTime(b.createdAt)}
                      </p>
                    </div>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      {b.status === "Planned" && (
                        <Button size="sm" variant="outline" onClick={() => markReady(b.id)}>
                          <PackageCheck className="size-3.5" /> Mark ready
                        </Button>
                      )}
                      {b.status === "Ready" && (
                        <Button size="sm" onClick={() => dispatchBatch(b.id)}>
                          <Truck className="size-3.5" /> Dispatch batch
                        </Button>
                      )}
                      {b.status === "Dispatched" && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CheckCircle2 className="size-4 text-ok" /> Departed {fmtTime(b.dispatchedAt ?? "")}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* right: QC waiting + dispatched today */}
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Clock className="size-4 text-warn" /> Waiting on QC
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {state.orders
                .filter((o) => o.stage === "QC")
                .slice(0, 8)
                .map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => openOrder(o.id)}
                    className="flex items-center gap-3 rounded-md border border-border/70 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <Mono className="text-[12px]">{o.id}</Mono>
                    <span className="min-w-0 flex-1 truncate text-[13px]">{o.customer}</span>
                    <StatusPill label={o.qcStatus === "Passed" ? "Passed" : "Pending"} />
                  </button>
                ))}
              {!state.orders.some((o) => o.stage === "QC") && (
                <p className="py-4 text-center text-xs text-muted-foreground">QC queue is clear.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium">Dispatched today</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {dispatchedToday.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">No dispatches yet today.</p>
              )}
              {dispatchedToday.slice(0, 10).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => openOrder(o.id)}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                >
                  <div>
                    <Mono className="text-[12px]">{o.id}</Mono>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{o.customer}</p>
                  </div>
                  <span className="font-mono text-[11px] text-ok">{fmtTime(o.dispatchedAt ?? "")}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Dispatch performance</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {[
                { label: "Orders dispatched", value: dispatchedToday.length, max: Math.max(dispatchedToday.length, 12), tone: "bg-ok" },
                { label: "On-time rate (live)", value: 94, max: 100, tone: "bg-copper" },
                { label: "Avg batch size", value: Math.round(state.batches.reduce((n, b) => n + b.orderIds.length, 0) / Math.max(state.batches.length, 1)), max: 12, tone: "bg-info" },
              ].map((r) => (
                <div key={r.label}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="font-mono">{r.value}</span>
                  </div>
                  <Progress value={(r.value / r.max) * 100} className={cn("h-1.5", r.tone)} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showNewBatch} onOpenChange={setShowNewBatch}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create dispatch batch</DialogTitle>
            <DialogDescription>
              Group up to 6 QC-passed orders into a single shipment. Orders leave the dock together.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Carrier</p>
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARRIERS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Included orders</p>
              <div className="flex flex-col gap-1">
                {unbatched.slice(0, 6).map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-[12px]">
                    <Mono>{o.id}</Mono>
                    <span className="text-muted-foreground">{o.customer} · {fmtMoney(o.value)}</span>
                  </div>
                ))}
                {unbatched.length === 0 && <p className="text-xs text-muted-foreground">No orders in the dock queue.</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBatch(false)}>Cancel</Button>
            <Button onClick={createBatch} disabled={!unbatched.length}>Create batch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OrderDetailDrawer open={!!detailId} onOpenChange={(open) => { if (!open) closeOrder(); }} orderId={detailId ?? null} />
    </div>
  );
}
