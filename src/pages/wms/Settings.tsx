import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/wms/ui";
import { useWarehouse } from "@/store/warehouse";
import { Bell, Brush, FlaskConical, Moon, Palette, RotateCcw, Sun, Volume2, Warehouse as WarehouseIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-[13px] font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5.5 w-10 shrink-0 rounded-full border transition-colors",
          checked ? "border-copper/50 bg-copper/25" : "border-border bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full transition-all",
            checked ? "left-[calc(100%-1rem)] bg-copper" : "left-0.5 bg-muted-foreground/60",
          )}
        />
      </button>
    </label>
  );
}

export default function Settings() {
  const wh = useWarehouse();
  const { state, updateSettings, resetData } = wh;
  const navigate = useNavigate();
  const s = state.settings;

  const notifKeys = [
    { key: "criticalStock", label: "Critical stock", hint: "SKU drops into critical range" },
    { key: "orderDelay", label: "Order delay", hint: "An order crosses its promise window" },
    { key: "allocationConflict", label: "Allocation conflict", hint: "Demand exceeds stock" },
    { key: "exception", label: "Exceptions", hint: "New exceptions in the war room" },
    { key: "bottleneck", label: "Bottlenecks", hint: "A stage starts congesting" },
    { key: "reorder", label: "Reorder recommendations", hint: "Stock hits the reorder point" },
  ] as const;

  const startDemo = () => {
    updateSettings({ demoMode: true });
    navigate("/dashboard");
    toast.success("Guided demo armed — it will play on the Command Center");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Settings"
        title="Workspace settings"
        description="Preferences persist to this browser via localStorage. The theme, motion, and notification settings apply immediately."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
            <Palette className="size-4 text-copper" />
            <CardTitle className="text-sm font-medium">Appearance</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-2">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Theme</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "studio" as const, label: "Studio", desc: "Warm off-white, editorial", icon: <Sun className="size-4" /> },
                  { id: "ink" as const, label: "Ink", desc: "Deep charcoal, high contrast", icon: <Moon className="size-4" /> },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => updateSettings({ theme: t.id })}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors",
                      s.theme === t.id ? "border-copper/50 bg-copper/5" : "border-border/70 hover:bg-muted/50",
                    )}
                  >
                    {t.icon}
                    <span>
                      <span className="block text-[13px] font-medium">{t.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{t.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Animation intensity</p>
              <Select value={s.animation} onValueChange={(v) => updateSettings({ animation: v as typeof s.animation })}>
                <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="reduced">Reduced</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Warehouse</p>
              <Select value={s.warehouse} onValueChange={(v) => updateSettings({ warehouse: v })}>
                <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MAIN WAREHOUSE">Main Warehouse</SelectItem>
                  <SelectItem value="NORTH DOCK">North Dock</SelectItem>
                  <SelectItem value="SOUTH DEPOT">South Depot</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
            <Bell className="size-4 text-copper" />
            <CardTitle className="text-sm font-medium">Notifications</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/60 pt-2">
            {notifKeys.map((n) => (
              <Toggle
                key={n.key}
                label={n.label}
                hint={n.hint}
                checked={s.notifications[n.key]}
                onChange={(v) => updateSettings({ notifications: { ...s.notifications, [n.key]: v } })}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
            <Brush className="size-4 text-copper" />
            <CardTitle className="text-sm font-medium">Behavior</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/60 pt-2">
            <Toggle
              label="Auto-refresh"
              hint="Re-sync the simulated live feed on an interval"
              checked={s.autoRefresh}
              onChange={(v) => updateSettings({ autoRefresh: v })}
            />
            <Toggle
              label="Sound effects"
              hint="Audible cues for critical events"
              checked={s.sound}
              onChange={(v) => updateSettings({ sound: v })}
            />
            <Toggle
              label="Demo mode"
              hint="Show the guided demo panel on the Command Center"
              checked={s.demoMode}
              onChange={(v) => updateSettings({ demoMode: v })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
            <FlaskConical className="size-4 text-copper" />
            <CardTitle className="text-sm font-medium">Guided demo & data</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-2">
            <p className="text-[12px] leading-5 text-muted-foreground">
              Run the 12-step demo: normal operations → stock shortage → conflict detected → priority & allocation engines → approval →
              inventory update → partial allocation → reorder → packing bottleneck → corrective action → exception resolved.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button className="gap-1.5" onClick={startDemo}>
                <FlaskConical className="size-4" /> Run demo
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  resetData();
                  toast.success("All warehouse data reset to baseline");
                }}
              >
                <RotateCcw className="size-4" /> Reset data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-4 py-3 text-[11px] text-muted-foreground">
        <WarehouseIcon className="size-3.5 shrink-0" />
        NEXUS WMS v1.0 — settings persist in this browser via localStorage. The warehouse selector in the top bar also controls which site the command center reports on.
      </div>
    </div>
  );
}
