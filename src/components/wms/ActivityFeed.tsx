import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWarehouse } from "@/store/warehouse";
import { fmtTime } from "@/store/engine";
import { AlertTriangle, Boxes, Package, Pause, Play, ScanLine, Trash2, Truck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const kindIcon = {
  order: <Package className="size-3.5" />,
  picker: <ScanLine className="size-3.5" />,
  stock: <Boxes className="size-3.5" />,
  exception: <AlertTriangle className="size-3.5" />,
  dispatch: <Truck className="size-3.5" />,
  system: <Zap className="size-3.5" />,
  decision: <Zap className="size-3.5" />,
};

const levelColor: Record<string, string> = {
  info: "bg-info/10 text-info",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  success: "bg-ok/12 text-ok",
};

export function ActivityFeed({ className }: { className?: string }) {
  const { state, togglePaused, clearEvents } = useWarehouse();

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("size-1.5 rounded-full", state.paused ? "bg-muted-foreground" : "live-dot bg-ok")} aria-hidden />
          <p className="text-sm font-semibold">
            Live activity {state.paused && <span className="text-xs font-normal text-muted-foreground">(paused)</span>}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={togglePaused}
            aria-label={state.paused ? "Resume live feed" : "Pause live feed"}
          >
            {state.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {state.paused ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={clearEvents}
            aria-label="Clear activity feed"
          >
            <Trash2 className="size-3.5" />
            Clear
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {state.events.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No activity yet — actions will appear here.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {state.events.slice(0, 30).map((ev) => (
              <li key={ev.id} className="flex items-start gap-3 px-4 py-2.5">
                <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", levelColor[ev.level])}>
                  {kindIcon[ev.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] leading-5 text-foreground">{ev.text}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {fmtTime(ev.at)} · {ev.kind}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
