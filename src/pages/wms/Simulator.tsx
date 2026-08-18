import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mono, PageHeader, SectionLabel } from "@/components/wms/ui";
import { useWarehouse } from "@/store/warehouse";
import { fmtDateTime } from "@/store/engine";
import type { Scenario } from "@/store/types";
import { ArrowRight, CheckCircle2, FlaskConical, History, Play, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Preset = "stock" | "urgent" | "picker" | "packing" | "incoming" | "spike";

const PRESETS: { id: Preset; label: string; description: string }[] = [
  { id: "stock", label: "Reduce SKU stock", description: "Simulate a stock-out by cutting an SKU's available units." },
  { id: "urgent", label: "Urgent order wave", description: "Inject premium orders with tight deadlines." },
  { id: "picker", label: "Disable a picker", description: "Take a picker offline and watch capacity drop." },
  { id: "packing", label: "Increase packing time", description: "Slow down every packing station." },
  { id: "incoming", label: "Delay incoming stock", description: "Cancel inbound shipments for selected SKUs." },
  { id: "spike", label: "Demand spike", description: "Add a sudden wave of standard orders." },
];

export default function Simulator() {
  const wh = useWarehouse();
  const { state } = wh;
  const [preset, setPreset] = useState<Preset>("stock");
  const [sku, setSku] = useState("");
  const [skuTarget, setSkuTarget] = useState(0);
  const [picker, setPicker] = useState("");
  const [packingFactor, setPackingFactor] = useState(1.5);
  const [delaySkus, setDelaySkus] = useState<string[]>([]);
  const [waveCount, setWaveCount] = useState(5);
  const [report, setReport] = useState<ReturnType<typeof wh.runScenario> | null>(null);

  const products = useMemo(() => state.products.filter((p) => p.available > 0), [state.products]);
  const incomingSkus = useMemo(() => state.products.filter((p) => p.incoming > 0), [state.products]);
  const activePickers = useMemo(() => state.pickers.filter((p) => p.status !== "Offline"), [state.pickers]);

  const buildScenario = (): Scenario => {
    const base: Scenario = {};
    switch (preset) {
      case "stock":
        base.sku = sku || products[0]?.sku;
        base.skuTarget = skuTarget;
        base.label = `Reduce ${base.sku} stock to ${skuTarget}`;
        break;
      case "urgent":
        base.urgentOrders = waveCount;
        base.label = `Add ${waveCount} urgent premium orders`;
        break;
      case "picker":
        base.disabledPicker = picker || activePickers[0]?.id;
        base.label = `Disable picker ${base.disabledPicker}`;
        break;
      case "packing":
        base.packingDelayFactor = packingFactor;
        base.label = `Packing time ×${packingFactor}`;
        break;
      case "incoming":
        base.delayedIncomingSkus = delaySkus;
        base.label = `Delay incoming for ${delaySkus.length ? delaySkus.join(", ") : "selected SKUs"}`;
        break;
      case "spike":
        base.demandSpikeOrders = waveCount;
        base.label = `Demand spike of ${waveCount} orders`;
        break;
    }
    return base;
  };

  const run = () => {
    const sc = buildScenario();
    if (!sc.sku && !sc.urgentOrders && !sc.disabledPicker && !sc.packingDelayFactor && !sc.delayedIncomingSkus?.length && !sc.demandSpikeOrders) {
      toast.error("Complete the scenario parameters first");
      return;
    }
    setReport(wh.runScenario(sc));
  };

  const apply = () => {
    if (!report) return;
    const sc = report.scenario;
    wh.applyScenario(sc);
    toast.success("Scenario applied to the live warehouse");
    setReport(null);
  };

  const reset = () => {
    setReport(null);
    wh.resetData();
    toast.success("Warehouse data reset to baseline");
  };

  const toggleDelaySku = (s: string) => {
    setDelaySkus((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Warehouse simulator"
        title="What-if simulator"
        description="Model operational shocks before they hit. The engine re-runs priority, allocation, bottlenecks, and risk on the hypothetical state, then shows before, after, impact, and a recommended action."
        actions={
          <Button variant="outline" className="gap-1.5" onClick={reset}>
            <RotateCcw className="size-4" /> Reset baseline
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-5">
        {/* scenario builder */}
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">1 · Choose a scenario</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                    preset === p.id ? "border-copper/50 bg-copper/5" : "border-border/70 hover:bg-muted/50",
                  )}
                >
                  <span className={cn("mt-1 size-2 shrink-0 rounded-full", preset === p.id ? "bg-copper" : "bg-border")} />
                  <span>
                    <span className="block text-[13px] font-medium">{p.label}</span>
                    <span className="block text-[11px] leading-4 text-muted-foreground">{p.description}</span>
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">2 · Parameters</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {preset === "stock" && (
                <>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">SKU</p>
                    <Select value={sku || undefined} onValueChange={setSku}>
                      <SelectTrigger><SelectValue placeholder="Select SKU" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => <SelectItem key={p.sku} value={p.sku}>{p.sku} · {p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Reduce available stock to</p>
                    <input
                      type="number"
                      min={0}
                      value={skuTarget}
                      onChange={(e) => setSkuTarget(Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 font-mono text-sm"
                    />
                  </div>
                </>
              )}
              {preset === "picker" && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Picker to disable</p>
                  <Select value={picker || undefined} onValueChange={setPicker}>
                    <SelectTrigger><SelectValue placeholder="Select picker" /></SelectTrigger>
                    <SelectContent>
                      {activePickers.map((p) => <SelectItem key={p.id} value={p.id}>{p.id} · {p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {preset === "packing" && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Packing time multiplier</p>
                  <input
                    type="number"
                    step={0.1}
                    min={1}
                    max={3}
                    value={packingFactor}
                    onChange={(e) => setPackingFactor(Number(e.target.value))}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 font-mono text-sm"
                  />
                </div>
              )}
              {preset === "incoming" && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">SKUs with delayed inbound</p>
                  <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border/70 p-2">
                    {incomingSkus.length === 0 && <p className="p-2 text-[11px] text-muted-foreground">No inbound stock in flight.</p>}
                    {incomingSkus.map((p) => (
                      <label key={p.sku} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12px] hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={delaySkus.includes(p.sku)}
                          onChange={() => toggleDelaySku(p.sku)}
                          className="size-3.5 accent-[var(--copper)]"
                        />
                        <Mono>{p.sku}</Mono>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">+{p.incoming}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {(preset === "urgent" || preset === "spike") && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Order wave size</p>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={waveCount}
                    onChange={(e) => setWaveCount(Number(e.target.value))}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 font-mono text-sm"
                  />
                </div>
              )}
              <Button className="mt-1 gap-1.5" onClick={run}>
                <Play className="size-4" /> Run simulation
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* report */}
        <div className="flex flex-col gap-4 xl:col-span-3">
          {!report ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                <FlaskConical className="size-8 text-muted-foreground/60" />
                <p className="text-sm font-medium">No simulation run yet</p>
                <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                  Build a scenario on the left and run it. The engine computes a full before/after impact report without touching live operations.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <SectionLabel>Simulation report</SectionLabel>
                <span className="ml-auto rounded-full bg-copper/10 px-2.5 py-1 font-mono text-[11px] text-copper">{report.scenario.label}</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Before</p>
                    <div className="mt-2 flex flex-col gap-1 font-mono text-[12px]">
                      <p>Fulfillment <span className="float-right text-foreground">{report.before.fulfillmentRate}%</span></p>
                      <p>At risk <span className="float-right text-foreground">{report.before.ordersAtRisk}</span></p>
                      <p>Health <span className="float-right text-foreground">{report.before.inventoryHealth}%</span></p>
                      <p>Pickers <span className="float-right text-foreground">{report.before.pickingCapacity}</span></p>
                      {report.before.bottleneck && (
                        <p>Bottleneck <span className="float-right text-danger">{report.before.bottleneck.stage} +{report.before.bottleneck.impactMin}m</span></p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">After</p>
                    <div className="mt-2 flex flex-col gap-1 font-mono text-[12px]">
                      <p>Fulfillment <span className="float-right text-foreground">{report.after.fulfillmentRate}%</span></p>
                      <p>At risk <span className="float-right text-foreground">{report.after.ordersAtRisk}</span></p>
                      <p>Health <span className="float-right text-foreground">{report.after.inventoryHealth}%</span></p>
                      <p>Pickers <span className="float-right text-foreground">{report.after.pickingCapacity}</span></p>
                      {report.after.bottleneck && (
                        <p>Bottleneck <span className="float-right text-danger">{report.after.bottleneck.stage} +{report.after.bottleneck.impactMin}m</span></p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-danger/30">
                  <CardContent className="pt-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-danger">Impact</p>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {report.impact.map((i) => (
                        <p key={i.label} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate text-muted-foreground">{i.label}</span>
                          <span className={cn("font-mono", i.kind === "good" ? "text-ok" : i.kind === "bad" ? "text-danger" : "text-muted-foreground")}>
                            {i.before} <ArrowRight className="inline size-3" /> {i.after}
                          </span>
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-copper/30 bg-copper/5">
                <CardContent className="flex flex-col gap-2 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-copper">Recommended action</p>
                  <p className="text-[13px] leading-6 text-foreground">{report.recommendation}</p>
                  <div className="mt-1 flex gap-2">
                    <Button size="sm" className="h-8 gap-1.5" onClick={apply}>
                      <CheckCircle2 className="size-3.5" /> Apply to warehouse
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setReport(null)}>Discard</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {state.reports.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionLabel className="flex items-center gap-1.5"><History className="size-3" /> Simulation history</SectionLabel>
              <Card>
                <CardContent className="flex flex-col gap-1 py-3">
                  {state.reports.slice(0, 8).map((r) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-[12px] hover:bg-muted/50">
                      <CheckCircle2 className="size-3.5 text-ok" />
                      <span className="min-w-0 flex-1 truncate">{r.scenario.label}</span>
                      <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">{fmtDateTime(r.at)}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">applied</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
