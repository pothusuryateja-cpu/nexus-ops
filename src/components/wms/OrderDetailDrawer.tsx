import { Button } from "@/components/ui/button";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Mono, SectionLabel, StatusPill, Progress, ScoreBar } from "@/components/wms/ui";
import { useWarehouse } from "@/store/warehouse";
import { fmtAgo, fmtDateTime, fmtMoney, stockStatus } from "@/store/engine";
import type { Tier } from "@/store/types";
import {
  Ban,
  CheckCircle2,
  Circle,
  Flag,
  Layers,
  PackageCheck,
  Pencil,
  PlayCircle,
  Split,
  Truck,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STAGE_ORDER = ["Created", "Prioritized", "Allocated", "Picking", "Packing", "QC", "Dispatched"];

function run(res: { ok: boolean; error?: string }, successMsg: string) {
  if (res.ok) toast.success(successMsg);
  else toast.error(res.error ?? "Action failed");
}

export function OrderDetailDrawer({
  open,
  onOpenChange,
  orderId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
}) {
  const wh = useWarehouse();
  const { state } = wh;
  const navigate = useNavigate();
  const order = orderId ? state.orders.find((o) => o.id === orderId) : undefined;
  const [editOpen, setEditOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState("");
  const [editTier, setEditTier] = useState<Tier>("Standard");
  const [editPromised, setEditPromised] = useState("");

  if (!order) return null;

  const mission = order.missionId ? state.missions.find((m) => m.id === order.missionId) : undefined;
  const stageIdx = STAGE_ORDER.indexOf(order.stage);

  const close = () => onOpenChange(false);

  const openEdit = () => {
    setEditCustomer(order.customer);
    setEditTier(order.tier);
    setEditPromised(toLocalInput(order.promisedAt));
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editCustomer.trim()) {
      toast.error("Customer name is required.");
      return;
    }
    const res = wh.updateOrder(order.id, {
      customer: editCustomer.trim(),
      tier: editTier,
      promisedAt: new Date(editPromised).toISOString(),
    });
    if (res.ok) {
      toast.success(`${order.id} updated`);
      setEditOpen(false);
    } else {
      toast.error(res.error ?? "Update failed");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full p-0 sm:max-w-[560px]" aria-describedby={undefined}>
        <SheetHeader className="border-b border-border/70 px-5 pb-4 pt-5 text-left">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <SectionLabel>Order</SectionLabel>
              <SheetTitle className="mt-1 font-display text-2xl font-medium tracking-tight">
                <Mono>{order.id}</Mono>
              </SheetTitle>
              <SheetDescription className="sr-only">Order details for {order.id}</SheetDescription>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusPill label={order.stage} />
                <StatusPill label={order.tier} />
                {order.held && <StatusPill label="Held" />}
                {order.qcStatus && <StatusPill label={order.qcStatus} />}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 text-right">
              <p className="font-display text-2xl font-medium tracking-tight">{fmtMoney(order.value)}</p>
              <p className="text-xs text-muted-foreground">{order.totalQty} units</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
              <p className="mt-0.5 text-sm font-medium">{order.customer}</p>
              <p className="text-xs text-muted-foreground">Promised {fmtDateTime(order.promisedAt)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Risk</p>
              <ScoreBar value={order.risk} />
              <p className="mt-1 text-xs text-muted-foreground">Created {fmtAgo(order.createdAt)}</p>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-210px)]">
          <div className="px-5 py-4">
            {/* actions */}
            <div className="flex flex-wrap items-center gap-2">
              {order.stage !== "Dispatched" && order.stage !== "Cancelled" && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={openEdit}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
              )}
              {(order.stage === "Created" || order.stage === "Prioritized" || order.stage === "Held") && (
                <>
                  <Button size="sm" className="gap-1.5" onClick={() => { run(wh.allocateOrder(order.id), `${order.id} allocated`); }}>
                    <Layers className="size-3.5" /> Allocate
                  </Button>
                  {order.held ? (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run(wh.unholdOrder(order.id), `${order.id} resumed`)}>
                      <PlayCircle className="size-3.5" /> Resume
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run(wh.holdOrder(order.id), `${order.id} held`)}>
                      <Circle className="size-3.5" /> Hold
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1.5 text-danger" onClick={() => run(wh.cancelOrder(order.id), `${order.id} cancelled`)}>
                    <Ban className="size-3.5" /> Cancel
                  </Button>
                </>
              )}
              {order.stage === "Allocated" && (
                <>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate("/picking")}>
                    <PlayCircle className="size-3.5" /> Start picking
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run(wh.releaseAllocation(order.id), `Allocation released for ${order.id}`)}>
                    <Undo2 className="size-3.5" /> Release allocation
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-danger" onClick={() => run(wh.cancelOrder(order.id), `${order.id} cancelled`)}>
                    <Ban className="size-3.5" /> Cancel
                  </Button>
                </>
              )}
              {order.stage === "Packing" && (
                <Button size="sm" className="gap-1.5" onClick={() => navigate("/packing")}>
                  <PackageCheck className="size-3.5" /> Manage in packing
                </Button>
              )}
              {order.stage === "QC" && order.qcStatus === "Pending" && (
                <>
                  <Button size="sm" className="gap-1.5 bg-ok text-white hover:bg-ok/90" onClick={() => run(wh.qcPass(order.id), `${order.id} passed QC`)}>
                    <CheckCircle2 className="size-3.5" /> Pass QC
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-danger" onClick={() => run(wh.qcFail(order.id, "Manual QC failure"), `${order.id} failed QC`)}>
                    <Ban className="size-3.5" /> Fail QC
                  </Button>
                </>
              )}
              {order.qcStatus === "Passed" && order.stage !== "Dispatched" && (
                <Button size="sm" className="gap-1.5" onClick={() => run(wh.dispatchOrder(order.id), `${order.id} dispatched`)}>
                  <Truck className="size-3.5" /> Dispatch now
                </Button>
              )}
              {order.stage === "Dispatched" && (
                <p className="text-xs text-muted-foreground">Dispatched {order.dispatchedAt ? fmtAgo(order.dispatchedAt) : ""} — no further actions.</p>
              )}
            </div>

            {/* priority */}
            <div className="mt-5">
              <SectionLabel className="mb-2">Priority score — {order.priority}/100</SectionLabel>
              <Progress value={order.priority} tone={order.priority >= 70 ? "danger" : order.priority >= 45 ? "warn" : "ok"} className="h-2" />
              <ul className="mt-3 space-y-1.5">
                {order.priorityReasons.length === 0 && <li className="text-xs text-muted-foreground">Not computed for terminal orders.</li>}
                {order.priorityReasons.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="text-foreground/80">{r.label}</span>
                    <span className={cn("font-mono text-xs", r.points >= 20 ? "text-danger" : r.points >= 10 ? "text-warn" : "text-muted-foreground")}>
                      +{r.points}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <Separator className="my-5" />

            {/* items */}
            <SectionLabel className="mb-2">Items & availability</SectionLabel>
            <div className="overflow-hidden rounded-lg border border-border/70">
              <table className="w-full text-left text-[12.5px]">
                <thead className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Qty</th>
                    <th className="px-3 py-2 font-medium">Alloc</th>
                    <th className="px-3 py-2 font-medium">Picked</th>
                    <th className="px-3 py-2 font-medium">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {order.items.map((it) => {
                    const prod = state.products.find((p) => p.sku === it.sku);
                    const status = prod ? stockStatus(prod) : undefined;
                    const short = prod ? it.qty - it.allocated - prod.available : 0;
                    return (
                      <tr key={it.sku}>
                        <td className="px-3 py-2">
                          <Mono>{it.sku}</Mono>
                          <span className="ml-2 text-muted-foreground">{prod?.name}</span>
                        </td>
                        <td className="px-3 py-2 font-mono">{it.qty}</td>
                        <td className="px-3 py-2 font-mono text-info">{it.allocated}</td>
                        <td className="px-3 py-2 font-mono">{it.picked}</td>
                        <td className="px-3 py-2">
                          <span className="font-mono">{prod?.available ?? 0}</span>
                          {status && <StatusPill label={status} className="ml-2 scale-90" />}
                          {short > 0 && <span className="ml-1.5 text-[10px] font-semibold text-danger">short {short}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Allocation: <StatusPill label={order.allocationStatus} dot={false} className="ml-1" />
              {mission && (
                <span className="ml-2">
                  Mission <Mono>{mission.id}</Mono> · {mission.status} · {mission.progress}%
                </span>
              )}
            </p>

            <Separator className="my-5" />

            {/* timeline */}
            <SectionLabel className="mb-3">Fulfillment timeline</SectionLabel>
            <ol className="relative space-y-0">
              {order.history.map((h, i) => {
                const last = i === order.history.length - 1;
                return (
                  <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < order.history.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-border" aria-hidden />}
                    <span className={cn("mt-0.5 flex size-[15px] shrink-0 items-center justify-center rounded-full border", last ? "border-copper bg-copper/15 text-copper" : "border-border bg-card text-muted-foreground")}>
                      {last ? <Flag className="size-2.5" /> : <CheckCircle2 className="size-2.5" />}
                    </span>
                    <div className="min-w-0">
                      <p className={cn("text-[12.5px] font-medium", last ? "text-foreground" : "text-foreground/75")}>{h.label}</p>
                      {h.detail && <p className="text-xs text-muted-foreground">{h.detail}</p>}
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">{fmtAgo(h.at)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </ScrollArea>
      </SheetContent>

      {/* edit order dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit order — <Mono>{order.id}</Mono></DialogTitle>
            <DialogDescription>
              Changes update the order record immediately. Re-scoring priority and risk picks up the new tier and promise window.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-customer">Customer</Label>
              <Input id="edit-customer" value={editCustomer} onChange={(e) => setEditCustomer(e.target.value)} placeholder="Customer name" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tier">Customer tier</Label>
              <Select value={editTier} onValueChange={(v) => setEditTier(v as Tier)}>
                <SelectTrigger id="edit-tier" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Standard">Standard</SelectItem>
                  <SelectItem value="Enterprise">Enterprise</SelectItem>
                  <SelectItem value="Premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-promised">Promise window</Label>
              <Input id="edit-promised" type="datetime-local" value={editPromised} onChange={(e) => setEditPromised(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}


