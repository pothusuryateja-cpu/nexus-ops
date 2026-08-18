import { ActivityFeed } from "@/components/wms/ActivityFeed";
import { DemoOverlay } from "@/components/wms/DemoOverlay";
import { Mono, PageHeader, Progress, SectionLabel, SeverityPill, StatusPill } from "@/components/wms/ui";
import { WarehouseMap, computeZoneStats } from "@/components/wms/WarehouseMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWarehouse } from "@/store/warehouse";
import { DAY, detectBottlenecks, fmtAgo, fmtDateTime, fmtMoney, HOUR, stockStatus } from "@/store/engine";
import { AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, Package, XCircle } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function CommandCenter() {
  const wh = useWarehouse();
  const { state } = wh;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const zoneId = params.get("zone");
  const now = Date.now();

  const kpis = useMemo(() => {
    // daily series (7 days)
    const days: { key: string; label: string; created: number; dispatched: number; atRisk: number; exceptions: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const ts = now - i * DAY;
      const key = dayKey(ts);
      days.push({ key, label: new Date(ts).toLocaleDateString([], { weekday: "short" }), created: 0, dispatched: 0, atRisk: 0, exceptions: 0 });
    }
    const dayMap = new Map(days.map((d) => [d.key, d]));
    for (const o of state.orders) {
      const ck = dayKey(new Date(o.createdAt).getTime());
      if (dayMap.has(ck)) dayMap.get(ck)!.created++;
      const dk = o.dispatchedAt ? dayKey(new Date(o.dispatchedAt).getTime()) : null;
      if (dk && dayMap.has(dk)) dayMap.get(dk)!.dispatched++;
      if (o.risk >= 70 && dayMap.has(ck)) dayMap.get(ck)!.atRisk++;
    }
    for (const e of state.exceptions) {
      const ek = dayKey(new Date(e.createdAt).getTime());
      if (dayMap.has(ek)) dayMap.get(ek)!.exceptions++;
    }

    const today = dayMap.get(dayKey(now))!;
    const yesterday = dayMap.get(dayKey(now - DAY))!;
    const last7 = days.reduce((s, d) => s + d.created, 0);
    const prev7 = state.orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= now - 14 * DAY && t < now - 7 * DAY;
    }).length;
    const last7Fulfilled = days.reduce((s, d) => s + d.dispatched, 0);
    const prev7Fulfilled = state.orders.filter((o) => {
      const t = o.dispatchedAt ? new Date(o.dispatchedAt).getTime() : null;
      return t !== null && t >= now - 14 * DAY && t < now - 7 * DAY;
    }).length;
    const prev7Created = state.orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= now - 14 * DAY && t < now - 7 * DAY;
    }).length;

    const atRisk = state.orders.filter((o) => o.risk >= 70 && o.stage !== "Dispatched" && o.stage !== "Cancelled").length;
    const healthy = state.products.filter((p) => stockStatus(p) === "Healthy").length;
    const pickersActive = state.pickers.filter((p) => p.status === "Active").length;
    const critical = state.exceptions.filter((e) => e.status !== "Resolved" && (e.severity === "Critical" || e.severity === "High")).length;

    const orderDelta = today.created - yesterday.created;
    const fulfillmentRate = last7 ? Math.round((last7Fulfilled / last7) * 100) : 0;
    const prevRate = prev7Created ? Math.round((prev7Fulfilled / prev7Created) * 100) : 0;

    return {
      ordersToday: today.created,
      orderDelta,
      orderSpark: days.map((d) => d.created),
      fulfillmentRate,
      fulfillmentDelta: fulfillmentRate - prevRate,
      fulfillmentSpark: days.map((d) => d.dispatched),
      atRisk,
      atRiskSpark: days.map((d) => d.atRisk),
      inventoryHealth: Math.round((healthy / state.products.length) * 100),
      inventorySpark: days.map((d) => d.exceptions),
      pickersActive,
      critical,
      criticalSpark: days.map((d) => d.exceptions),
    };
  }, [state, now]);

  const bottleneck = useMemo(() => detectBottlenecks(state)[0], [state]);
  const pending = useMemo(
    () => state.decisions.filter((d) => d.status === "Pending").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [state],
  );

  const zone = zoneId ? state.zones.find((z) => z.id === zoneId) : undefined;
  const zoneStats = zone ? computeZoneStats(state, zone.id) : null;
  const zoneOrders = zone ? state.orders.filter((o) => o.zone === zone.id && o.stage !== "Dispatched" && o.stage !== "Cancelled").slice(0, 5) : [];
  const zoneExceptions = zone ? state.exceptions.filter((e) => e.zone === zone.id && e.status !== "Resolved") : [];
  const zoneLowStock = zone ? state.products.filter((p) => p.zone === zone.id && stockStatus(p) !== "Healthy").slice(0, 5) : [];
  const zonePickers = zone ? state.pickers.filter((p) => p.zone === zone.id && p.status !== "Offline") : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Command Center"
        title="Warehouse operations overview"
        description="Live view of orders, inventory, pickers and exceptions across the facility — with engine-driven recommendations on top."
        actions={
          <>
            {state.settings.demoMode && <DemoOverlay />}
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => navigate("/simulator")}>
              What-if simulator <ArrowRight className="size-3.5" />
            </Button>
          </>
        }
      />

      {/* bottleneck alert */}
      {bottleneck && bottleneck.impactMin > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3">
          <AlertTriangle className="size-4 shrink-0 text-warn" />
          <p className="text-[13px]">
            <span className="font-semibold">{bottleneck.stage} bottleneck:</span>{" "}
            {bottleneck.queue} order(s) queued, ~{bottleneck.avgMin} min average vs {bottleneck.normalMin} min normal — estimated impact{" "}
            <span className="font-semibold text-warn">+{bottleneck.impactMin} min</span>.
          </p>
          <Button size="sm" variant="outline" className="ml-auto h-7 gap-1 text-xs" onClick={() => navigate("/decisions")}>
            Review recommendation <ArrowRight className="size-3" />
          </Button>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Orders Today" value={kpis.ordersToday} delta={kpis.orderDelta} suffix="" spark={kpis.orderSpark} sub={`${state.orders.filter((o) => o.stage === "Dispatched").length} dispatched total`} />
        <KpiCard label="Fulfillment Rate" value={`${kpis.fulfillmentRate}%`} delta={kpis.fulfillmentDelta} spark={kpis.fulfillmentSpark} sub="last 7 days" tone={kpis.fulfillmentRate >= 75 ? "ok" : kpis.fulfillmentRate >= 60 ? "warn" : "danger"} />
        <KpiCard label="Orders At Risk" value={kpis.atRisk} delta={-kpis.atRisk} suffix="" spark={kpis.atRiskSpark} sub="risk score ≥ 70" tone={kpis.atRisk === 0 ? "ok" : kpis.atRisk <= 3 ? "warn" : "danger"} />
        <KpiCard label="Inventory Health" value={`${kpis.inventoryHealth}%`} spark={kpis.inventorySpark} sub={`${state.products.filter((p) => stockStatus(p) === "Healthy").length}/${state.products.length} SKUs healthy`} tone={kpis.inventoryHealth >= 80 ? "ok" : kpis.inventoryHealth >= 65 ? "warn" : "danger"} />
        <KpiCard label="Active Pickers" value={kpis.pickersActive} suffix="" sub={`${state.pickers.length} total · ${state.missions.filter((m) => m.status === "Active").length} missions live`} tone={kpis.pickersActive >= 3 ? "ok" : "warn"} />
        <KpiCard label="Critical Exceptions" value={kpis.critical} spark={kpis.criticalSpark} sub={`${state.exceptions.filter((e) => e.status !== "Resolved").length} open total`} tone={kpis.critical === 0 ? "ok" : kpis.critical <= 2 ? "warn" : "danger"} />
      </div>

      {/* map + inspector */}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold">Warehouse floor plan</CardTitle>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-info" /> orders</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-copper" /> pickers</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-warn" /> low stock</span>
              <span className="flex items-center gap-1"><span className="live-dot size-2 rounded-full bg-danger" /> exceptions</span>
            </div>
          </CardHeader>
          <CardContent>
            <WarehouseMap selected={zoneId} onSelect={(z) => setParams(z === zoneId ? {} : { zone: z })} />
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{zone ? `Zone ${zone.id} — ${zone.name}` : "Zone inspector"}</CardTitle>
          </CardHeader>
          <CardContent>
            {!zone && <p className="text-xs leading-5 text-muted-foreground">Click any zone on the map to inspect its inventory, orders, pickers and exceptions.</p>}
            {zone && zoneStats && (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Utilization</span>
                    <Mono>{zoneStats.utilization}%</Mono>
                  </div>
                  <Progress value={zoneStats.utilization} tone={zoneStats.utilization > 85 ? "danger" : zoneStats.utilization > 60 ? "warn" : "ok"} className="mt-1.5" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg border border-border/70 py-2.5">
                    <p className="font-display text-xl font-medium">{zoneStats.orders}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">orders</p>
                  </div>
                  <div className="rounded-lg border border-border/70 py-2.5">
                    <p className="font-display text-xl font-medium">{zoneStats.pickers}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">pickers</p>
                  </div>
                  <div className="rounded-lg border border-border/70 py-2.5">
                    <p className="font-display text-xl font-medium text-warn">{zoneStats.lowStock}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">low stock</p>
                  </div>
                  <div className="rounded-lg border border-border/70 py-2.5">
                    <p className="font-display text-xl font-medium text-danger">{zoneStats.exceptions}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">exceptions</p>
                  </div>
                </div>

                <div>
                  <SectionLabel className="mb-1.5">Active orders</SectionLabel>
                  {zoneOrders.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
                  <ul className="space-y-1">
                    {zoneOrders.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2 text-xs">
                        <button className="font-mono text-foreground hover:text-copper" onClick={() => navigate(`/orders?order=${o.id}`)}>{o.id}</button>
                        <StatusPill label={o.stage} dot={false} className="scale-90" />
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <SectionLabel className="mb-1.5">Low-stock SKUs</SectionLabel>
                  {zoneLowStock.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
                  <ul className="space-y-1">
                    {zoneLowStock.map((p) => (
                      <li key={p.sku} className="flex items-center justify-between gap-2 text-xs">
                        <button className="font-mono text-foreground hover:text-copper" onClick={() => navigate(`/inventory?sku=${p.sku}`)}>{p.sku}</button>
                        <StatusPill label={stockStatus(p)} dot={false} className="scale-90" />
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/orders?zone=${zone.id}`)}>View orders</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/inventory?zone=${zone.id}`)}>View stock</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/exceptions?zone=${zone.id}`)}>Exceptions</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* decisions + activity */}
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <BrainCircuit className="size-4 text-copper" /> Active decisions
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => navigate("/decisions")}>
              Decision Center <ArrowRight className="size-3" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pending.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No pending decisions — engines are in balance.</p>}
            {pending.slice(0, 3).map((d) => (
              <div key={d.id} className="rounded-lg border border-border/70 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusPill label={d.kind} dot={false} className="scale-90" />
                      <Mono className="text-[10px] text-muted-foreground">{d.id}</Mono>
                    </div>
                    <p className="mt-1.5 text-[13px] font-medium leading-5">{d.title}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{fmtAgo(d.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{d.recommendation}</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => {
                    const res = wh.approveDecision(d.id);
                    if (res.ok) toast.success(`${d.id} approved`);
                    else toast.error(res.error ?? "Approval failed");
                  }}>
                    <CheckCircle2 className="size-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => {
                    const res = wh.rejectDecision(d.id);
                    if (res.ok) toast.success(`${d.id} rejected`);
                    else toast.error(res.error ?? "Reject failed");
                  }}>
                    <XCircle className="size-3.5" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="flex flex-col overflow-hidden shadow-none">
          <CardContent className="h-[420px] p-0">
            <ActivityFeed className="h-full" />
          </CardContent>
        </Card>
      </div>

      {/* recent dispatched */}
      <Card className="shadow-none">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-semibold">Recent fulfillment</CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => navigate("/orders")}>
            All orders <ArrowRight className="size-3" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Order</th>
                  <th className="px-4 py-2 font-medium">Customer</th>
                  <th className="px-4 py-2 font-medium">Value</th>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 font-medium">Dispatched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {state.orders
                  .filter((o) => o.stage === "Dispatched" && o.dispatchedAt)
                  .sort((a, b) => new Date(b.dispatchedAt!).getTime() - new Date(a.dispatchedAt!).getTime())
                  .slice(0, 6)
                  .map((o) => (
                    <tr key={o.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <button className="font-mono text-foreground hover:text-copper" onClick={() => navigate(`/orders?order=${o.id}`)}>{o.id}</button>
                      </td>
                      <td className="px-4 py-2.5">{o.customer}</td>
                      <td className="px-4 py-2.5 font-mono">{fmtMoney(o.value)}</td>
                      <td className="px-4 py-2.5"><StatusPill label={o.stage} dot={false} className="scale-90" /></td>
                      <td className="px-4 py-2.5 text-muted-foreground">{o.dispatchedAt ? fmtDateTime(o.dispatchedAt) : "-"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  suffix = "%",
  spark,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  delta?: number;
  suffix?: string;
  spark?: number[];
  sub?: string;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex h-full flex-col justify-between gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          {tone === "danger" && <span className="size-1.5 rounded-full bg-danger" aria-hidden />}
          {tone === "warn" && <span className="size-1.5 rounded-full bg-warn" aria-hidden />}
          {tone === "ok" && <span className="size-1.5 rounded-full bg-ok" aria-hidden />}
        </div>
        <div>
          <p className="font-display text-[26px] font-medium leading-none tracking-tight">{value}</p>
          <div className="mt-2 flex items-center gap-2">
            {delta !== undefined && (
              <span className={cn("font-mono text-[11px]", delta >= 0 ? "text-ok" : "text-danger")}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}{suffix}
              </span>
            )}
            {spark && spark.some((v) => v > 0) && (
              <svg viewBox="0 0 60 20" className="h-5 w-14" aria-hidden>
                <polyline
                  points={spark.map((v, i) => `${(i / Math.max(1, spark.length - 1)) * 58},${18 - (v / Math.max(1, ...spark)) * 15}`).join(" ")}
                  fill="none"
                  stroke="var(--copper)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
        </div>
        {sub && <p className="text-[10.5px] leading-4 text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
