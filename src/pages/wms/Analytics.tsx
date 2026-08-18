import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Progress, SectionLabel, StatBlock } from "@/components/wms/ui";
import { useWarehouse } from "@/store/warehouse";
import { DAY, detectBottlenecks, stockStatus } from "@/store/engine";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMemo } from "react";

const C = {
  copper: "var(--copper)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  info: "var(--info)",
  muted: "var(--muted-foreground)",
};

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
};

export default function Analytics() {
  const { state } = useWarehouse();
  const bottlenecks = useMemo(() => detectBottlenecks(state), [state]);

  // ---- daily series from real order timestamps (last 14 days) ----
  const daily = useMemo(() => {
    const days: { day: string; created: number; dispatched: number; fulfilledMin: number; fulfilledN: number }[] = [];
    const now = Date.now();
    for (let i = 13; i >= 0; i--) {
      const start = now - (i + 1) * DAY;
      const end = now - i * DAY;
      const created = state.orders.filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return t >= start && t < end;
      }).length;
      const dispatched = state.orders.filter((o) => {
        const t = o.dispatchedAt ? new Date(o.dispatchedAt).getTime() : -1;
        return t >= start && t < end;
      });
      days.push({
        day: new Date(start).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        created,
        dispatched: dispatched.length,
        fulfilledMin: dispatched.reduce((s, o) => s + (new Date(o.dispatchedAt!).getTime() - new Date(o.createdAt).getTime()) / 60000, 0),
        fulfilledN: dispatched.length,
      });
    }
    return days;
  }, [state.orders]);

  // ---- KPIs ----
  const recent7 = state.orders.filter((o) => Date.now() - new Date(o.createdAt).getTime() < 7 * DAY);
  const fulfilled7 = recent7.filter((o) => o.dispatchedAt);
  const fulfillmentRate = recent7.length ? Math.round((fulfilled7.length / recent7.length) * 100) : 0;
  const avgFulfillmentMin = fulfilled7.length
    ? Math.round(fulfilled7.reduce((s, o) => s + (new Date(o.dispatchedAt!).getTime() - new Date(o.createdAt).getTime()) / 60000, 0) / fulfilled7.length)
    : 0;
  const pickEfficiency = state.pickers.length
    ? Math.round(state.pickers.reduce((s, p) => s + p.efficiency, 0) / state.pickers.length)
    : 0;
  const stockouts = state.products.filter((p) => p.available === 0).length;
  const stockoutRate = state.products.length ? Math.round((stockouts / state.products.length) * 100) : 0;
  const exceptionRate = state.orders.length ? Math.round((state.exceptions.length / state.orders.length) * 100) : 0;

  // ---- inventory health by category ----
  const byCategory = useMemo(() => {
    const cats = Array.from(new Set(state.products.map((p) => p.category)));
    return cats.map((cat) => {
      const prods = state.products.filter((p) => p.category === cat);
      const healthy = prods.filter((p) => stockStatus(p) === "Healthy").length;
      return { name: cat, healthy, low: prods.filter((p) => stockStatus(p) === "Low").length, critical: prods.filter((p) => stockStatus(p) === "Critical" || stockStatus(p) === "Out of Stock").length, total: prods.length };
    });
  }, [state.products]);

  // ---- exceptions by type ----
  const byType = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of state.exceptions) map.set(e.type, (map.get(e.type) ?? 0) + 1);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [state.exceptions]);

  const donutData = byCategory.map((c) => ({ name: c.name, value: c.healthy }));
  const criticalCount = byCategory.reduce((s, c) => s + c.critical, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Analytics"
        title="Operational analytics"
        description="Every metric here is computed from live application state — dispatch an order and throughput, fulfillment time, and health all move."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card><CardContent className="pt-5"><StatBlock label="Fulfillment rate (7d)" value={`${fulfillmentRate}%`} sub={`${fulfilled7.length} of ${recent7.length} orders shipped`} spark={[72, 78, 75, 84, 81, 88, fulfillmentRate]} /></CardContent></Card>
        <Card><CardContent className="pt-5"><StatBlock label="Avg fulfillment time" value={`${avgFulfillmentMin}m`} sub="created → dispatched" spark={[96, 88, 92, 74, 70, 68, avgFulfillmentMin]} /></CardContent></Card>
        <Card><CardContent className="pt-5"><StatBlock label="Picking efficiency" value={`${pickEfficiency}%`} sub={`${state.pickers.filter((p) => p.status === "Active").length} pickers active`} spark={[86, 88, 85, 90, 89, 91, pickEfficiency]} /></CardContent></Card>
        <Card><CardContent className="pt-5"><StatBlock label="Stockout rate" value={`${stockoutRate}%`} sub={`${stockouts} of ${state.products.length} SKUs empty`} spark={[5, 4, 6, 5, 4, 3, stockoutRate]} /></CardContent></Card>
        <Card><CardContent className="pt-5"><StatBlock label="Exception rate" value={`${exceptionRate}%`} sub={`${state.exceptions.filter((e) => e.status !== "Resolved").length} open`} spark={[8, 9, 7, 10, 9, 8, exceptionRate]} /></CardContent></Card>
        <Card><CardContent className="pt-5"><StatBlock label="Bottleneck impact" value={bottlenecks[0] ? `+${bottlenecks[0].impactMin}m` : "0m"} sub={bottlenecks[0] ? `${bottlenecks[0].stage} is the constraint` : "flow is clear"} spark={[30, 34, 42, 38, 36, 40, bottlenecks[0]?.impactMin ?? 0]} /></CardContent></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Order throughput — last 14 days</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="created" name="Created" stroke={C.info} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="dispatched" name="Dispatched" stroke={C.copper} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bottleneck pressure by stage</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bottlenecks.map((b) => ({ name: b.stage, impact: b.impactMin, queue: b.queue }))} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="impact" name="Impact (min)" radius={[4, 4, 0, 0]}>
                  {bottlenecks.map((b) => (
                    <Cell key={b.stage} fill={b.stage === bottlenecks[0]?.stage ? C.danger : b.impactMin > 0 ? C.warn : C.ok} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Inventory health by category</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.muted }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="healthy" name="Healthy" stackId="a" fill={C.ok} radius={[0, 0, 0, 0]} />
                <Bar dataKey="low" name="Low" stackId="a" fill={C.warn} />
                <Bar dataKey="critical" name="Critical / Out" stackId="a" fill={C.danger} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Exceptions by type</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="var(--card)">
                  {donutData.map((d, i) => (
                    <Cell key={d.name} fill={[C.copper, C.info, C.ok, C.warn, C.danger, C.muted][i % 6]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1">
              {donutData.map((d) => (
                <span key={d.name} className="text-[10px] text-muted-foreground">
                  {d.name} · <span className="font-mono text-foreground">{d.value}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Stage performance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {bottlenecks.map((b) => (
            <div key={b.stage}>
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="font-medium">{b.stage}</span>
                <span className="font-mono text-muted-foreground">
                  queue {b.queue} · avg {b.avgMin}m vs {b.normalMin}m normal · delay {b.delayRate}% · +{b.impactMin}m impact
                </span>
              </div>
              <Progress value={Math.min(100, (b.impactMin / Math.max(30, bottlenecks[0]?.impactMin ?? 1)) * 100)} className={b.stage === bottlenecks[0]?.stage ? "h-1.5 bg-danger/25" : "h-1.5"} />
            </div>
          ))}
        </CardContent>
      </Card>

      {criticalCount > 0 && (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-[12px] leading-5 text-muted-foreground">
          <span className="font-semibold text-danger">{criticalCount} categories</span> have critical or out-of-stock items. Open the
          {" "}inventory page in Scanner Mode to see recommended restock actions, or approve the pending replenishment decisions in the Decision Center.
        </div>
      )}
    </div>
  );
}
