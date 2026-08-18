import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mono, PageHeader, SectionLabel, StatusPill } from "@/components/wms/ui";
import { OrderDetailDrawer } from "@/components/wms/OrderDetailDrawer";
import { useWarehouse } from "@/store/warehouse";
import { findConflicts, fmtDateTime, fmtMoney } from "@/store/engine";
import { AlertTriangle, ArrowRight, Layers, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Allocations() {
  const wh = useWarehouse();
  const { state } = wh;
  const [params, setParams] = useSearchParams();
  const detailId = params.get("order");

  const waiting = state.orders.filter(
    (o) => o.stage !== "Dispatched" && o.stage !== "Cancelled" && (o.allocationStatus === "None" || o.stage === "Created" || o.stage === "Prioritized"),
  );
  const partial = state.orders.filter((o) => o.allocationStatus === "Partial" && o.stage !== "Dispatched" && o.stage !== "Cancelled");
  const allocated = state.orders.filter((o) => o.allocationStatus === "Full" && o.stage !== "Dispatched" && o.stage !== "Cancelled");
  const conflicts = useMemo(() => findConflicts(state), [state]);

  const run = (res: { ok: boolean; error?: string }, msg: string) => {
    if (res.ok) toast.success(msg);
    else toast.error(res.error ?? "Action failed");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Allocations"
        title="Smart allocation"
        description="The allocation engine commits stock to orders by priority, detects conflicts in real time, and explains every recommendation before you approve it."
      />

      {/* conflicts */}
      {conflicts.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Active stock conflicts</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {conflicts.map((c) => {
              const prod = state.products.find((p) => p.sku === c.sku);
              return (
                <Card key={c.sku} className="border-warn/30 bg-warn/5 shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-4 text-warn" />
                      <Mono className="font-semibold">{c.sku}</Mono>
                      <span className="ml-auto text-[10px] text-muted-foreground">{prod?.name}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md border border-border/60 bg-background/60 py-2">
                        <p className="font-display text-lg font-medium text-warn">{c.available}</p>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">available</p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-background/60 py-2">
                        <p className="font-display text-lg font-medium text-danger">{c.demand}</p>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">demand</p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-background/60 py-2">
                        <p className="font-display text-lg font-medium">{c.orders.length}</p>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">orders</p>
                      </div>
                    </div>
                    <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
                      Top demand: <Mono>{c.orders[0].orderId}</Mono> (priority {c.orders[0].priority}, {c.orders[0].qty} units)
                    </p>
                    <Button size="sm" variant="outline" className="mt-3 h-7 gap-1 text-xs" onClick={() => {
                      const next = new URLSearchParams(params);
                      next.set("order", c.orders[0].orderId);
                      setParams(next);
                    }}>
                      Review order <ArrowRight className="size-3" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* waiting */}
      <Section>
        <SectionLabel>Waiting for allocation · {waiting.length}</SectionLabel>
        {waiting.length === 0 && <p className="py-3 text-xs text-muted-foreground">Nothing waiting — all demand is committed.</p>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {waiting.map((o) => (
            <Card key={o.id} className="shadow-none">
              <CardContent className="flex flex-col gap-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <button className="font-mono text-[13px] font-semibold hover:text-copper" onClick={() => setParams({ order: o.id })}>{o.id}</button>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">{o.customer}</p>
                  </div>
                  <StatusPill label={o.stage} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{o.totalQty} units · {fmtMoney(o.value)}</span>
                  <span className="font-mono">priority {o.priority}</span>
                </div>
                <div className="mt-auto flex items-center gap-1.5 border-t border-border/60 pt-2.5">
                  <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => run(wh.allocateOrder(o.id), `${o.id} allocated`)}>
                    <Layers className="size-3" /> Allocate
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setParams({ order: o.id })}>Details</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {/* partial */}
      <Section>
        <SectionLabel>Partially allocated · {partial.length}</SectionLabel>
        {partial.length === 0 && <p className="py-3 text-xs text-muted-foreground">No partial allocations.</p>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {partial.map((o) => {
            const short = o.items.filter((i) => i.allocated < i.qty);
            return (
              <Card key={o.id} className="border-warn/30 shadow-none">
                <CardContent className="flex flex-col gap-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <button className="font-mono text-[13px] font-semibold hover:text-copper" onClick={() => setParams({ order: o.id })}>{o.id}</button>
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground">{o.customer}</p>
                    </div>
                    <StatusPill label="Partial" />
                  </div>
                  <ul className="space-y-1 text-[11px]">
                    {short.map((i) => (
                      <li key={i.sku} className="flex justify-between">
                        <Mono>{i.sku}</Mono>
                        <span className="text-warn">{i.allocated}/{i.qty} allocated</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto flex items-center gap-1.5 border-t border-border/60 pt-2.5">
                    <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => run(wh.allocateOrder(o.id), `${o.id} re-allocated`)}>
                      <Layers className="size-3" /> Reallocate
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => run(wh.releaseAllocation(o.id), `Allocation released for ${o.id}`)}>
                      <Undo2 className="size-3" /> Release
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* fully allocated */}
      <Section>
        <SectionLabel>Fully allocated · {allocated.length}</SectionLabel>
        <Card className="shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="border-b border-border/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Order</th>
                    <th className="px-4 py-2 font-medium">Customer</th>
                    <th className="px-4 py-2 font-medium">Units</th>
                    <th className="px-4 py-2 font-medium">Value</th>
                    <th className="px-4 py-2 font-medium">Promised</th>
                    <th className="px-4 py-2 font-medium">Priority</th>
                    <th className="px-4 py-2 font-medium">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {allocated.slice(0, 12).map((o) => (
                    <tr key={o.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2">
                        <button className="font-mono font-medium hover:text-copper" onClick={() => setParams({ order: o.id })}>{o.id}</button>
                      </td>
                      <td className="px-4 py-2">{o.customer}</td>
                      <td className="px-4 py-2 font-mono">{o.totalQty}</td>
                      <td className="px-4 py-2 font-mono">{fmtMoney(o.value)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{fmtDateTime(o.promisedAt)}</td>
                      <td className={cn("px-4 py-2 font-mono", o.priority >= 70 ? "text-danger" : "")}>{o.priority}</td>
                      <td className="px-4 py-2"><StatusPill label={o.stage} dot={false} className="scale-90" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </Section>

      <OrderDetailDrawer open={!!detailId} onOpenChange={(open) => { if (!open) { const n = new URLSearchParams(params); n.delete("order"); setParams(n); } }} orderId={detailId ?? null} />
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-3">{children}</section>;
}
