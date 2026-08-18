import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mono, PageHeader, SeverityPill, StatusPill, StatBlock } from "@/components/wms/ui";
import { useWarehouse } from "@/store/warehouse";
import { fmtAgo, fmtDateTime } from "@/store/engine";
import type { ExceptionRecord } from "@/store/types";
import { CheckCircle2, Eye, MessageSquareWarning, Play, RefreshCcw, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TYPES = ["All", "Damaged Item", "Missing Item", "Low Stock", "Out of Stock", "Delayed Order", "Picking Delay", "QC Failure", "Misallocation"] as const;
const STATUSES = ["All", "Detected", "Analyzing", "Decision Required", "In Progress", "Resolved"] as const;

function NextAction({ ex }: { ex: ExceptionRecord }) {
  const wh = useWarehouse();
  switch (ex.status) {
    case "Detected":
      return (
        <Button size="sm" className="h-7 text-xs" onClick={() => { const r = wh.analyzeException(ex.id); r.ok ? toast.success("Exception sent for analysis") : toast.error(r.error ?? "Action failed"); }}>
          <Eye className="size-3.5" /> Analyze
        </Button>
      );
    case "Analyzing":
      return (
        <Button size="sm" className="h-7 text-xs" onClick={() => { const r = wh.requestDecision(ex.id); r.ok ? toast.success("Decision requested") : toast.error(r.error ?? "Action failed"); }}>
          <MessageSquareWarning className="size-3.5" /> Request decision
        </Button>
      );
    case "Decision Required":
      return (
        <Button size="sm" className="h-7 text-xs" onClick={() => { const r = wh.startResolution(ex.id); r.ok ? toast.success("Resolution started") : toast.error(r.error ?? "Action failed"); }}>
          <Play className="size-3.5" /> Start resolution
        </Button>
      );
    case "In Progress":
      return (
        <div className="flex gap-1.5">
          {ex.type === "Damaged Item" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { const r = wh.createReplacementAllocation(ex.id); r.ok ? toast.success("Replacement allocation created") : toast.error(r.error ?? "Action failed"); }}>
              <RefreshCcw className="size-3.5" /> Replacement allocation
            </Button>
          )}
          <Button size="sm" className="h-7 text-xs" onClick={() => { const r = wh.resolveException(ex.id, ex.recommendation); r.ok ? toast.success("Exception resolved") : toast.error(r.error ?? "Action failed"); }}>
            <CheckCircle2 className="size-3.5" /> Resolve
          </Button>
        </div>
      );
    default:
      return null;
  }
}

export default function Exceptions() {
  const wh = useWarehouse();
  const { state } = wh;
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>("All");
  const [status, setStatus] = useState<string>("All");

  const open = state.exceptions.filter((e) => e.status !== "Resolved");
  const critical = open.filter((e) => e.severity === "Critical");
  const resolvedToday = state.exceptions.filter(
    (e) => e.resolvedAt && new Date(e.resolvedAt).toDateString() === new Date().toDateString(),
  );

  const filtered = useMemo(() => {
    let list = state.exceptions.slice().sort((a, b) => {
      const order = { Critical: 0, High: 1, Medium: 2, Low: 3 } as const;
      const s = order[a.severity] - order[b.severity];
      return s || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    if (type !== "All") list = list.filter((e) => e.type === type);
    if (status !== "All") list = list.filter((e) => e.status === status);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((e) => (e.id + e.type + (e.sku ?? "") + (e.orderId ?? "") + (e.cause ?? "")).toLowerCase().includes(q));
    return list;
  }, [state.exceptions, type, status, query]);

  const stages = ["Detected", "Analyzing", "Decision Required", "In Progress", "Resolved"];
  const stageIndex = (s: string) => stages.indexOf(s);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Exception war room"
        title="Exception management"
        description="Every exception follows a fixed workflow — detected, analyzed, decision, action, resolved. Resolutions update inventory, orders, and the activity feed."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <StatBlock label="Open exceptions" value={open.length} sub={`${critical.length} critical`} spark={[5, 7, 6, 8, 9, 7]} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <StatBlock label="Critical" value={critical.length} sub="need attention now" spark={[2, 3, 3, 4, 3, 5]} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <StatBlock label="Resolved today" value={resolvedToday.length} sub={`${state.exceptions.filter((e) => e.status === "Resolved").length} all time`} spark={[1, 2, 3, 2, 4, 6]} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <StatBlock label="Avg resolution time" value={`${Math.max(1, Math.round(open.reduce((n, e) => n + stageIndex(e.status) * 7, 0) / Math.max(open.length, 1)))}m`} sub="target under 45m" spark={[40, 38, 42, 36, 33, 30]} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exceptions…" className="h-9 w-56 pl-8" />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {filtered.map((ex) => (
          <Card key={ex.id} className={ex.severity === "Critical" && ex.status !== "Resolved" ? "border-danger/40" : undefined}>
            <CardContent className="flex flex-col gap-3 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Mono className="text-[12px] font-semibold text-foreground">{ex.id}</Mono>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">{ex.type}</span>
                <SeverityPill severity={ex.severity} />
                <StatusPill label={ex.status} />
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">{fmtAgo(ex.createdAt)}</span>
              </div>

              <div className="grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-2">
                {ex.sku && <p className="text-muted-foreground">SKU <Mono className="text-foreground">{ex.sku}</Mono></p>}
                {ex.orderId && <p className="text-muted-foreground">Order <Mono className="text-foreground">{ex.orderId}</Mono></p>}
                {ex.zone && <p className="text-muted-foreground">Zone <Mono className="text-foreground">{ex.zone}</Mono></p>}
                <p className="text-muted-foreground">Cause: <span className="text-foreground">{ex.cause}</span></p>
              </div>

              <div className="rounded-md border border-border/70 bg-muted/40 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recommended action</p>
                <p className="mt-1 text-[12px] leading-5 text-foreground">{ex.recommendation}</p>
              </div>

              {/* workflow stepper */}
              <div className="flex items-center gap-1" aria-label="Exception workflow">
                {stages.map((s, i) => {
                  const done = i < stageIndex(ex.status);
                  const current = i === stageIndex(ex.status);
                  return (
                    <div key={s} className="flex flex-1 items-center gap-1">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={cn(
                            "flex size-4 items-center justify-center rounded-full border text-[9px]",
                            done && "border-ok/40 bg-ok/15 text-ok",
                            current && "border-copper bg-copper/15 text-copper",
                            !done && !current && "border-border text-muted-foreground/60",
                          )}
                        >
                          {done ? "✓" : i + 1}
                        </span>
                        <span className={cn("text-[9px] uppercase tracking-wider", current ? "text-copper" : "text-muted-foreground/70")}>{s}</span>
                      </div>
                      {i < stages.length - 1 && <div className={cn("mb-4 h-px flex-1", i < stageIndex(ex.status) ? "bg-ok/50" : "bg-border")} />}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 border-t border-border/60 pt-3">
                <NextAction ex={ex} />
                {ex.resolvedAt && (
                  <p className="text-[11px] text-muted-foreground">Resolved {fmtDateTime(ex.resolvedAt)}</p>
                )}
                {ex.resolution && ex.status === "Resolved" && (
                  <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={ex.resolution}>“{ex.resolution}”</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="xl:col-span-2">
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <ShieldAlert className="size-6 text-muted-foreground" />
                <p className="text-sm font-medium">No exceptions match this view</p>
                <p className="text-xs text-muted-foreground">The war room is clear — or adjust the filters.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
