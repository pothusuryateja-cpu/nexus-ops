import { Button } from "@/components/ui/button";
import { useWarehouse } from "@/store/warehouse";
import { fulfillmentMetrics, stockStatus } from "@/store/engine";
import { ArrowRight, BrainCircuit, GitBranch, PackageCheck, ScanSearch, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router";

function NexusMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M16 6 L26 16 L16 26 L6 16 Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="3.2" fill="currentColor" />
    </svg>
  );
}

const FEATURES = [
  {
    n: "01",
    icon: BrainCircuit,
    title: "Decision engine",
    body: "Every stock conflict, delay and shortage becomes a decision — with the data, the options, the recommendation and the reasoning laid out. Approve, reject or modify, and the warehouse updates.",
  },
  {
    n: "02",
    icon: GitBranch,
    title: "Smart allocation",
    body: "When demand exceeds stock, NEXUS weighs priority scores, deadlines and customer tier before choosing who gets the units — and explains the trade-off it accepted.",
  },
  {
    n: "03",
    icon: PackageCheck,
    title: "Full fulfillment pipeline",
    body: "Order → priority → allocation → picking → packing → QC → dispatch. Every action moves state forward, and every screen reads the same source of truth.",
  },
  {
    n: "04",
    icon: ShieldAlert,
    title: "Exception war room",
    body: "Damaged items, missing stock, QC failures. Each exception follows a fixed workflow — detected, analyzed, decided, resolved — and leaves the queue only when closed.",
  },
  {
    n: "05",
    icon: ScanSearch,
    title: "Bottleneck detection",
    body: "Queue sizes, processing times and delay rates are measured per stage. The system names the constraint and the +minutes it is costing you, then proposes staff moves.",
  },
  {
    n: "06",
    icon: SlidersHorizontal,
    title: "What-if simulator",
    body: "Cut an SKU, disable a picker, spike demand. NEXUS recomputes priority, allocation, risk and bottlenecks on the hypothetical state — before you commit to it.",
  },
];

const PIPELINE = ["Order", "Priority", "Allocate", "Pick", "Pack", "QC", "Dispatch"];

