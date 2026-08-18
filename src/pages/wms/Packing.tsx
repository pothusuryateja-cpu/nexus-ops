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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mono, PageHeader, SectionLabel, StatusPill } from "@/components/wms/ui";
import { useWarehouse } from "@/store/warehouse";
import { fmtDateTime, fmtMoney } from "@/store/engine";
import { Ban, CheckCircle2, PackageCheck, Play, Truck, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Packing() {
  const wh = useWarehouse();
  const { state } = wh;
  const navigate = useNavigate();
  const [failOrder, setFailOrder] = useState<string | null>(null);
  const [failReason, setFailReason] = useState("");

  const queue = useMemo(
    () => state.orders.filter((o) => o.stage === "Packing").sort((a, b) => new Date(a.promisedAt).getTime() - new Date(b.promisedAt).getTime()),
    [state.orders],
  );
  const qcPending = state.orders.filter((o) => o.stage === "QC" && o.qcStatus === "Pending");
  const qcPassed = state.orders.filter((o) => o.stage === "QC" && o.qcStatus === "Passed");
  const qcFailed = state.orders.filter((o) => o.qcStatus === "Failed");

  const run = (res: { ok: boolean; error?: string }, msg: string) => {
    if (res.ok) toast.success(msg);
    else toast.error(res.error ?? "Action failed");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Packing & QC"
        title="Packing stations and quality control"
        description="Packed orders flow into QC automatically. Failed inspections raise an exception and queue a re-run; passed orders move straight to dispatch."
      />

      <Tabs defaultValue="packing" className="w-full">
        <TabsList>
          <TabsTrigger value="packing">Packing ({queue.length})</TabsTrigger>
          <TabsTrigger value="qc">QC ({qcPending.length} pending)</TabsTrigger>
        </TabsList>

        <TabsContent value="packing" className="flex flex-col gap-4">
          {/* stations */}
          <div className="grid gap-3 md:grid-cols-3">
            {state.stations.map((st) => {
              const order = st.orderId ? state.orders.find((o) => o.id === st.orderId) : undefined;
              return (
                <Card key={st.id} className={cn("shadow-none", st.status === "Held" && "border-warn/40")}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{st.name}</p>
                      <StatusPill label={st.status} />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">avg {st.avgTimeMin} min / order</p>
                    {order ? (
                      <div className="mt-3 rounded-lg border border-border/60 p-3">
                        <div className="flex items-center justify-between">
                          <button className="font-mono text-xs font-semibold hover:text-copper" onClick={() => navigate(`/orders?order=${order.id}`)}>{order.id}</button>
                          {order.held && <StatusPill label="Held" />}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{order.customer}</p>
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => run(wh.markPacked(order.id), `${order.id} packed → QC`)}>
                            <PackageCheck className="size-3" /> Mark packed
                          </Button>
                          {order.held ? (
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => run(wh.resumePacking(order.id), `${order.id} resumed`)}>
                              <Play className="size-3" /> Resume
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => run(wh.holdPacking(order.id), `${order.id} held`)}>
                              <Ban className="size-3" /> Hold
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">Idle — assign the next queued order.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* queue */}
          <div>
            <SectionLabel className="mb-2">Packing queue · {queue.length}</SectionLabel>
            <Card className="shadow-none">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead className="border-b border-border/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Order</th>
                        <th className="px-4 py-2 font-medium">Customer</th>
                        <th className="px-4 py-2 font-medium">Value</th>
                        <th className="px-4 py-2 font-medium">Promised</th>
                        <th className="px-4 py-2 font-medium">Priority</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {queue.map((o) => (
                        <tr key={o.id} className="hover:bg-muted/40">
                          <td className="px-4 py-2">
                            <button className="font-mono font-medium hover:text-copper" onClick={() => navigate(`/orders?order=${o.id}`)}>{o.id}</button>
                            {o.held && <span className="ml-2 text-[10px] font-semibold text-warn">HELD</span>}
                          </td>
                          <td className="px-4 py-2">{o.customer}</td>
                          <td className="px-4 py-2 font-mono">{fmtMoney(o.value)}</td>
                          <td className={cn("px-4 py-2 text-muted-foreground", new Date(o.promisedAt).getTime() < Date.now() && "font-semibold text-danger")}>
                            {fmtDateTime(o.promisedAt)}
                          </td>
                          <td className={cn("px-4 py-2 font-mono", o.priority >= 70 && "text-danger")}>{o.priority}</td>
                          <td className="px-4 py-2"><StatusPill label={o.stage} dot={false} className="scale-90" /></td>
                          <td className="px-4 py-2">
                            {o.stationId ? (
                              <span className="text-[11px] text-muted-foreground">on {o.stationId}</span>
                            ) : (
                              <div className="flex gap-1.5">
                                {state.stations.filter((st) => st.status === "Idle").map((st) => (
                                  <Button key={st.id} size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => run(wh.startPacking(o.id, st.id), `${o.id} started on ${st.name}`)}>
                                    <Play className="size-3" /> {st.name}
                                  </Button>
                                ))}
                                {state.stations.every((st) => st.status !== "Idle") && (
                                  <span className="text-[11px] text-warn">all stations busy</span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="qc" className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="shadow-none">
              <CardContent className="p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">QC pending</p>
                <p className="mt-1.5 font-display text-2xl font-medium text-warn">{qcPending.length}</p>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardContent className="p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Passed · ready to dispatch</p>
                <p className="mt-1.5 font-display text-2xl font-medium text-ok">{qcPassed.length}</p>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardContent className="p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Failed · exception raised</p>
                <p className="mt-1.5 font-display text-2xl font-medium text-danger">{qcFailed.length}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">QC workbench</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="border-b border-border/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Order</th>
                      <th className="px-4 py-2 font-medium">Customer</th>
                      <th className="px-4 py-2 font-medium">Units</th>
                      <th className="px-4 py-2 font-medium">Promised</th>
                      <th className="px-4 py-2 font-medium">QC status</th>
                      <th className="px-4 py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {[...qcPending, ...qcPassed, ...qcFailed].map((o) => (
                      <tr key={o.id} className="hover:bg-muted/40">
                        <td className="px-4 py-2">
                          <button className="font-mono font-medium hover:text-copper" onClick={() => navigate(`/orders?order=${o.id}`)}>{o.id}</button>
                        </td>
                        <td className="px-4 py-2">{o.customer}</td>
                        <td className="px-4 py-2 font-mono">{o.totalQty}</td>
                        <td className="px-4 py-2 text-muted-foreground">{fmtDateTime(o.promisedAt)}</td>
                        <td className="px-4 py-2"><StatusPill label={o.qcStatus ?? "Pending"} /></td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1.5">
                            {o.qcStatus === "Pending" && (
                              <>
                                <Button size="sm" className="h-7 gap-1 bg-ok text-xs text-white hover:bg-ok/90" onClick={() => run(wh.qcPass(o.id), `${o.id} passed QC`)}>
                                  <CheckCircle2 className="size-3" /> Pass
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-danger" onClick={() => { setFailOrder(o.id); setFailReason(""); }}>
                                  <XCircle className="size-3" /> Fail
                                </Button>
                              </>
                            )}
                            {o.qcStatus === "Passed" && (
                              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => run(wh.dispatchOrder(o.id), `${o.id} dispatched`)}>
                                <Truck className="size-3" /> Dispatch
                              </Button>
                            )}
                            {o.qcStatus === "Failed" && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate("/exceptions")}>
                                View exception
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!failOrder} onOpenChange={(o) => { if (!o) setFailOrder(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Fail QC — <Mono>{failOrder}</Mono></DialogTitle>
            <DialogDescription>An exception will be raised automatically and the order queued for a re-run.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="failreason">Reason</Label>
            <Input id="failreason" value={failReason} onChange={(e) => setFailReason(e.target.value)} placeholder="e.g. label mismatch, damaged carton…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFailOrder(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!failOrder) return;
                const res = wh.qcFail(failOrder, failReason || "Manual QC failure");
                if (res.ok) toast.success(`${failOrder} failed QC — exception created`);
                else toast.error(res.error ?? "QC fail failed");
                setFailOrder(null);
              }}
            >
              Fail order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
