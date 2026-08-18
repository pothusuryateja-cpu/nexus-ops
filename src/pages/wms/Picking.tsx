import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mono, PageHeader, Progress, SectionLabel, StatusPill } from "@/components/wms/ui";
import { useWarehouse } from "@/store/warehouse";
import { fmtTime } from "@/store/engine";
import type { Mission, Picker } from "@/store/types";
import { ChevronDown, ChevronRight, Play, Pause, CheckCheck, RotateCcw, UserRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Picking() {
  const wh = useWarehouse();
  const { state } = wh;
  const navigate = useNavigate();
  const [openMission, setOpenMission] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<Record<string, string>>({});

  const active = state.missions.filter((m) => m.status === "Active" || m.status === "Delayed");
  const ready = state.missions.filter((m) => m.status === "Ready");
  const paused = state.missions.filter((m) => m.status === "Paused");
  const completed = state.missions.filter((m) => m.status === "Completed");

  const run = (res: { ok: boolean; error?: string }, msg: string) => {
    if (res.ok) toast.success(msg);
    else toast.error(res.error ?? "Action failed");
  };

  const idlePickers = state.pickers.filter((p) => p.status === "Idle");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Picking"
        title="Picking operations"
        description="Missions are routed through the warehouse in optimized order. Pickers confirm each line; progress and deadlines update live."
      />

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Active missions", value: active.length },
          { label: "Ready to start", value: ready.length, tone: ready.length > 0 ? "info" : "" },
          { label: "Paused", value: paused.length, tone: paused.length > 0 ? "warn" : "" },
          { label: "Completed", value: completed.length, tone: "ok" },
        ].map((s) => (
          <Card key={s.label} className="shadow-none">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{s.label}</p>
              <p className={cn("mt-1.5 font-display text-2xl font-medium", s.tone === "warn" && "text-warn", s.tone === "ok" && "text-ok", s.tone === "info" && "text-info")}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* pickers */}
      <Card className="shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Pickers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {state.pickers.map((p) => (
              <div key={p.id} className={cn("rounded-lg border p-3.5", p.status === "Active" ? "border-ok/30 bg-ok/5" : p.status === "Paused" ? "border-warn/30 bg-warn/5" : "border-border/70")}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UserRound className="size-4" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold leading-4">{p.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{p.id} · eff {p.efficiency}%</p>
                    </div>
                  </div>
                  <StatusPill label={p.status} />
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Zone {p.zone}</span>
                  {p.activeMissionId ? <Mono>{p.activeMissionId}</Mono> : <span>idle</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* missions */}
      <SectionLabel>Missions · {state.missions.length}</SectionLabel>
      <div className="flex flex-col gap-3">
        {[...active, ...paused, ...ready, ...completed].map((m) => {
          const order = state.orders.find((o) => o.id === m.orderId);
          const picker = state.pickers.find((p) => p.id === m.pickerId);
          const isOpen = openMission === m.id;
          const done = m.items.reduce((s, i) => s + i.picked, 0);
          const total = m.items.reduce((s, i) => s + i.qty, 0);
          return (
            <Card key={m.id} className={cn("shadow-none", m.status === "Delayed" && "border-danger/40")}>
              <CardContent className="p-0">
                <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <div className="min-w-[170px]">
                    <div className="flex items-center gap-2">
                      <Mono className="text-[13px] font-semibold">{m.id}</Mono>
                      <StatusPill label={m.status} />
                    </div>
                    <button
                      className="mt-1 text-[12px] text-muted-foreground hover:text-copper"
                      onClick={() => navigate(`/orders?order=${m.orderId}`)}
                    >
                      Order {m.orderId} · {order?.customer}
                    </button>
                  </div>

                  <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
                    <span><Mono>{picker ? `${picker.id} ${picker.name}` : "—"}</Mono></span>
                    <span>{total} items</span>
                    <span>zones {m.zones.map((z) => `Z${z}`).join(", ") || "—"}</span>
                    <span className={cn("font-mono", m.elapsedMin > m.deadlineMin && m.status !== "Completed" && "text-danger")}>
                      {m.elapsedMin}/{m.deadlineMin} min
                    </span>
                    {m.status !== "Completed" && <span className="text-info">saves {m.route.savedM}m</span>}
                  </div>

                  <div className="flex w-full items-center gap-3 lg:w-[220px]">
                    <Progress value={m.progress} tone={m.progress >= 100 ? "ok" : m.status === "Delayed" ? "danger" : m.status === "Paused" ? "warn" : "copper"} className="flex-1" />
                    <span className="w-10 text-right font-mono text-xs">{m.progress}%</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(m.status === "Ready" || m.status === "Paused") && m.pickerId === "" && (
                      <>
                        <Select
                          value={pickerFor[m.id] ?? ""}
                          onValueChange={(v) => setPickerFor((s) => ({ ...s, [m.id]: v }))}
                        >
                          <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Assign picker">
                            <SelectValue placeholder="Picker…" />
                          </SelectTrigger>
                          <SelectContent>
                            {state.pickers.map((p) => (
                              <SelectItem key={p.id} value={p.id} disabled={p.status !== "Idle"}>
                                {p.id} — {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => {
                            const pid = pickerFor[m.id];
                            if (!pid) return toast.error("Choose a picker first.");
                            run(wh.startMission(m.id, pid), `${m.id} started`);
                          }}
                        >
                          <Play className="size-3" /> Start
                        </Button>
                      </>
                    )}
                    {m.status === "Active" && (
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => run(wh.pauseMission(m.id), `${m.id} paused`)}>
                        <Pause className="size-3" /> Pause
                      </Button>
                    )}
                    {m.status === "Paused" && m.pickerId && (
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => run(wh.resumeMission(m.id), `${m.id} resumed`)}>
                        <Play className="size-3" /> Resume
                      </Button>
                    )}
                    {m.status !== "Completed" && (
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setOpenMission(isOpen ? null : m.id)} aria-expanded={isOpen}>
                        {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                        Items
                      </Button>
                    )}
                  </div>
                </div>

                {isOpen && m.status !== "Completed" && (
                  <div className="border-t border-border/60 px-4 py-3">
                    <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
                      <div>
                        <SectionLabel className="mb-2">Pick lines</SectionLabel>
                        <ul className="space-y-1.5">
                          {m.items.map((it) => {
                            const prod = state.products.find((p) => p.sku === it.sku);
                            return (
                              <li key={it.sku} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-xs">
                                <Mono className="w-16 font-medium">{it.sku}</Mono>
                                <span className="flex-1 truncate text-muted-foreground">{prod?.name}</span>
                                <span className="font-mono text-muted-foreground">bin {it.bin}</span>
                                <span className="font-mono">{it.picked}/{it.qty}</span>
                                {it.picked < it.qty ? (
                                  <Button size="sm" variant="outline" className="h-6 gap-1 text-[11px]" onClick={() => run(wh.completeItem(m.id, it.sku), `Picked 1 × ${it.sku}`)}>
                                    <CheckCheck className="size-3" /> Pick 1
                                  </Button>
                                ) : (
                                  <span className="text-[11px] font-medium text-ok">done</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      <div className="flex flex-col gap-2">
                        <RouteCard mission={m} />
                        {m.pickerId && idlePickers.length > 0 && (
                          <div className="flex items-center gap-2">
                            <Select
                              value=""
                              onValueChange={(v) => run(wh.reassignMission(m.id, v), `${m.id} reassigned to ${v}`)}
                            >
                              <SelectTrigger className="h-8 flex-1 text-xs" aria-label="Reassign picker">
                                <SelectValue placeholder="Reassign to…" />
                              </SelectTrigger>
                              <SelectContent>
                                {idlePickers.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.id} — {p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs text-ok" onClick={() => run(wh.completeMission(m.id), `${m.id} completed — order to packing`)}>
                          <RotateCcw className="size-3.5" /> Complete mission
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {isOpen && m.status === "Completed" && (
                  <div className="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
                    Completed {m.completedAt ? fmtTime(m.completedAt) : ""} — order moved to packing.
                    <div className="mt-2"><RouteCard mission={m} /></div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function RouteCard({ mission }: { mission: Mission }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <SectionLabel className="mb-2">Route optimization</SectionLabel>
      <div className="flex items-end justify-between text-[11px]">
        <div>
          <p className="text-muted-foreground">Normal</p>
          <p className="font-mono text-lg font-medium">{mission.route.normalM}m</p>
        </div>
        <div className="flex flex-col items-center pb-1">
          <span className="rounded-full bg-ok/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-ok">
            −{mission.route.savedM}m · −{mission.route.savedMin}min
          </span>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground">Optimized</p>
          <p className="font-mono text-lg font-medium text-ok">{mission.route.optimizedM}m</p>
        </div>
      </div>
      <RouteSvg mission={mission} />
    </div>
  );
}

function RouteSvg({ mission }: { mission: Mission }) {
  // schematic: start at bottom-left, visit zones in order
  const zonePos: Record<string, [number, number]> = {
    A: [18, 22], B: [78, 22], C: [138, 22], D: [198, 22],
    E: [18, 62], F: [78, 62], G: [138, 62], H: [198, 62],
  };
  const pts = ["H", ...mission.zones, "H"].map((z) => zonePos[z] ?? [110, 40]);
  const line = (dash: boolean) =>
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  return (
    <svg viewBox="0 0 220 84" className="mt-2 w-full" aria-label={`Route for ${mission.id}`}>
      {Object.entries(zonePos).map(([z, [x, y]]) => (
        <g key={z}>
          <circle cx={x} cy={y} r="3.4" fill="var(--muted)" />
          <text x={x} y={y - 6} textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" fill="var(--muted-foreground)">{z}</text>
        </g>
      ))}
      <path d={line(false)} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.6" />
      <path d={line(true)} fill="none" stroke="var(--ok)" strokeWidth="1.6" className="route-path" />
      <circle cx="18" cy="78" r="3.4" fill="var(--copper)" />
      <text x="30" y="81" fontSize="7" fontFamily="var(--font-mono)" fill="var(--copper)">START</text>
    </svg>
  );
}
