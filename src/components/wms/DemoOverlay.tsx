import { Button } from "@/components/ui/button";
import { useWarehouse } from "@/store/warehouse";
import { cn } from "@/lib/utils";
import { CheckCircle2, Play, RotateCcw, X, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const DEMO_STEPS = [
  { title: "Normal operations", desc: "Baseline monitoring — live counts of orders, SKUs and zone health." },
  { title: "Stock shortage occurs", desc: "SKU-204 drops below its reorder point — a shortage is detected." },
  { title: "System detects conflict", desc: "NEXUS cross-references live demand and flags an allocation conflict." },
  { title: "Priority engine runs", desc: "Every live order is re-scored from deadline, tier, age and risk." },
  { title: "Allocation engine recommends", desc: "The engine chooses a strategy and explains its reasoning in plain terms." },
  { title: "Operator approves", desc: "Approval commits the recommendation to real inventory and orders." },
  { title: "Inventory updates", desc: "Available vs reserved stock changes on every screen at once." },
  { title: "Order partially allocated", desc: "NXS-1042 becomes partially allocated; a picking mission is queued." },
  { title: "Reorder recommendation appears", desc: "A replenishment decision is created automatically for SKU-204." },
  { title: "Packing bottleneck appears", desc: "The packing queue grows and NEXUS flags the bottleneck." },
  { title: "System recommends action", desc: "Corrective action is proposed: move staff to packing." },
  { title: "Exception resolved", desc: "EX-004 is resolved — the detect → decide → resolve loop closes." },
];

export function DemoOverlay() {
  const { state, demoStep, updateSettings, resetData } = useWarehouse();
  const [step, setStep] = useState(0);
  const stepDesc = step === 0
    ? `${state.orders.length} orders · ${state.products.length} SKUs · 8 zones reporting nominal.`
    : DEMO_STEPS[step].desc;

  const run = () => {
    if (step >= DEMO_STEPS.length) return;
    const res = demoStep(step + 1);
    if (res.ok) {
      setStep((s) => s + 1);
    } else {
      toast.error(res.message || "Step failed");
    }
  };

  const restart = () => {
    resetData();
    setStep(0);
    toast.success("Demo data reset — starting from normal operations.");
  };

  const exit = () => {
    updateSettings({ demoMode: false });
    setStep(0);
  };

  const done = step >= DEMO_STEPS.length;

  return (
    <div className="rounded-xl border border-copper/30 bg-gradient-to-br from-card to-accent/30 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-copper/15 text-copper">
            <Zap className="size-4" />
          </span>
          <div>
            <p className="font-display text-base font-semibold tracking-tight">NEXUS Guided Demo</p>
            <p className="text-xs text-muted-foreground">
              {done ? "Scenario complete — the full loop is closed." : `Step ${Math.min(step + 1, DEMO_STEPS.length)} of ${DEMO_STEPS.length}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={restart}>
            <RotateCcw className="size-3.5" /> Restart
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={exit}>
            <X className="size-3.5" /> Exit demo
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1.5">
        {DEMO_STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              i < step ? "bg-ok" : i === step ? "bg-copper" : "bg-muted",
            )}
          />
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border/70 bg-background/60 p-4">
        {done ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-6 shrink-0 text-ok" />
            <div>
              <p className="text-sm font-semibold">Demo complete</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Every system reacted to the scenario: priorities recalculated, stock reallocated, a reorder triggered, a
                bottleneck detected, and the exception resolved. Explore the Decision Center and Simulator to see the
                same intelligence live.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className="font-mono text-xs text-copper">{String(step + 1).padStart(2, "0")}</span>
                {DEMO_STEPS[step].title}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{stepDesc}</p>
            </div>
            <Button className="h-9 shrink-0 gap-2" onClick={run} size="sm">
              <Play className="size-3.5" />
              Run step {step + 1}
            </Button>
          </div>
        )}
      </div>

    </div>
  );
}