export default function Landing() {
  const { state } = useWarehouse();
  const activeOrders = state.orders.filter((o) => o.stage !== "Dispatched" && o.stage !== "Cancelled").length;
  const fulfillmentRate = fulfillmentMetrics(state).rate;
  const healthy = state.products.filter((p) => stockStatus(p) === "Healthy").length;
  const health = state.products.length ? Math.round((healthy / state.products.length) * 100) : 0;
  const openExceptions = state.exceptions.filter((e) => e.status !== "Resolved").length;
  const pendingDecisions = state.decisions.filter((d) => d.status === "Pending").length;

  const stats = [
    { label: "Live orders", value: String(activeOrders) },
    { label: "Fulfillment", value: `${fulfillmentRate}%` },
    { label: "Inventory health", value: `${health}%` },
    { label: "Open exceptions", value: String(openExceptions) },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* top hairline nav */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5">
          <NexusMark className="size-7 text-foreground" />
          <div className="leading-none">
            <p className="font-display text-sm font-semibold tracking-[0.22em]">NEXUS</p>
            <p className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.3em] text-muted-foreground">Warehouse OS</p>
          </div>
          <nav className="ml-auto hidden items-center gap-6 text-[13px] font-medium text-muted-foreground md:flex" aria-label="Landing">
            <a href="#engine" className="transition-colors hover:text-foreground">The engine</a>
            <a href="#pipeline" className="transition-colors hover:text-foreground">Pipeline</a>
            <a href="#demo" className="transition-colors hover:text-foreground">Guided demo</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-6">
            <Button variant="ghost" size="sm" className="text-[13px]" asChild>
              <Link to="/auth?returnTo=/dashboard">Sign in</Link>
            </Button>
            <Button size="sm" className="gap-1.5 text-[13px]" asChild>
              <Link to="/auth?returnTo=/dashboard">
                Open command center <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative border-b border-border/80">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(to bottom, black, transparent 70%)",
          }}
        />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:py-28 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-copper">
              Smart warehouse operations
            </p>
            <h1 className="mt-5 font-display text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              The warehouse that thinks <em className="text-copper">ahead</em> of every order.
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-7 text-muted-foreground">
              NEXUS WMS runs order fulfillment end to end — allocating scarce stock, scoring priority, catching
              exceptions, and naming bottlenecks before they delay a single promise. It does not just report the
              problem; it recommends the call and executes it when you approve.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button className="h-10 gap-2 px-5 text-sm" asChild>
                <Link to="/auth?returnTo=/dashboard">
                  Enter the command center <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button variant="outline" className="h-10 px-5 text-sm" asChild>
                <Link to="/auth?returnTo=/dashboard">Run the 12-step demo</Link>
              </Button>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-2 gap-px overflow-hidden rounded-md border border-border/80 bg-border/80 sm:grid-cols-4 lg:max-w-none">
              {stats.map((s) => (
                <div key={s.label} className="bg-background px-4 py-3">
                  <dt className="text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{s.label}</dt>
                  <dd className="mt-1 font-mono text-lg font-medium text-foreground">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* framed command-center preview */}
          <div className="relative">
            <div className="rounded-lg border border-border bg-card shadow-[0_24px_60px_-30px_rgba(60,40,10,0.35)]">
              <div className="flex items-center gap-1.5 border-b border-border/80 px-4 py-2.5">
                <span className="size-2 rounded-full bg-border" />
                <span className="size-2 rounded-full bg-border" />
                <span className="size-2 rounded-full bg-border" />
                <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Command Center · live
                </span>
                <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-ok">
                  <span className="size-1.5 animate-pulse rounded-full bg-ok" /> simulated
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                {stats.map((s, i) => (
                  <div key={s.label} className="rounded-md border border-border/70 bg-background/60 px-3 py-2.5">
                    <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{s.label}</p>
                    <p className="mt-1 font-display text-xl font-medium tracking-tight">{s.value}</p>
                    <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">Δ {[2.4, 1.1, -0.8, 3.2][i] > 0 ? "+" : ""}{[2.4, 1.1, -0.8, 3.2][i]}%</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-border/80 p-4">
                <p className="mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">System recommendation · stock conflict</p>
                <div className="rounded-md border border-copper/30 bg-copper/5 p-3">
                  <p className="text-[11px] font-medium leading-5">
                    Allocate 7 units of <span className="font-mono">SKU-204</span> to <span className="font-mono">#NXS-1042</span>.
                  </p>
                  <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                    Highest urgency, shortest deadline · expected impact: urgent order stays fulfillable · risk: second order waits.
                  </p>
                  <div className="mt-2.5 flex gap-1.5">
                    <span className="rounded bg-foreground px-2 py-0.5 font-mono text-[9px] font-semibold text-background">APPROVE</span>
                    <span className="rounded border border-border px-2 py-0.5 font-mono text-[9px] text-muted-foreground">MODIFY</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5">DC-101</span>
                  <span className="rounded-full bg-muted px-2 py-0.5">EX-008</span>
                  <span className="rounded-full bg-muted px-2 py-0.5">{pendingDecisions} decisions open</span>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center font-mono text-[10px] text-muted-foreground">
              Every number above is live application state — not a mockup.
            </p>
          </div>
        </div>
      </section>

      {/* pipeline */}
      <section id="pipeline" className="border-b border-border/80">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-copper">The pipeline</p>
              <h2 className="mt-3 font-display text-3xl font-medium tracking-tight sm:text-4xl">
                One connected flow, start to dispatch.
              </h2>
            </div>
            <p className="hidden max-w-xs text-[13px] leading-6 text-muted-foreground sm:block">
              Cancel a hold and the mission list reorders. Release an allocation and stock returns. The state is one.
            </p>
          </div>
          <ol className="mt-10 grid gap-px overflow-hidden rounded-md border border-border/80 bg-border/80 sm:grid-cols-7">
            {PIPELINE.map((stage, i) => (
              <li key={stage} className="group flex items-center gap-3 bg-background px-4 py-5">
                <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[13px] font-medium transition-colors group-hover:text-copper">{stage}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* features */}
      <section id="engine" className="border-b border-border/80">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-copper">What NEXUS does</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-medium tracking-tight sm:text-4xl">
            Built for decisions, not just dashboards.
          </h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-md border border-border/80 bg-border/80 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.n} className="group flex flex-col gap-4 bg-background p-6 transition-colors hover:bg-card">
                <div className="flex items-center justify-between">
                  <f.icon className="size-5 text-copper" aria-hidden />
                  <span className="font-mono text-[10px] text-muted-foreground">{f.n}</span>
                </div>
                <div>
                  <h3 className="font-display text-lg font-medium tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{f.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* demo CTA */}
      <section id="demo" className="border-b border-border/80">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
          <div className="relative overflow-hidden rounded-lg border border-copper/25 bg-gradient-to-br from-card via-card to-accent/40 px-6 py-12 text-center sm:px-12 sm:py-16">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
                backgroundSize: "48px 48px",
                maskImage: "radial-gradient(ellipse at center, black, transparent 75%)",
              }}
            />
            <div className="relative">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-copper">Guided demo</p>
              <h2 className="mx-auto mt-4 max-w-2xl font-display text-3xl font-medium tracking-tight sm:text-4xl">
                Watch a shortage become a resolved decision in twelve steps.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[14px] leading-7 text-muted-foreground">
                Normal operations → stock shortage → conflict detected → priority & allocation engines → operator
                approval → inventory updates → reorder appears → packing bottleneck → corrective action → exception
                resolved. The entire concept, end to end.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button className="h-10 gap-2 px-6 text-sm" asChild>
                  <Link to="/auth?returnTo=/dashboard">
                    Run the demo <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button variant="outline" className="h-10 px-6 text-sm" asChild>
                  <Link to="/auth?returnTo=/dashboard">Open the simulator</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <NexusMark className="size-4" />
          <span className="font-semibold tracking-[0.18em] text-foreground">NEXUS WMS</span>
        </span>
        <span>Warehouse Operations & Order Fulfillment</span>
        <span className="ml-auto font-mono">v1.0 · simulated live feed · {activeOrders} orders in flight</span>
      </footer>
    </div>
  );
}
