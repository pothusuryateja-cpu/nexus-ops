import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ---------------- typography helpers ----------------
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-[0.8em] tracking-tight", className)}>{children}</span>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <SectionLabel className="mb-1.5">{eyebrow}</SectionLabel>}
        <h1 className="font-display text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------- status pills ----------------
const toneMap: Record<string, string> = {
  // stages
  Created: "bg-muted text-foreground",
  Prioritized: "bg-info/10 text-info",
  Allocated: "bg-info/10 text-info",
  Picking: "bg-warn/10 text-warn",
  Packing: "bg-warn/10 text-warn",
  QC: "bg-accent text-accent-foreground",
  Dispatched: "bg-ok/12 text-ok",
  Cancelled: "bg-muted text-muted-foreground line-through",
  Held: "bg-warn/10 text-warn",
  // allocation
  None: "bg-muted text-muted-foreground",
  Partial: "bg-warn/10 text-warn",
  Full: "bg-ok/12 text-ok",
  Released: "bg-info/10 text-info",
  // stock
  Healthy: "bg-ok/12 text-ok",
  Low: "bg-warn/10 text-warn",
  Critical: "bg-danger/10 text-danger",
  "Out of Stock": "bg-danger/10 text-danger",
  // qc
  Pending: "bg-warn/10 text-warn",
  Passed: "bg-ok/12 text-ok",
  Failed: "bg-danger/10 text-danger",
  // exceptions
  Detected: "bg-danger/10 text-danger",
  Analyzing: "bg-warn/10 text-warn",
  "Decision Required": "bg-warn/10 text-warn",
  "In Progress": "bg-info/10 text-info",
  Resolved: "bg-ok/12 text-ok",
  // decisions
  Approved: "bg-ok/12 text-ok",
  Rejected: "bg-danger/10 text-danger",
  Modified: "bg-info/10 text-info",
  // picker/mission
  Active: "bg-ok/12 text-ok",
  Paused: "bg-warn/10 text-warn",
  Offline: "bg-danger/10 text-danger",
  Idle: "bg-muted text-muted-foreground",
  Ready: "bg-info/10 text-info",
  Delayed: "bg-danger/10 text-danger",
  Completed: "bg-ok/12 text-ok",
  // batches
  Planned: "bg-info/10 text-info",
  // severity
  Medium: "bg-warn/10 text-warn",
  High: "bg-danger/10 text-danger",
  // misc
  Premium: "bg-copper/10 text-copper",
  Enterprise: "bg-info/10 text-info",
  Standard: "bg-muted text-muted-foreground",
};

const dotMap: Record<string, string> = {
  Created: "bg-muted-foreground",
  Prioritized: "bg-info",
  Allocated: "bg-info",
  Picking: "bg-warn",
  Packing: "bg-warn",
  QC: "bg-copper",
  Dispatched: "bg-ok",
  Cancelled: "bg-muted-foreground",
  Held: "bg-warn",
  None: "bg-muted-foreground",
  Partial: "bg-warn",
  Full: "bg-ok",
  Released: "bg-info",
  Healthy: "bg-ok",
  Low: "bg-warn",
  Critical: "bg-danger",
  "Out of Stock": "bg-danger",
  Pending: "bg-warn",
  Passed: "bg-ok",
  Failed: "bg-danger",
  Detected: "bg-danger",
  Analyzing: "bg-warn",
  "Decision Required": "bg-warn",
  "In Progress": "bg-info",
  Resolved: "bg-ok",
  Approved: "bg-ok",
  Rejected: "bg-danger",
  Modified: "bg-info",
  Active: "bg-ok",
  Paused: "bg-warn",
  Offline: "bg-danger",
  Idle: "bg-muted-foreground",
  Ready: "bg-info",
  Delayed: "bg-danger",
  Completed: "bg-ok",
  Planned: "bg-info",
  Medium: "bg-warn",
  High: "bg-danger",
  Premium: "bg-copper",
  Enterprise: "bg-info",
  Standard: "bg-muted-foreground",
};

export function StatusPill({
  label,
  className,
  dot = true,
}: {
  label: string;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-transparent px-2 py-0.5 text-[11px] font-medium",
        toneMap[label] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {dot && (
        <span
          className={cn("size-1.5 rounded-full", dotMap[label] ?? "bg-muted-foreground")}
          aria-hidden
        />
      )}
      {label}
    </span>
  );
}

export function SeverityPill({ severity }: { severity: string }) {
  return <StatusPill label={severity} />;
}

// ---------------- progress ----------------
export function Progress({
  value,
  className,
  tone,
}: {
  value: number;
  className?: string;
  tone?: "ok" | "warn" | "danger" | "copper" | "default";
}) {
  const v = Math.max(0, Math.min(100, value));
  const color =
    tone === "ok"
      ? "bg-ok"
      : tone === "warn"
        ? "bg-warn"
        : tone === "danger"
          ? "bg-danger"
          : tone === "copper"
            ? "bg-copper"
            : "bg-primary";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

// ---------------- sparkline ----------------
export function Sparkline({
  points,
  className,
  stroke = "var(--copper)",
  fill = true,
}: {
  points: number[];
  className?: string;
  stroke?: string;
  fill?: boolean;
}) {
  if (points.length < 2) return null;
  const w = 96;
  const h = 28;
  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => [i * step, h - 2 - ((p - min) / range) * (h - 6)]);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-7 w-24", className)} aria-hidden>
      {fill && <path d={area} fill={stroke} opacity={0.12} />}
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------- delta chip ----------------
export function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[11px] font-medium",
        up ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger",
      )}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {up ? "+" : ""}
      {value}
      {suffix}
    </span>
  );
}

// ---------------- empty state ----------------
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------------- score bar ----------------
export function ScoreBar({ value, label }: { value: number; label?: string }) {
  const tone = value >= 70 ? "bg-danger" : value >= 45 ? "bg-warn" : "bg-ok";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </div>
      {label ? (
        <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      ) : (
        <span className="font-mono text-[11px] text-muted-foreground">{value}</span>
      )}
    </div>
  );
}

// ---------------- stat block for KPI cards ----------------
export function StatBlock({
  label,
  value,
  sub,
  delta,
  spark,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: number;
  spark?: number[];
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-3xl font-medium tracking-tight text-foreground">{value}</p>
          {delta !== undefined && (
            <div className="mt-1.5 flex items-center gap-2">
              <Delta value={delta} />
            </div>
          )}
        </div>
        {spark && <Sparkline points={spark} />}
      </div>
      {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
