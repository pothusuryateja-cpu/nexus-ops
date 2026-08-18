import { useWarehouse } from "@/store/warehouse";
import { stockStatus } from "@/store/engine";
import { useMemo, useState } from "react";

const LAYOUT: Record<string, { x: number; y: number; w: number; h: number }> = {
  A: { x: 24, y: 24, w: 204, h: 196 },
  B: { x: 258, y: 24, w: 204, h: 196 },
  C: { x: 492, y: 24, w: 204, h: 196 },
  D: { x: 726, y: 24, w: 204, h: 196 },
  E: { x: 24, y: 288, w: 204, h: 196 },
  F: { x: 258, y: 288, w: 204, h: 196 },
  G: { x: 492, y: 288, w: 204, h: 196 },
  H: { x: 726, y: 288, w: 204, h: 196 },
};

export interface ZoneStats {
  orders: number;
  exceptions: number;
  lowStock: number;
  pickers: number;
  utilization: number; // 0-100
  missions: number;
}

export function computeZoneStats(
  state: ReturnType<typeof useWarehouse>["state"],
  zoneId: string,
): ZoneStats {
  const zone = state.zones.find((z) => z.id === zoneId);
  const active = state.orders.filter((o) => o.zone === zoneId && o.stage !== "Dispatched" && o.stage !== "Cancelled");
  const exceptions = state.exceptions.filter((e) => e.zone === zoneId && e.status !== "Resolved");
  const lowStock = state.products.filter((p) => p.zone === zoneId && stockStatus(p) !== "Healthy");
  const pickers = state.pickers.filter((p) => p.zone === zoneId && p.status !== "Offline");
  const missions = state.missions.filter((m) => m.status !== "Completed" && m.zones.includes(zoneId));
  const load = active.length * 7 + missions.length * 4 + pickers.length * 11;
  const capacity = zone?.capacity ?? 30;
  return {
    orders: active.length,
    exceptions: exceptions.length,
    lowStock: lowStock.length,
    pickers: pickers.length,
    missions: missions.length,
    utilization: Math.min(100, Math.round((load / capacity) * 100)),
  };
}

export function useZoneStats(zoneId: string): ZoneStats {
  const { state } = useWarehouse();
  return computeZoneStats(state, zoneId);
}

export function WarehouseMap({
  selected,
  onSelect,
}: {
  selected?: string | null;
  onSelect?: (zone: string) => void;
}) {
  const { state } = useWarehouse();
  const [hover, setHover] = useState<string | null>(null);
  const zoneStats = useMemo(
    () => Object.fromEntries(state.zones.map((z) => [z.id, computeZoneStats(state, z.id)])),
    [state],
  );

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox="0 0 954 512" className="min-w-[620px] w-full" role="img" aria-label="Warehouse floor plan with eight zones">
        {/* backdrop */}
        <rect x="4" y="4" width="946" height="504" rx="10" fill="var(--card)" stroke="var(--border)" strokeWidth="1" />
        <rect x="14" y="14" width="926" height="484" rx="6" fill="none" stroke="var(--border)" strokeWidth="0.8" strokeDasharray="4 5" />

        {/* aisles labels */}
        <text x="477" y="270" textAnchor="middle" fill="var(--muted-foreground)" fontSize="10" letterSpacing="3" fontFamily="var(--font-mono)">MAIN AISLE</text>
        <text x="482" y="470" textAnchor="end" fill="var(--muted-foreground)" fontSize="8" letterSpacing="2" fontFamily="var(--font-mono)">DOCK DOORS →</text>

        {state.zones.map((zone) => {
          const box = LAYOUT[zone.id];
          const stats = zoneStats[zone.id];
          const isSel = selected === zone.id;
          const isHover = hover === zone.id;
          const utilColor =
            stats.utilization > 85 ? "rgba(176,74,58,0.16)" : stats.utilization > 60 ? "rgba(178,122,40,0.15)" : "rgba(125,139,111,0.14)";
          return (
            <g
              key={zone.id}
              transform={`translate(${box.x},${box.y})`}
              className="cursor-pointer"
              onClick={() => onSelect?.(zone.id)}
              onMouseEnter={() => setHover(zone.id)}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                width={box.w}
                height={box.h}
                rx="8"
                fill={utilColor}
                stroke={isSel ? "var(--copper)" : isHover ? "var(--foreground)" : "var(--border)"}
                strokeWidth={isSel ? 1.8 : 1}
                className="transition-all duration-200"
              />
              {/* picker paths */}
              <path d={`M 14 ${box.h - 16} h ${box.w - 28}`} stroke="var(--border)" strokeWidth="0.8" strokeDasharray="3 4" />
              <path d={`M 14 ${box.h - 44} h ${box.w - 28}`} stroke="var(--border)" strokeWidth="0.8" strokeDasharray="3 4" />

              <text x="14" y="22" fill="var(--foreground)" fontSize="13" fontWeight="600" fontFamily="var(--font-display)">
                Zone {zone.id}
              </text>
              <text x="14" y="38" fill="var(--muted-foreground)" fontSize="10" letterSpacing="0.4">
                {zone.name}
              </text>

              {/* utilization */}
              <text x={box.w - 14} y="22" textAnchor="end" fill="var(--muted-foreground)" fontSize="10" fontFamily="var(--font-mono)">
                {stats.utilization}%
              </text>

              {/* stat row */}
              <g fontSize="9.5" fontFamily="var(--font-mono)">
                <circle cx="14" cy={box.h - 82} r="2.5" fill="var(--info)" />
                <text x="22" y={box.h - 78} fill="var(--muted-foreground)">{stats.orders} orders</text>
                <circle cx="14" cy={box.h - 64} r="2.5" fill="var(--copper)" />
                <text x="22" y={box.h - 60} fill="var(--muted-foreground)">{stats.pickers} pickers</text>
                {stats.lowStock > 0 && (
                  <>
                    <circle cx="14" cy={box.h - 46} r="2.5" fill="var(--warn)" />
                    <text x="22" y={box.h - 42} fill="var(--warn)">{stats.lowStock} low-stock SKUs</text>
                  </>
                )}
              </g>

              {/* badges */}
              {stats.exceptions > 0 && (
                <g transform={`translate(${box.w - 18}, 10)`}>
                  <circle r="9" fill="var(--danger)" opacity="0.14" />
                  <circle r="4" fill="var(--danger)">
                    <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
                  </circle>
                </g>
              )}
              {isSel && (
                <rect x={box.w - 92} y={box.h - 26} width="78" height="16" rx="8" fill="var(--copper)" opacity="0.12" />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
