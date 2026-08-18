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
import { Mono, PageHeader, SeverityPill, StatBlock } from "@/components/wms/ui";
import { useWarehouse } from "@/store/warehouse";
import { fmtAgo, fmtMoney } from "@/store/engine";
import type { Decision } from "@/store/types";
import { BrainCircuit, Check, CheckCircle2, Layers, PackageSearch, Timer, TrendingUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const KIND_META: Record<string, { icon: typeof BrainCircuit; hint: string }> = {
  "Stock Conflict": { icon: PackageSearch, hint: "Demand exceeds available stock for an SKU" },
  "At-Risk Order": { icon: Timer, hint: "An order is trending toward its deadline" },
  Replenishment: { icon: TrendingUp, hint: "Stock below reorder point" },
  Bottleneck: { icon: Layers, hint: "A stage is congesting fulfillment" },
  Allocation: { icon: BrainCircuit, hint: "Suggested allocation change" },
};

export default function DecisionCenter() {
  const wh = useWarehouse();
  const { state } = wh;
  const [modifyTarget, setModifyTarget] = useState<Decision | null>(null);
  const [altOption, setAltOption] = useState<string>("");
  const [altQty, setAltQty] = useState<number>(0);

  const pending = state.decisions.filter((d) => d.status === "Pending");
  const resolved = state.decisions.filter((d) => d.status !== "Pending");

  const grouped = useMemo(() => {
    const map = new Map<string, Decision[]>();
    for (const d of pending) {
      const list = map.get(d.kind) ?? [];
      list.push(d);
      map.set(d.kind, list);
    }
    return Array.from(map.entries());
  }, [pending]);

  const approve = (d: Decision) => {
    const r = wh.approveDecision(d.id);
    if (r.ok) toast.success("Decision approved — state updated");
    else toast.error(r.error ?? "Approval failed");
  };

  const reject = (d: Decision) => {
    const r = wh.rejectDecision(d.id);
    if (r.ok) toast.success("Decision rejected");
    else toast.error(r.error ?? "Reject failed");
  };

  const openModify = (d: Decision) => {
    setModifyTarget(d);
    setAltOption(d.options[1] ?? d.options[0] ?? "");
    setAltQty(d.params?.qty ?? 0);
  };

  const submitModify = () => {
    if (!modifyTarget) return;
    const r = wh.updateDecision(modifyTarget.id, {
      recommendation: altOption,
      status: "Modified",
      params: { ...modifyTarget.params, qty: altQty > 0 ? altQty : modifyTarget.params?.qty },
    });
    if (r.ok) {
      toast.success("Decision modified with your alternative");
      setModifyTarget(null);
    } else toast.error(r.error ?? "Modify failed");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Decision Center"
        title="Where the system asks for a call"
        description="NEXUS detects conflicts, computes options, and recommends one. Approve to execute, reject to decline, or modify to choose your own allocation."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <StatBlock label="Awaiting decision" value={pending.length} sub="recommendations in queue" spark={[4, 5, 6, 5, 7, 6]} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <StatBlock label="Resolved" value={resolved.length} sub={`${resolved.filter((d) => d.status === "Approved").length} approved`} spark={[2, 3, 5, 4, 6, 7]} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <StatBlock label="Open stock conflicts" value={state.decisions.filter((d) => d.kind === "Stock Conflict" && d.status === "Pending").length} sub="SKUs where demand > stock" spark={[3, 3, 4, 5, 4, 5]} />
          </CardContent>
        </Card>
      </div>

      {pending.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="size-7 text-ok" />
            <p className="text-sm font-medium">No open decisions</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              All recommendations have been resolved. The engine will raise new decisions when stock conflicts, delays, or bottlenecks appear.
            </p>
          </CardContent>
        </Card>
      )}

      {grouped.map(([kind, list]) => {
        const meta = KIND_META[kind] ?? KIND_META.Allocation;
        const Icon = meta.icon;
        return (
          <div key={kind} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Icon className="size-4 text-copper" />
              <h2 className="text-sm font-semibold">{kind}</h2>
              <span className="font-mono text-[11px] text-muted-foreground">{list.length} open</span>
              <p className="ml-auto hidden text-[11px] text-muted-foreground sm:block">{meta.hint}</p>
            </div>
            {list.map((d) => (
              <Card key={d.id} className="border-border/80">
                <CardContent className="flex flex-col gap-3 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Mono className="text-[12px] font-semibold text-foreground">{d.id}</Mono>
                    <span className="text-[13px] font-semibold">{d.title}</span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">{fmtAgo(d.createdAt)}</span>
                  </div>
                  <p className="text-[12px] leading-5 text-muted-foreground">{d.problem}</p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-border/70 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Data</p>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {d.data.map((line) => (
                          <li key={line} className="font-mono text-[11px] text-foreground">{line}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-md border border-border/70 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Options</p>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {d.options.map((o, i) => (
                          <li key={o} className={i === 0 ? "text-[12px] font-medium text-foreground" : "text-[12px] text-muted-foreground"}>
                            {i === 0 && <span className="mr-1 text-copper">●</span>}
                            {i > 0 && <span className="mr-1 text-muted-foreground/60">○</span>}
                            {o}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="rounded-md border border-copper/30 bg-copper/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-copper">System recommendation</p>
                    <p className="mt-1 text-[12px] font-medium leading-5 text-foreground">{d.recommendation}</p>
                    <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">{d.reasoning}</p>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
                      <span className="text-muted-foreground">Impact: <span className="font-medium text-ok">{d.impact}</span></span>
                      <span className="text-muted-foreground">Risk: <span className="font-medium text-danger">{d.risk}</span></span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                    <Button size="sm" className="h-8 gap-1.5" onClick={() => approve(d)}>
                      <Check className="size-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => reject(d)}>
                      <X className="size-3.5" /> Reject
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => openModify(d)}>
                      Modify…
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })}

      {/* recent resolved */}
      {resolved.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Recently resolved</h2>
          <Card>
            <CardContent className="flex flex-col gap-1.5 py-3">
              {resolved.slice(0, 6).map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-[12px] hover:bg-muted/50">
                  <Mono className="w-16 shrink-0">{d.id}</Mono>
                  <span className="min-w-0 flex-1 truncate">{d.title}</span>
                  <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">{d.recommendation}</span>
                  {d.status === "Approved" && <span className="rounded-full bg-ok/12 px-2 py-0.5 font-mono text-[10px] text-ok">Approved</span>}
                  {d.status === "Rejected" && <span className="rounded-full bg-danger/10 px-2 py-0.5 font-mono text-[10px] text-danger">Rejected</span>}
                  {d.status === "Modified" && <span className="rounded-full bg-info/10 px-2 py-0.5 font-mono text-[10px] text-info">Modified</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* modify dialog */}
      <Dialog open={!!modifyTarget} onOpenChange={(open) => { if (!open) setModifyTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modify decision {modifyTarget?.id}</DialogTitle>
            <DialogDescription>
              Pick a different option than the system recommended. The decision is logged as modified and applied to the relevant queues.
            </DialogDescription>
          </DialogHeader>
          {modifyTarget && (
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Choose alternative</p>
                <Select value={altOption} onValueChange={setAltOption}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {modifyTarget.options.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {modifyTarget.params?.qty !== undefined && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Units to allocate</p>
                  <input
                    type="number"
                    min={0}
                    value={altQty}
                    onChange={(e) => setAltQty(Number(e.target.value))}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 font-mono text-sm"
                  />
                </div>
              )}
              <p className="rounded-md bg-muted/60 p-2.5 text-[11px] leading-5 text-muted-foreground">
                Expected impact of this choice: {modifyTarget.impact} · Risk: {modifyTarget.risk}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModifyTarget(null)}>Cancel</Button>
            <Button onClick={submitModify}>Apply modified decision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
