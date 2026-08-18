// ============================================================
// NEXUS WMS — central store (single source of truth)
// ============================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ActivityEvent,
  AppState,
  Decision,
  ExceptionRecord,
  ExceptionType,
  Order,
  Scenario,
  Severity,
  SimulationReport,
  Tier,
} from "./types";
import {
  computePriority,
  computeRisk,
  detectBottlenecks,
  findConflicts,
  fmtMoney,
  HOUR,
  recommendAllocation,
  reorderRecommendation,
  snapshot,
} from "./engine";
import { seedState } from "./seed";

const STORAGE_KEY = "nexus-wms-state-v1";

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------
const iso = (ms: number) => new Date(ms).toISOString();
const nowIso = () => iso(Date.now());

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.version === 1 && Array.isArray(parsed.orders)) {
        return parsed;
      }
    }
  } catch {
    // fall through to seed
  }
  return seedState();
}

type Result = { ok: true } | { ok: false; error: string };

// ------------------------------------------------------------
// context
// ------------------------------------------------------------
export interface WarehouseApi {
  state: AppState;
  // orders
  createOrder(input: { customer: string; tier: Tier; items: { sku: string; qty: number }[] }): Result;
  updateOrder(id: string, patch: Partial<Pick<Order, "customer" | "tier" | "promisedAt">>): Result;
  prioritizeOrder(id: string): Result;
  allocateOrder(id: string): Result;
  releaseAllocation(id: string): Result;
  holdOrder(id: string): Result;
  unholdOrder(id: string): Result;
  cancelOrder(id: string): Result;
  dispatchOrder(id: string): Result;
  // decisions
  approveDecision(id: string): Result;
  rejectDecision(id: string): Result;
  updateDecision(id: string, patch: Partial<Decision>): Result;
  // inventory
  editStock(sku: string, patch: { available?: number; incoming?: number; damaged?: number }): Result;
  reserveStock(sku: string, qty: number): Result;
  releaseStock(sku: string, qty: number): Result;
  markDamaged(sku: string, qty: number): Result;
  restock(sku: string, qty: number): Result;
  createReorder(sku: string): Result;
  receiveIncoming(sku: string): Result;
  // picking
  startMission(id: string, pickerId: string): Result;
  pauseMission(id: string): Result;
  resumeMission(id: string): Result;
  completeItem(missionId: string, sku: string): Result;
  completeMission(id: string): Result;
  reassignMission(id: string, pickerId: string): Result;
  // packing / qc
  startPacking(orderId: string, stationId: string): Result;
  markPacked(orderId: string): Result;
  holdPacking(orderId: string): Result;
  resumePacking(orderId: string): Result;
  qcPass(orderId: string): Result;
  qcFail(orderId: string, reason: string): Result;
  // dispatch
  createBatch(orderIds: string[], carrier: string): Result;
  markBatchReady(id: string): Result;
  dispatchBatch(id: string): Result;
  // exceptions
  createException(input: {
    type: ExceptionType;
    severity: Severity;
    orderId?: string;
    sku?: string;
    zone?: string;
    cause: string;
    recommendation: string;
  }): Result;
  analyzeException(id: string): Result;
  requestDecision(id: string): Result;
  startResolution(id: string): Result;
  resolveException(id: string, resolution: string): Result;
  createReplacementAllocation(id: string): Result;
  // notifications / feed
  markNotificationRead(id: string): void;
  markAllNotificationsRead(): void;
  clearEvents(): void;
  togglePaused(): void;
  // settings / data
  updateSettings(patch: Partial<AppState["settings"]>): void;
  resetData(): void;
  // simulator
  runScenario(scenario: Scenario): SimulationReport;
  applyScenario(scenario: Scenario): SimulationReport;
  // demo
  demoStep(step: number): { ok: boolean; message: string };
}

const WarehouseContext = createContext<WarehouseApi | null>(null);

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState());
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---- theme + motion classes from settings ----
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", state.settings.theme === "ink");
    root.classList.remove("anim-reduced", "anim-off");
    if (state.settings.animation === "reduced") root.classList.add("anim-reduced");
    if (state.settings.animation === "off") root.classList.add("anim-off");
  }, [state.settings.theme, state.settings.animation]);

  // ---- persistence ----
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // storage full — ignore
      }
    }, 400);
    return () => clearTimeout(t);
  }, [state]);

  // ==========================================================
  // core mutator: clone → mutate → reconcile → commit
  // ==========================================================
  const update = useCallback(
    (fn: (draft: AppState) => Result | void, announce?: (draft: AppState, result: Result | void) => void): Result => {
      const draft: AppState = structuredClone(stateRef.current);
      const result = fn(draft) ?? { ok: true };
      if (result.ok) {
        reconcile(draft);
        if (announce) announce(draft, result);
        setState(draft);
      }
      return result;
    },
    [],
  );

  const pushEvent = (draft: AppState, text: string, kind: ActivityEvent["kind"], level: ActivityEvent["level"]) => {
    draft.events = [
      {
        id: `EV-${draft.counters.eventSeq++}`,
        at: nowIso(),
        kind,
        text,
        level,
      },
      ...draft.events,
    ].slice(0, 80);
  };

  const pushNotification = (
    draft: AppState,
    type: AppState["notifications"][number]["type"],
    title: string,
    body: string,
    navigateTo?: string,
  ) => {
    const pref =
      draft.settings.notifications[
        type === "Critical Stock" ? "criticalStock"
        : type === "Order Delay" ? "orderDelay"
        : type === "Allocation Conflict" ? "allocationConflict"
        : type === "Exception" ? "exception"
        : type === "Bottleneck" ? "bottleneck"
        : "reorder"
      ];
    if (!pref) return;
    draft.notifications = [
      { id: `NT-${draft.counters.notifSeq++}`, type, title, body, read: false, createdAt: nowIso(), navigateTo },
      ...draft.notifications,
    ].slice(0, 40);
  };

  // ==========================================================
  // RECONCILE — engines watch the state and generate decisions
  // ==========================================================
  function reconcile(draft: AppState) {
    // 1. recompute priorities + risk for live orders
    for (const o of draft.orders) {
      if (o.stage === "Dispatched" || o.stage === "Cancelled") continue;
      const pr = computePriority(o, draft.products);
      o.priority = pr.score;
      o.priorityReasons = pr.reasons;
      o.risk = computeRisk(o, draft.products);
    }
    const existing = (key: string) =>
      draft.decisions.some((d) => d.refKey === key && d.status !== "Rejected");

    // 2. stock conflicts (top 3)
    const conflicts = findConflicts(draft);
    let added = 0;
    for (const c of conflicts) {
      if (added >= 3) break;
      const key = `conflict:${c.sku}`;
      if (existing(key)) continue;
      const d = recommendAllocation(draft, c);
      d.refKey = key;
      d.id = `DC-${draft.counters.decisionSeq++}`;
      draft.decisions.push(d);
      pushEvent(draft, `STOCK CONFLICT detected · ${c.sku} · ${c.available}/${c.demand} units`, "decision", "warn");
      pushNotification(draft, "Allocation Conflict", `Stock conflict on ${c.sku}`, `${c.demand} units demanded, ${c.available} available.`, `/decisions?decision=${d.id}`);
      added++;
    }

    // 3. reorders (top 5)
    let reorders = 0;
    for (const p of draft.products) {
      if (reorders >= 5) break;
      if (p.available > p.reorderPoint) continue;
      const key = `reorder:${p.sku}`;
      if (existing(key)) continue;
      const rec = reorderRecommendation(p);
      if (!rec) continue;
      rec.refKey = key;
      rec.id = `DC-${draft.counters.decisionSeq++}`;
      draft.decisions.push(rec);
      pushEvent(draft, `REORDER triggered · ${p.sku} · ${rec.params?.qty} units`, "stock", "warn");
      pushNotification(draft, "Reorder", `Resupply recommended for ${p.sku}`, `${rec.params?.qty} units at ${rec.recommendation.includes("HIGH") ? "HIGH" : "MEDIUM"} urgency.`, `/inventory?sku=${p.sku}`);
      reorders++;
    }

    // 4. bottleneck (one per stage)
    const bottlenecks = detectBottlenecks(draft);
    for (const b of bottlenecks.slice(0, 2)) {
      if (b.impactMin < 5) continue;
      const key = `bottleneck:${b.stage.toLowerCase()}`;
      if (existing(key)) continue;
      const d: Decision = {
        id: `DC-${draft.counters.decisionSeq++}`,
        kind: "Bottleneck",
        title: `${b.stage} bottleneck — queue ${b.queue} orders`,
        problem: `${b.stage} is the current bottleneck: ${b.queue} order(s) queued, average processing ${b.avgMin} min vs ${b.normalMin} min normal.`,
        data: [
          `Queue: ${b.queue} orders`,
          `Average processing: ${b.avgMin} min`,
          `Normal: ${b.normalMin} min`,
          `Estimated impact: +${b.impactMin} min`,
        ],
        options: [
          `Move staff to ${b.stage.toLowerCase()}`,
          "Accept delay and notify affected customers",
          `Add overtime to ${b.stage.toLowerCase()} stations`,
        ],
        recommendation: `Move staff to ${b.stage.toLowerCase()} (option 1).`,
        reasoning: `+${b.impactMin} min of delay propagates to downstream stages. One additional operator reduces the queue by ~3 orders within the hour.`,
        impact: `${b.stage} queue drops by ~3 orders; downstream delay normalizes.`,
        risk: "Low",
        status: "Pending",
        action: "move-staff",
        params: { fromStage: "QC", station: b.stage === "Packing" ? "PK-2" : undefined },
        refKey: key,
        createdAt: nowIso(),
      };
      draft.decisions.push(d);
      pushEvent(draft, `BOTTLENECK detected · ${b.stage} · ${b.queue} orders queued`, "system", "warn");
      pushNotification(draft, "Bottleneck", `${b.stage} bottleneck detected`, `${b.queue} orders queued; +${b.impactMin} min impact.`, `/decisions?decision=${d.id}`);
    }

    // 5. at-risk orders (top 3)
    const atRisk = draft.orders
      .filter((o) => o.risk >= 70 && o.stage !== "Dispatched" && o.stage !== "Cancelled")
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 3);
    for (const o of atRisk) {
      const key = `atrisk:${o.id}`;
      if (existing(key)) continue;
      const overdue = new Date(o.promisedAt).getTime() < Date.now();
      const d: Decision = {
        id: `DC-${draft.counters.decisionSeq++}`,
        kind: "At-Risk Order",
        title: `${o.id} at risk (risk ${o.risk}/100)`,
        problem: `${o.id} (${o.customer}) is ${overdue ? "past" : "approaching"} its promised delivery window.`,
        data: [
          `Order: ${o.id} — ${o.customer}`,
          `Promised: ${new Date(o.promisedAt).toLocaleString()}`,
          `Stage: ${o.stage}`,
          `Risk score: ${o.risk}/100`,
        ],
        options: [
          "Expedite through remaining stages",
          "Contact customer with revised window",
          "Re-prioritize stock from lower-priority orders",
        ],
        recommendation: "Expedite through remaining stages (option 1).",
        reasoning: "Every hour in queue adds customer impact. Expediting one order costs minimal capacity.",
        impact: "Order ships within 2 hours; SLA impact contained.",
        risk: "Low",
        status: "Pending",
        action: "expedite",
        params: { orderId: o.id },
        refKey: key,
        createdAt: nowIso(),
      };
      draft.decisions.push(d);
      pushEvent(draft, `ORDER ${o.id} flagged at risk · risk ${o.risk}/100`, "order", "danger");
      pushNotification(draft, "Order Delay", `${o.id} at risk`, `Risk score ${o.risk}/100.`, `/orders?order=${o.id}`);
    }
  }

  // ----------------------------------------------------------
  // ORDER ACTIONS
  // ----------------------------------------------------------
  const orderById = (draft: AppState, id: string) => draft.orders.find((o) => o.id === id);
  const productBySku = (draft: AppState, sku: string) => draft.products.find((p) => p.sku === sku);

  const createMissionForOrder = (draft: AppState, order: Order) => {
    const items = order.items
      .filter((i) => i.allocated > 0)
      .map((i) => {
        const prod = productBySku(draft, i.sku);
        return { sku: i.sku, qty: i.allocated, picked: 0, bin: prod?.location ?? "-" };
      });
    const zones = [...new Set(order.items.map((i) => productBySku(draft, i.sku)?.zone).filter(Boolean))] as string[];
    const normalM = 90 + order.items.length * 14 + zones.length * 20;
    const optimizedM = Math.round(normalM * 0.68);
    const mission = {
      id: `PX-${draft.counters.missionSeq++}`,
      orderId: order.id,
      pickerId: "",
      items,
      zones,
      route: { normalM, optimizedM, savedM: normalM - optimizedM, savedMin: Math.round((normalM - optimizedM) / 40) },
      status: "Ready" as const,
      progress: 0,
      deadlineMin: Math.max(15, 10 + order.items.length * 3 + zones.length * 2),
      elapsedMin: 0,
    };
    draft.missions.push(mission);
    order.missionId = mission.id;
  };

  const createOrder: WarehouseApi["createOrder"] = (input) => {
    if (!input.customer.trim()) return { ok: false, error: "Customer name is required." };
    if (input.items.length === 0) return { ok: false, error: "Add at least one item." };
    for (const it of input.items) {
      if (it.qty <= 0) return { ok: false, error: `Quantity must be positive for ${it.sku}.` };
    }
    return update((draft) => {
      const id = `NXS-${draft.counters.orderSeq++}`;
      const items = input.items.map((i) => ({ sku: i.sku, qty: i.qty, allocated: 0, picked: 0, packed: 0 }));
      const totalQty = items.reduce((s, i) => s + i.qty, 0);
      const value = items.reduce((s, i) => s + (productBySku(draft, i.sku)?.price ?? 0) * i.qty, 0);
      const now = Date.now();
      const order: Order = {
        id,
        customer: input.customer,
        tier: input.tier,
        items,
        totalQty,
        value,
        createdAt: iso(now),
        promisedAt: iso(now + 18 * HOUR),
        priority: 0,
        priorityReasons: [],
        risk: 0,
        stage: "Created",
        allocationStatus: "None",
        zone: productBySku(draft, items[0].sku)?.zone ?? "A",
        history: [
          { at: iso(now), label: "Order created", detail: "Entered manually by operator" },
        ],
        createdSource: "manual",
      };
      draft.orders.push(order);
      pushEvent(draft, `ORDER ${id} created · ${totalQty} units · ${fmtMoney(value)}`, "order", "info");
      return { ok: true };
    });
  };

  const updateOrder: WarehouseApi["updateOrder"] = (id, patch) =>
    update((draft) => {
      const o = orderById(draft, id);
      if (!o) return { ok: false, error: `Order ${id} not found.` };
      if (patch.promisedAt) o.promisedAt = patch.promisedAt;
      if (patch.customer) o.customer = patch.customer;
      if (patch.tier) {
        o.tier = patch.tier;
        o.history.push({ at: nowIso(), label: "Customer tier updated", detail: `Now ${patch.tier}` });
      }
      pushEvent(draft, `ORDER ${id} updated`, "order", "info");
    });

  const prioritizeOrder: WarehouseApi["prioritizeOrder"] = (id) =>
    update((draft) => {
      const o = orderById(draft, id);
      if (!o) return { ok: false, error: `Order ${id} not found.` };
      if (o.stage === "Dispatched" || o.stage === "Cancelled")
        return { ok: false, error: "Order is no longer active." };
      if (o.stage !== "Created") return { ok: false, error: "Order has already been prioritized." };
      o.stage = "Prioritized";
      o.history.push({ at: nowIso(), label: "Prioritized by operator", detail: "Manual priority pass" });
      pushEvent(draft, `ORDER ${id} prioritized · ${o.priority}/100`, "order", "info");
    });

  const allocateOrder: WarehouseApi["allocateOrder"] = (id) =>
    update((draft) => {
      const o = orderById(draft, id);
      if (!o) return { ok: false, error: `Order ${id} not found.` };
      if (o.stage === "Dispatched" || o.stage === "Cancelled")
        return { ok: false, error: "This order is no longer allocatable." };
      let given = 0;
      for (const it of o.items) {
        const need = it.qty - it.allocated;
        if (need <= 0) continue;
        const prod = productBySku(draft, it.sku);
        if (!prod) continue;
        const give = Math.min(need, prod.available);
        if (give > 0) {
          prod.available -= give;
          prod.reserved += give;
          it.allocated += give;
          given += give;
        }
      }
      if (given === 0) return { ok: false, error: "Cannot allocate — insufficient available stock for every line." };
      const full = o.items.every((i) => i.allocated >= i.qty);
      o.allocationStatus = full ? "Full" : "Partial";
      o.allocatedAt = nowIso();
      if (o.stage === "Created" || o.stage === "Prioritized" || o.stage === "Held") {
        o.stage = "Allocated";
        o.held = false;
      }
      if (!o.missionId) createMissionForOrder(draft, o);
      o.history.push({
        at: nowIso(),
        label: full ? "Fully allocated" : "Partially allocated",
        detail: `${given} units committed${full ? "" : " — remaining lines await stock"}`,
      });
      pushEvent(draft, `ORDER ${id} ${full ? "allocated" : "partially allocated"} · ${given} units`, "order", "info");
    });

  const releaseAllocation: WarehouseApi["releaseAllocation"] = (id) =>
    update((draft) => {
      const o = orderById(draft, id);
      if (!o) return { ok: false, error: `Order ${id} not found.` };
      if (o.stage === "Dispatched" || o.stage === "Cancelled")
        return { ok: false, error: "Cannot release a dispatched or cancelled order." };
      if (o.stage === "Picking" || o.stage === "Packing" || o.stage === "QC")
        return { ok: false, error: "Cannot release allocation after picking has started." };
      let released = 0;
      for (const it of o.items) {
        if (it.allocated > 0) {
          const prod = productBySku(draft, it.sku);
          if (prod) {
            prod.available += it.allocated;
            prod.reserved -= it.allocated;
          }
          released += it.allocated;
          it.allocated = 0;
          it.picked = 0;
        }
      }
      o.allocationStatus = "Released";
      if (o.missionId) {
        const m = draft.missions.find((x) => x.id === o.missionId);
        if (m && m.status === "Ready") {
          draft.missions = draft.missions.filter((x) => x.id !== m.id);
          o.missionId = undefined;
        }
      }
      o.history.push({ at: nowIso(), label: "Allocation released", detail: `${released} units returned to available stock` });
      pushEvent(draft, `ALLOCATION released · ${id} · ${released} units back to stock`, "order", "info");
    });

  const holdOrder: WarehouseApi["holdOrder"] = (id) =>
    update((draft) => {
      const o = orderById(draft, id);
      if (!o) return { ok: false, error: `Order ${id} not found.` };
      if (o.stage === "Dispatched" || o.stage === "Cancelled") return { ok: false, error: "Cannot hold this order." };
      o.held = true;
      o.history.push({ at: nowIso(), label: "Order held", detail: "Paused by operator" });
      pushEvent(draft, `ORDER ${id} held`, "order", "warn");
    });

  const unholdOrder: WarehouseApi["unholdOrder"] = (id) =>
    update((draft) => {
      const o = orderById(draft, id);
      if (!o) return { ok: false, error: `Order ${id} not found.` };
      o.held = false;
      o.history.push({ at: nowIso(), label: "Hold released", detail: "Resumed by operator" });
      pushEvent(draft, `ORDER ${id} resumed`, "order", "info");
    });

  const cancelOrder: WarehouseApi["cancelOrder"] = (id) =>
    update((draft) => {
      const o = orderById(draft, id);
      if (!o) return { ok: false, error: `Order ${id} not found.` };
      if (o.stage === "Dispatched") return { ok: false, error: "Cannot cancel a dispatched order." };
      // return allocated stock
      for (const it of o.items) {
        if (it.allocated > 0) {
          const prod = productBySku(draft, it.sku);
          if (prod) {
            prod.available += it.allocated;
            prod.reserved -= it.allocated;
          }
          it.allocated = 0;
        }
      }
      if (o.missionId) {
        const m = draft.missions.find((x) => x.id === o.missionId);
        if (m && m.status !== "Completed") {
          draft.missions = draft.missions.filter((x) => x.id !== m.id);
          const picker = draft.pickers.find((p) => p.id === m.pickerId);
          if (picker && picker.activeMissionId === m.id) {
            picker.status = "Idle";
            picker.activeMissionId = undefined;
          }
        }
        o.missionId = undefined;
      }
      if (o.stationId) {
        const st = draft.stations.find((s) => s.id === o.stationId);
        if (st) {
          st.orderId = undefined;
          st.status = "Idle";
        }
        o.stationId = undefined;
      }
      o.stage = "Cancelled";
      o.allocationStatus = "Released";
      o.history.push({ at: nowIso(), label: "Order cancelled", detail: "Stock returned to inventory" });
      pushEvent(draft, `ORDER ${id} cancelled · stock released`, "order", "danger");
    });

  const dispatchOrder: WarehouseApi["dispatchOrder"] = (id) =>
    update((draft) => {
      const o = orderById(draft, id);
      if (!o) return { ok: false, error: `Order ${id} not found.` };
      if (o.qcStatus !== "Passed")
        return { ok: false, error: "Cannot dispatch an order that has not passed QC." };
      if (o.stage === "Dispatched") return { ok: false, error: "Order is already dispatched." };
      for (const it of o.items) {
        const prod = productBySku(draft, it.sku);
        if (prod) {
          prod.reserved -= it.allocated;
          prod.total -= it.allocated;
          it.picked = it.allocated;
        }
      }
      o.stage = "Dispatched";
      o.dispatchedAt = nowIso();
      o.history.push({ at: nowIso(), label: "Dispatched", detail: "Shipped to customer" });
      // remove from batches
      for (const b of draft.batches) {
        b.orderIds = b.orderIds.filter((x) => x !== id);
      }
      pushEvent(draft, `ORDER ${id} dispatched · ${o.totalQty} units`, "dispatch", "success");
    });

  // ----------------------------------------------------------
  // DECISION ACTIONS
  // ----------------------------------------------------------
  const applyDecision = (draft: AppState, d: Decision): Result => {
    const params = d.params;
    if (!params) return { ok: false, error: "Decision has no executable parameters." };
    switch (d.action) {
      case "allocate": {
        const o = orderById(draft, params.orderId ?? "");
        const prod = productBySku(draft, params.sku ?? "");
        if (!o) return { ok: false, error: "Target order no longer exists." };
        if (!prod) return { ok: false, error: "SKU not found." };
        if (o.stage === "Dispatched" || o.stage === "Cancelled")
          return { ok: false, error: "Target order is no longer active." };
        const it = o.items.find((x) => x.sku === params.sku);
        const need = it ? it.qty - it.allocated : 0;
        const want = params.qty ?? prod.available;
        const give = Math.min(want, prod.available, Math.max(0, need > 0 ? need : prod.available));
        if (give <= 0) return { ok: false, error: `No stock available for ${params.sku}.` };
        prod.available -= give;
        prod.reserved += give;
        if (it) it.allocated += give;
        const full = o.items.every((i) => i.allocated >= i.qty);
        o.allocationStatus = full ? "Full" : "Partial";
        if (o.stage === "Created" || o.stage === "Prioritized") {
          o.stage = "Allocated";
          if (!o.missionId) createMissionForOrder(draft, o);
        }
        o.allocatedAt = nowIso();
        o.history.push({ at: nowIso(), label: "Decision approved — allocated", detail: `${give} units of ${params.sku}` });
        pushEvent(draft, `DECISION ${d.id} approved · ${give} units of ${params.sku} → ${o.id}`, "decision", "success");
        return { ok: true };
      }
      case "reorder": {
        const prod = productBySku(draft, params.sku ?? "");
        if (!prod) return { ok: false, error: "SKU not found." };
        prod.incoming += params.qty ?? 0;
        pushEvent(draft, `RESUPPLY MISSION created · ${params.qty} units of ${params.sku}`, "stock", "success");
        pushNotification(draft, "Reorder", `Resupply mission created for ${params.sku}`, `${params.qty} units now inbound.`, `/inventory?sku=${params.sku}`);
        return { ok: true };
      }
      case "expedite": {
        const o = orderById(draft, params.orderId ?? "");
        if (!o) return { ok: false, error: "Order not found." };
        o.history.push({ at: nowIso(), label: "Expedited", detail: "Pushed to front of fulfillment queue by operator" });
        pushEvent(draft, `ORDER ${o.id} expedited by decision ${d.id}`, "order", "success");
        return { ok: true };
      }
      case "move-staff": {
        const station = draft.stations.find((s) => s.id === params.station);
        if (station) {
          station.avgTimeMin = Math.round(station.avgTimeMin * 0.85 * 10) / 10;
          pushEvent(draft, `STAFF moved to ${station.name} · packing capacity +15%`, "system", "success");
        } else {
          pushEvent(draft, `STAFF moved to ${params.fromStage ?? "packing"} · capacity increased`, "system", "success");
        }
        return { ok: true };
      }
      case "hold": {
        pushEvent(draft, `HOLDING ${params.sku} · waiting for replenishment`, "stock", "info");
        return { ok: true };
      }
      default:
        return { ok: false, error: "Unknown decision action." };
    }
  };

  const approveDecision: WarehouseApi["approveDecision"] = (id) =>
    update((draft) => {
      const d = draft.decisions.find((x) => x.id === id);
      if (!d) return { ok: false, error: "Decision not found." };
      if (d.status === "Approved") return { ok: false, error: "Decision already approved." };
      const res = applyDecision(draft, d);
      if (!res.ok) return res;
      d.status = "Approved";
      d.resolvedAt = nowIso();
      return { ok: true };
    });

  const rejectDecision: WarehouseApi["rejectDecision"] = (id) =>
    update((draft) => {
      const d = draft.decisions.find((x) => x.id === id);
      if (!d) return { ok: false, error: "Decision not found." };
      d.status = "Rejected";
      d.resolvedAt = nowIso();
      pushEvent(draft, `DECISION ${id} rejected`, "decision", "warn");
    });

  const updateDecision: WarehouseApi["updateDecision"] = (id, patch) =>
    update((draft) => {
      const d = draft.decisions.find((x) => x.id === id);
      if (!d) return { ok: false, error: "Decision not found." };
      if (patch.params) d.params = { ...d.params, ...patch.params };
      if (patch.recommendation) d.recommendation = patch.recommendation;
      if (patch.data) d.data = patch.data;
      d.status = "Modified";
      pushEvent(draft, `DECISION ${id} modified by operator`, "decision", "info");
    });

  // ----------------------------------------------------------
  // INVENTORY ACTIONS
  // ----------------------------------------------------------
  const editStock: WarehouseApi["editStock"] = (sku, patch) =>
    update((draft) => {
      const p = productBySku(draft, sku);
      if (!p) return { ok: false, error: `SKU ${sku} not found.` };
      if (patch.available !== undefined) {
        if (patch.available < 0) return { ok: false, error: "Available stock cannot be negative." };
        const delta = patch.available - p.available;
        p.available = patch.available;
        p.total = p.available + p.reserved + p.damaged;
        if (delta < 0) pushEvent(draft, `STOCK adjusted · ${sku} available ${patch.available} (${delta > 0 ? "+" : ""}${delta})`, "stock", delta < 0 ? "warn" : "info");
      }
      if (patch.incoming !== undefined) {
        if (patch.incoming < 0) return { ok: false, error: "Incoming stock cannot be negative." };
        p.incoming = patch.incoming;
      }
      if (patch.damaged !== undefined) {
        if (patch.damaged < p.damaged) return { ok: false, error: "Use restock or receive to reduce damaged count." };
        const delta = patch.damaged - p.damaged;
        p.damaged = patch.damaged;
        p.total = p.available + p.reserved + p.damaged;
        pushEvent(draft, `DAMAGED updated · ${sku} +${delta} units`, "stock", "warn");
      }
    });

  const reserveStock: WarehouseApi["reserveStock"] = (sku, qty) =>
    update((draft) => {
      const p = productBySku(draft, sku);
      if (!p) return { ok: false, error: `SKU ${sku} not found.` };
      if (qty <= 0) return { ok: false, error: "Quantity must be positive." };
      if (qty > p.available) return { ok: false, error: `Cannot reserve more stock than available (${p.available}).` };
      p.available -= qty;
      p.reserved += qty;
      pushEvent(draft, `STOCK reserved · ${sku} · ${qty} units`, "stock", "info");
    });

  const releaseStock: WarehouseApi["releaseStock"] = (sku, qty) =>
    update((draft) => {
      const p = productBySku(draft, sku);
      if (!p) return { ok: false, error: `SKU ${sku} not found.` };
      if (qty <= 0) return { ok: false, error: "Quantity must be positive." };
      if (qty > p.reserved) return { ok: false, error: `Only ${p.reserved} units are reserved.` };
      p.reserved -= qty;
      p.available += qty;
      pushEvent(draft, `STOCK released · ${sku} · ${qty} units to available`, "stock", "info");
    });

  const markDamaged: WarehouseApi["markDamaged"] = (sku, qty) =>
    update((draft) => {
      const p = productBySku(draft, sku);
      if (!p) return { ok: false, error: `SKU ${sku} not found.` };
      if (qty <= 0) return { ok: false, error: "Quantity must be positive." };
      if (qty > p.available) return { ok: false, error: `Only ${p.available} units available to damage out.` };
      p.available -= qty;
      p.damaged += qty;
      pushEvent(draft, `DAMAGED · ${sku} · ${qty} units written off`, "stock", "danger");
    });

  const restock: WarehouseApi["restock"] = (sku, qty) =>
    update((draft) => {
      const p = productBySku(draft, sku);
      if (!p) return { ok: false, error: `SKU ${sku} not found.` };
      if (qty <= 0) return { ok: false, error: "Quantity must be positive." };
      p.available += qty;
      p.total = p.available + p.reserved + p.damaged;
      pushEvent(draft, `STOCK RESTOCKED · ${sku} · +${qty} units`, "stock", "success");
    });

  const createReorder: WarehouseApi["createReorder"] = (sku) =>
    update((draft) => {
      const p = productBySku(draft, sku);
      if (!p) return { ok: false, error: `SKU ${sku} not found.` };
      if (p.available > p.reorderPoint) return { ok: false, error: `${sku} is above its reorder point — no resupply needed.` };
      const rec = reorderRecommendation(p);
      const qty = rec?.params?.qty ?? p.minOrderQty;
      p.incoming += qty;
      pushEvent(draft, `RESUPPLY MISSION created · ${qty} units of ${sku}`, "stock", "success");
      pushNotification(draft, "Reorder", `Resupply mission created for ${sku}`, `${qty} units now inbound.`, `/inventory?sku=${sku}`);
      const d = draft.decisions.find((x) => x.refKey === `reorder:${sku}` && x.status === "Pending");
      if (d) {
        d.status = "Approved";
        d.resolvedAt = nowIso();
      }
    });

  const receiveIncoming: WarehouseApi["receiveIncoming"] = (sku) =>
    update((draft) => {
      const p = productBySku(draft, sku);
      if (!p) return { ok: false, error: `SKU ${sku} not found.` };
      if (p.incoming <= 0) return { ok: false, error: `${sku} has no incoming stock to receive.` };
      p.available += p.incoming;
      p.incoming = 0;
      p.total = p.available + p.reserved + p.damaged;
      pushEvent(draft, `INBOUND RECEIVED · ${sku} moved to available`, "stock", "success");
    });

  // ----------------------------------------------------------
  // PICKING ACTIONS
  // ----------------------------------------------------------
  const missionById = (draft: AppState, id: string) => draft.missions.find((m) => m.id === id);

  const startMission: WarehouseApi["startMission"] = (id, pickerId) =>
    update((draft) => {
      const m = missionById(draft, id);
      if (!m) return { ok: false, error: "Mission not found." };
      const picker = draft.pickers.find((p) => p.id === pickerId);
      if (!picker) return { ok: false, error: "Picker not found." };
      if (picker.status !== "Idle") return { ok: false, error: `${picker.name} is not available.` };
      const o = orderById(draft, m.orderId);
      if (!o) return { ok: false, error: "Order not found." };
      if (o.stage === "Cancelled" || o.stage === "Dispatched") return { ok: false, error: "Order is no longer active." };
      m.status = "Active";
      m.pickerId = pickerId;
      m.startedAt = nowIso();
      picker.status = "Active";
      picker.activeMissionId = m.id;
      picker.zone = m.zones[0] ?? picker.zone;
      o.stage = "Picking";
      o.pickerId = pickerId;
      o.history.push({ at: nowIso(), label: "Picking started", detail: `${picker.name} (${pickerId}) · ${m.items.length} lines` });
      pushEvent(draft, `PICKER ${pickerId} started mission ${id} · ${m.items.reduce((s, i) => s + i.qty, 0)} items`, "picker", "info");
    });

  const pauseMission: WarehouseApi["pauseMission"] = (id) =>
    update((draft) => {
      const m = missionById(draft, id);
      if (!m) return { ok: false, error: "Mission not found." };
      if (m.status !== "Active") return { ok: false, error: "Only active missions can be paused." };
      m.status = "Paused";
      const picker = draft.pickers.find((p) => p.id === m.pickerId);
      if (picker) picker.status = "Paused";
      pushEvent(draft, `PICKER ${m.pickerId} paused mission ${id}`, "picker", "warn");
    });

  const resumeMission: WarehouseApi["resumeMission"] = (id) =>
    update((draft) => {
      const m = missionById(draft, id);
      if (!m) return { ok: false, error: "Mission not found." };
      if (m.status !== "Paused") return { ok: false, error: "Only paused missions can be resumed." };
      m.status = m.elapsedMin > m.deadlineMin ? "Delayed" : "Active";
      const picker = draft.pickers.find((p) => p.id === m.pickerId);
      if (picker) picker.status = "Active";
      pushEvent(draft, `PICKER ${m.pickerId} resumed mission ${id}`, "picker", "info");
    });

  const completeItem: WarehouseApi["completeItem"] = (missionId, sku) =>
    update((draft) => {
      const m = missionById(draft, missionId);
      if (!m) return { ok: false, error: "Mission not found." };
      if (m.status === "Completed") return { ok: false, error: "Mission already completed." };
      const item = m.items.find((i) => i.sku === sku);
      if (!item) return { ok: false, error: `Item ${sku} not in mission.` };
      if (item.picked >= item.qty) return { ok: false, error: `All ${sku} units already picked.` };
      item.picked += 1;
      const total = m.items.reduce((s, i) => s + i.qty, 0);
      const done = m.items.reduce((s, i) => s + i.picked, 0);
      m.progress = Math.round((done / total) * 100);
      if (m.status === "Ready") {
        m.status = "Active";
        m.startedAt = nowIso();
        const picker = draft.pickers.find((p) => p.id === m.pickerId);
        if (picker) {
          picker.status = "Active";
          picker.activeMissionId = m.id;
        }
        const o = orderById(draft, m.orderId);
        if (o) o.stage = "Picking";
      }
      if (done >= total) return completeMissionDraft(draft, missionId, m);
      return { ok: true };
    });

  const completeMissionDraft = (
    draft: AppState,
    id: string,
    existing?: AppState["missions"][number],
  ): Result => {
    const m = existing ?? missionById(draft, id);
    if (!m) return { ok: false, error: "Mission not found." };
    const total = m.items.reduce((s, i) => s + i.qty, 0);
    const done = m.items.reduce((s, i) => s + i.picked, 0);
    if (done < total)
      return { ok: false, error: `Cannot complete mission with incomplete items (${done}/${total} picked).` };
    m.status = "Completed";
    m.progress = 100;
    m.completedAt = nowIso();
    const picker = draft.pickers.find((p) => p.id === m.pickerId);
    if (picker) {
      picker.status = "Idle";
      picker.activeMissionId = undefined;
    }
    const o = orderById(draft, m.orderId);
    if (o) {
      o.stage = "Packing";
      o.pickedAt = nowIso();
      o.pickerId = undefined;
      for (const mi of m.items) {
        const it = o.items.find((x) => x.sku === mi.sku);
        if (it) it.picked = mi.picked;
      }
      o.history.push({ at: nowIso(), label: "Picking completed", detail: `${done} items · mission ${m.id}` });
    }
    pushEvent(draft, `MISSION ${m.id} completed · ${done} items → PACKING`, "picker", "success");
    return { ok: true };
  };

  const completeMission: WarehouseApi["completeMission"] = (id) =>
    update((draft) => completeMissionDraft(draft, id));

  const reassignMission: WarehouseApi["reassignMission"] = (id, pickerId) =>
    update((draft) => {
      const m = missionById(draft, id);
      if (!m) return { ok: false, error: "Mission not found." };
      const newPicker = draft.pickers.find((p) => p.id === pickerId);
      if (!newPicker) return { ok: false, error: "Picker not found." };
      if (newPicker.status !== "Idle") return { ok: false, error: `${newPicker.name} is not available.` };
      const oldPicker = draft.pickers.find((p) => p.id === m.pickerId);
      if (oldPicker) {
        oldPicker.status = "Idle";
        oldPicker.activeMissionId = undefined;
      }
      m.pickerId = pickerId;
      if (m.status === "Active") {
        newPicker.status = "Active";
        newPicker.activeMissionId = m.id;
      }
      const o = orderById(draft, m.orderId);
      if (o) o.pickerId = pickerId;
      pushEvent(draft, `MISSION ${id} reassigned to ${pickerId}`, "picker", "info");
    });

  // ----------------------------------------------------------
  // PACKING / QC
  // ----------------------------------------------------------
  const startPacking: WarehouseApi["startPacking"] = (orderId, stationId) =>
    update((draft) => {
      const o = orderById(draft, orderId);
      if (!o) return { ok: false, error: "Order not found." };
      const st = draft.stations.find((s) => s.id === stationId);
      if (!st) return { ok: false, error: "Station not found." };
      if (st.status !== "Idle") return { ok: false, error: `${st.name} is busy.` };
      if (o.stage !== "Packing") return { ok: false, error: "Order must be in the packing queue." };
      st.status = "Active";
      st.orderId = orderId;
      o.stationId = stationId;
      o.history.push({ at: nowIso(), label: "Packing started", detail: st.name });
      pushEvent(draft, `PACKING started · ${orderId} at ${st.name}`, "order", "info");
    });

  const markPacked: WarehouseApi["markPacked"] = (orderId) =>
    update((draft) => {
      const o = orderById(draft, orderId);
      if (!o) return { ok: false, error: "Order not found." };
      const st = draft.stations.find((s) => s.id === o.stationId);
      if (!st) return { ok: false, error: "Order is not assigned to a packing station." };
      o.stage = "QC";
      o.qcStatus = "Pending";
      o.packedAt = nowIso();
      o.history.push({ at: nowIso(), label: "Packed & sent to QC", detail: "" });
      st.orderId = undefined;
      st.status = "Idle";
      pushEvent(draft, `ORDER ${orderId} packed → QC`, "order", "success");
    });

  const holdPacking: WarehouseApi["holdPacking"] = (orderId) =>
    update((draft) => {
      const o = orderById(draft, orderId);
      if (!o) return { ok: false, error: "Order not found." };
      const st = draft.stations.find((s) => s.id === o.stationId);
      if (st) st.status = "Held";
      o.held = true;
      o.history.push({ at: nowIso(), label: "Packing held", detail: "Stopped by operator" });
      pushEvent(draft, `PACKING held · ${orderId}`, "order", "warn");
    });

  const resumePacking: WarehouseApi["resumePacking"] = (orderId) =>
    update((draft) => {
      const o = orderById(draft, orderId);
      if (!o) return { ok: false, error: "Order not found." };
      const st = draft.stations.find((s) => s.id === o.stationId);
      if (st) st.status = "Active";
      o.held = false;
      o.history.push({ at: nowIso(), label: "Packing resumed", detail: "" });
    });

  const qcPass: WarehouseApi["qcPass"] = (orderId) =>
    update((draft) => {
      const o = orderById(draft, orderId);
      if (!o) return { ok: false, error: "Order not found." };
      if (o.qcStatus === "Passed") return { ok: false, error: "Order already passed QC." };
      o.qcStatus = "Passed";
      o.qcAt = nowIso();
      o.history.push({ at: nowIso(), label: "QC passed", detail: "Quality verified" });
      pushEvent(draft, `ORDER ${orderId} passed QC · ready for dispatch`, "order", "success");
    });

  const qcFail: WarehouseApi["qcFail"] = (orderId, reason) =>
    update((draft) => {
      const o = orderById(draft, orderId);
      if (!o) return { ok: false, error: "Order not found." };
      if (o.qcStatus === "Failed") return { ok: false, error: "Order already failed QC." };
      o.qcStatus = "Failed";
      o.qcAt = nowIso();
      o.history.push({ at: nowIso(), label: "QC failed", detail: reason || "Manual failure" });
      const ex: ExceptionRecord = {
        id: `EX-${draft.counters.exceptionSeq++}`,
        type: "QC Failure",
        severity: "High",
        orderId,
        zone: o.zone,
        createdAt: nowIso(),
        status: "Decision Required",
        cause: reason || "Manual QC failure",
        recommendation: "Re-run QC after correcting reported issues.",
      };
      draft.exceptions.push(ex);
      pushEvent(draft, `EXCEPTION ${ex.id} created · QC failure ${orderId}`, "exception", "danger");
      pushNotification(draft, "Exception", `${ex.id} — QC failure`, `${orderId} failed QC: ${reason || "manual"}.`, `/exceptions?exception=${ex.id}`);
    });

  // ----------------------------------------------------------
  // DISPATCH
  // ----------------------------------------------------------
  const createBatch: WarehouseApi["createBatch"] = (orderIds, carrier) =>
    update((draft) => {
      if (orderIds.length === 0) return { ok: false, error: "Select at least one order." };
      for (const id of orderIds) {
        const o = orderById(draft, id);
        if (!o || o.qcStatus !== "Passed")
          return { ok: false, error: `${id} has not passed QC and cannot be batched.` };
      }
      const batch = {
        id: `D-${draft.counters.batchSeq++}`,
        orderIds,
        carrier: carrier.trim() || "SwiftLine Logistics",
        createdAt: nowIso(),
        status: "Planned" as const,
      };
      draft.batches.push(batch);
      pushEvent(draft, `BATCH ${batch.id} created · ${orderIds.length} orders · ${batch.carrier}`, "dispatch", "info");
    });

  const markBatchReady: WarehouseApi["markBatchReady"] = (id) =>
    update((draft) => {
      const b = draft.batches.find((x) => x.id === id);
      if (!b) return { ok: false, error: "Batch not found." };
      b.status = "Ready";
      pushEvent(draft, `BATCH ${id} marked ready for pickup`, "dispatch", "info");
    });

  const dispatchBatch: WarehouseApi["dispatchBatch"] = (id) =>
    update((draft) => {
      const b = draft.batches.find((x) => x.id === id);
      if (!b) return { ok: false, error: "Batch not found." };
      if (b.orderIds.length === 0) return { ok: false, error: "Batch has no orders." };
      for (const orderId of b.orderIds) {
        const o = orderById(draft, orderId);
        if (!o) return { ok: false, error: `${orderId} no longer exists.` };
        if (o.qcStatus !== "Passed") return { ok: false, error: `${orderId} has not passed QC.` };
        for (const it of o.items) {
          const prod = productBySku(draft, it.sku);
          if (prod) {
            prod.reserved -= it.allocated;
            prod.total -= it.allocated;
            it.picked = it.allocated;
          }
        }
        o.stage = "Dispatched";
        o.dispatchedAt = nowIso();
        o.history.push({ at: nowIso(), label: "Dispatched", detail: `Batch ${b.id} · ${b.carrier}` });
      }
      b.status = "Dispatched";
      b.dispatchedAt = nowIso();
      pushEvent(draft, `DISPATCH BATCH ${b.id} completed · ${b.orderIds.length} orders · ${b.carrier}`, "dispatch", "success");
    });

  // ----------------------------------------------------------
  // EXCEPTIONS
  // ----------------------------------------------------------
  const createException: WarehouseApi["createException"] = (input) =>
    update((draft) => {
      if (!input.cause.trim() || !input.recommendation.trim())
        return { ok: false, error: "Cause and recommendation are required." };
      const ex: ExceptionRecord = {
        id: `EX-${draft.counters.exceptionSeq++}`,
        type: input.type,
        severity: input.severity,
        orderId: input.orderId,
        sku: input.sku,
        zone: input.zone,
        createdAt: nowIso(),
        status: "Detected",
        cause: input.cause,
        recommendation: input.recommendation,
      };
      draft.exceptions.push(ex);
      pushEvent(draft, `EXCEPTION ${ex.id} created · ${input.type}`, "exception", input.severity === "Critical" ? "danger" : "warn");
      pushNotification(draft, "Exception", `${ex.id} — ${input.type}`, input.cause, `/exceptions?exception=${ex.id}`);
    });

  const analyzeException: WarehouseApi["analyzeException"] = (id) =>
    update((draft) => {
      const ex = draft.exceptions.find((x) => x.id === id);
      if (!ex) return { ok: false, error: "Exception not found." };
      if (ex.status === "Resolved") return { ok: false, error: "Exception already resolved." };
      ex.status = "Analyzing";
    });

  const requestDecision: WarehouseApi["requestDecision"] = (id) =>
    update((draft) => {
      const ex = draft.exceptions.find((x) => x.id === id);
      if (!ex) return { ok: false, error: "Exception not found." };
      if (ex.status === "Resolved") return { ok: false, error: "Exception already resolved." };
      ex.status = "Decision Required";
    });

  const startResolution: WarehouseApi["startResolution"] = (id) =>
    update((draft) => {
      const ex = draft.exceptions.find((x) => x.id === id);
      if (!ex) return { ok: false, error: "Exception not found." };
      if (ex.status === "Resolved") return { ok: false, error: "Exception already resolved." };
      ex.status = "In Progress";
    });

  const resolveException: WarehouseApi["resolveException"] = (id, resolution) =>
    update((draft) => {
      const ex = draft.exceptions.find((x) => x.id === id);
      if (!ex) return { ok: false, error: "Exception not found." };
      if (ex.status === "Resolved") return { ok: false, error: "Exception already resolved." };
      ex.status = "Resolved";
      ex.resolution = resolution.trim() || "Resolved by operator.";
      ex.resolvedAt = nowIso();
      if (ex.type === "QC Failure" && ex.orderId) {
        const o = orderById(draft, ex.orderId);
        if (o && o.qcStatus === "Failed") {
          o.qcStatus = "Pending";
          o.history.push({ at: nowIso(), label: "QC re-run queued", detail: `Resolution of ${ex.id}` });
        }
      }
      pushEvent(draft, `EXCEPTION ${id} resolved · ${ex.type}`, "exception", "success");
      pushNotification(draft, "Exception", `${ex.id} resolved`, ex.type, `/exceptions`);
    });

  const createReplacementAllocation: WarehouseApi["createReplacementAllocation"] = (id) =>
    update((draft) => {
      const ex = draft.exceptions.find((x) => x.id === id);
      if (!ex) return { ok: false, error: "Exception not found." };
      if (ex.type !== "Damaged Item" && ex.type !== "Missing Item")
        return { ok: false, error: "Replacement allocation applies to damaged or missing items only." };
      const sku = ex.sku;
      const prod = sku ? productBySku(draft, sku) : undefined;
      if (!prod) return { ok: false, error: "SKU not found." };
      const qty = 1;
      const give = Math.min(qty, prod.available);
      if (give <= 0) return { ok: false, error: `No available stock to reserve for ${sku}.` };
      prod.available -= give;
      prod.reserved += give;
      if (ex.orderId) {
        const o = orderById(draft, ex.orderId);
        const it = o?.items.find((x) => x.sku === sku);
        if (o && it) it.allocated += give;
      }
      ex.status = "Resolved";
      ex.resolution = `Replacement stock reserved: ${give} unit(s) of ${sku}.`;
      ex.resolvedAt = nowIso();
      pushEvent(draft, `REPLACEMENT reserved · ${give} × ${sku} (${ex.id})`, "stock", "success");
    });

  // ----------------------------------------------------------
  // FEED / NOTIFICATIONS / SETTINGS
  // ----------------------------------------------------------
  const markNotificationRead = (id: string) =>
    setState((s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));

  const markAllNotificationsRead = () =>
    setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));

  const clearEvents = () => setState((s) => ({ ...s, events: [] }));

  const togglePaused = () => setState((s) => ({ ...s, paused: !s.paused }));

  const updateSettings: WarehouseApi["updateSettings"] = (patch) =>
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch, notifications: patch.notifications ? { ...s.settings.notifications, ...patch.notifications } : s.settings.notifications } }));

  const resetData = () => {
    const fresh = seedState();
    setState(fresh);
    localStorage.removeItem(STORAGE_KEY);
  };

  // ----------------------------------------------------------
  // SIMULATION TICK — simulated live operations
  // ----------------------------------------------------------
  useEffect(() => {
    if (!state.settings.autoRefresh || state.paused) return;
    const t = setInterval(() => {
      setState((s) => {
        const draft = structuredClone(s);
        if (draft.paused) return s;

        // progress active missions
        const completedIds: string[] = [];
        for (const m of draft.missions) {
          if (m.status === "Active" || m.status === "Delayed") {
            m.elapsedMin += 1;
            if (m.elapsedMin > m.deadlineMin && m.status !== "Delayed") {
              m.status = "Delayed";
              pushEvent(draft, `MISSION ${m.id} delayed · over ${m.deadlineMin} min deadline`, "picker", "warn");
            }
            if (m.progress < 100 && Math.random() < 0.22) {
              m.progress = Math.min(100, m.progress + 3 + Math.floor(Math.random() * 6));
            }
            if (m.progress >= 100) completedIds.push(m.id);
          }
        }
        for (const mid of completedIds) {
          const res = completeMissionDraft(draft, mid);
          if (!res.ok) {
            const m = draft.missions.find((x) => x.id === mid);
            if (m) m.progress = 99;
          }
        }

        // random live event
        if (Math.random() < 0.6) {
          const pool = [
            { text: `PICKER P-0${1 + Math.floor(Math.random() * 4)} scanned bin in zone ${String.fromCharCode(65 + Math.floor(Math.random() * 7))}`, kind: "picker", level: "info" },
            { text: `ORDER ${randomOrderId(draft)} progressed through fulfillment`, kind: "order", level: "info" },
            { text: "SYSTEM heartbeat · all zones reporting", kind: "system", level: "info" },
            { text: `PACKING station PK-${1 + Math.floor(Math.random() * 3)} completed a carton`, kind: "system", level: "info" },
          ] as const;
          const ev = pool[Math.floor(Math.random() * pool.length)];
          pushEvent(draft, ev.text, ev.kind, ev.level);
        }
        reconcile(draft);
        return draft;
      });
    }, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.autoRefresh, state.paused]);

  const randomOrderId = (draft: AppState) => {
    const list = draft.orders.filter((o) => o.stage !== "Dispatched");
    return list[Math.floor(Math.random() * list.length)]?.id ?? "NXS-0000";
  };

  // ----------------------------------------------------------
  // SIMULATOR
  // ----------------------------------------------------------
  const applyScenarioToDraft = (draft: AppState, sc: Scenario) => {
    const prod = sc.sku ? productBySku(draft, sc.sku) : undefined;
    if (prod && sc.skuTarget !== undefined) {
      const delta = prod.available - sc.skuTarget;
      prod.available = sc.skuTarget;
      prod.total = prod.available + prod.reserved + prod.damaged;
      if (delta > 0) pushEvent(draft, `SCENARIO · ${sc.sku} reduced to ${sc.skuTarget} units`, "stock", "warn");
    }
    if (sc.disabledPicker) {
      const picker = draft.pickers.find((p) => p.id === sc.disabledPicker);
      if (picker) {
        picker.status = "Offline";
        if (picker.activeMissionId) {
          const m = draft.missions.find((x) => x.id === picker.activeMissionId);
          if (m) m.status = "Paused";
          picker.activeMissionId = undefined;
        }
      }
    }
    if (sc.packingDelayFactor) {
      for (const st of draft.stations) st.avgTimeMin = Math.round(st.avgTimeMin * sc.packingDelayFactor * 10) / 10;
    }
    if (sc.delayedIncomingSkus) {
      for (const sku of sc.delayedIncomingSkus) {
        const p2 = productBySku(draft, sku);
        if (p2) {
          p2.incoming = 0;
          pushEvent(draft, `SCENARIO · incoming delayed for ${sku}`, "stock", "warn");
        }
      }
    }
    const makeOrders = (n: number, urgent: boolean) => {
      for (let i = 0; i < n; i++) {
        const skuPool = draft.products.filter((p) => p.available > 0);
        if (skuPool.length === 0) break;
        const sku = skuPool[Math.floor(Math.random() * skuPool.length)].sku;
        const id = `NXS-${draft.counters.orderSeq++}`;
        const qty = 1 + Math.floor(Math.random() * 4);
        const now = Date.now();
        const order: Order = {
          id,
          customer: urgent ? "SIM Urgent Client" : "SIM Demand Spike",
          tier: urgent ? "Premium" : "Standard",
          items: [{ sku, qty, allocated: 0, picked: 0, packed: 0 }],
          totalQty: qty,
          value: (productBySku(draft, sku)?.price ?? 20) * qty,
          createdAt: iso(now),
          promisedAt: iso(now + (urgent ? 4 : 14) * HOUR),
          priority: 0,
          priorityReasons: [],
          risk: 0,
          stage: "Created",
          allocationStatus: "None",
          zone: productBySku(draft, sku)?.zone ?? "A",
          history: [{ at: iso(now), label: "Order created", detail: "Simulator demand spike" }],
          createdSource: "simulator",
        };
        draft.orders.push(order);
      }
    };
    if (sc.urgentOrders) makeOrders(sc.urgentOrders, true);
    if (sc.demandSpikeOrders) makeOrders(sc.demandSpikeOrders, false);
    // recompute everything
    for (const o of draft.orders) {
      const pr = computePriority(o, draft.products);
      o.priority = pr.score;
      o.priorityReasons = pr.reasons;
      o.risk = computeRisk(o, draft.products);
    }
  };

  const buildRecommendation = (sc: Scenario, before: ReturnType<typeof snapshot>, after: ReturnType<typeof snapshot>): string => {
    const parts: string[] = [];
    if (sc.disabledPicker) {
      const idle = state.pickers.find((p) => p.status === "Idle" && p.id !== sc.disabledPicker);
      parts.push(
        idle
          ? `Reassign ${idle.name} (${idle.id}) to cover missions left by ${sc.disabledPicker}.`
          : "Approve the pending picking decision or shift picking to the packing team.",
      );
    }
    if (sc.packingDelayFactor && sc.packingDelayFactor > 1) {
      parts.push("Move available staff to packing stations to absorb the delay (approve the bottleneck decision).");
    }
    if (sc.skuTarget !== undefined) {
      parts.push(`Create a resupply mission for ${sc.sku} and approve the stock-conflict decision.`);
    }
    if (sc.delayedIncomingSkus?.length) {
      parts.push(`Source alternate supplier for ${sc.delayedIncomingSkus.join(", ")} to restore inbound pipeline.`);
    }
    if (sc.urgentOrders || sc.demandSpikeOrders) {
      parts.push("Add temporary picking capacity and batch dispatch to absorb the demand spike.");
    }
    if (parts.length === 0) parts.push("No corrective action required — operations within normal bounds.");
    return parts.join(" ");
  };

  const runScenario: WarehouseApi["runScenario"] = (scenario) => {
    const draft: AppState = structuredClone(stateRef.current);
    const before = snapshot(draft);
    applyScenarioToDraft(draft, scenario);
    reconcile(draft);
    const after = snapshot(draft);
    const impact: SimulationReport["impact"] = [
      { label: "Fulfillment rate", before: `${before.fulfillmentRate}%`, after: `${after.fulfillmentRate}%`, delta: `${after.fulfillmentRate - before.fulfillmentRate >= 0 ? "+" : ""}${after.fulfillmentRate - before.fulfillmentRate}%`, kind: after.fulfillmentRate >= before.fulfillmentRate ? "good" : "bad" },
      { label: "Orders at risk", before: `${before.ordersAtRisk}`, after: `${after.ordersAtRisk}`, delta: `${after.ordersAtRisk - before.ordersAtRisk >= 0 ? "+" : ""}${after.ordersAtRisk - before.ordersAtRisk}`, kind: after.ordersAtRisk <= before.ordersAtRisk ? "good" : "bad" },
      { label: "Open exceptions", before: `${before.openExceptions}`, after: `${after.openExceptions}`, delta: `${after.openExceptions - before.openExceptions >= 0 ? "+" : ""}${after.openExceptions - before.openExceptions}`, kind: after.openExceptions <= before.openExceptions ? "good" : "bad" },
      { label: "Pending decisions", before: `${before.pendingDecisions}`, after: `${after.pendingDecisions}`, delta: `${after.pendingDecisions - before.pendingDecisions >= 0 ? "+" : ""}${after.pendingDecisions - before.pendingDecisions}`, kind: after.pendingDecisions <= before.pendingDecisions ? "good" : "bad" },
      { label: "Inventory health", before: `${before.inventoryHealth}%`, after: `${after.inventoryHealth}%`, delta: `${after.inventoryHealth - before.inventoryHealth >= 0 ? "+" : ""}${after.inventoryHealth - before.inventoryHealth}%`, kind: after.inventoryHealth >= before.inventoryHealth ? "good" : "bad" },
      { label: "Active pickers", before: `${before.pickingCapacity}`, after: `${after.pickingCapacity}`, delta: `${after.pickingCapacity - before.pickingCapacity >= 0 ? "+" : ""}${after.pickingCapacity - before.pickingCapacity}`, kind: "neutral" },
      { label: "Bottleneck impact", before: before.bottleneck ? `+${before.bottleneck.impactMin} min (${before.bottleneck.stage})` : "none", after: after.bottleneck ? `+${after.bottleneck.impactMin} min (${after.bottleneck.stage})` : "none", delta: "", kind: "neutral" },
    ];
    const report: SimulationReport = {
      id: `SIM-${Date.now()}`,
      at: nowIso(),
      scenario,
      before,
      after,
      impact,
      recommendation: buildRecommendation(scenario, before, after),
      applied: false,
    };
    return report;
  };

  const applyScenario: WarehouseApi["applyScenario"] = (scenario) => {
    const report = runScenario(scenario);
    const draft: AppState = structuredClone(stateRef.current);
    applyScenarioToDraft(draft, scenario);
    reconcile(draft);
    draft.reports = [{ ...report, applied: true, at: nowIso() }, ...draft.reports].slice(0, 20);
    setState(draft);
    return { ...report, applied: true };
  };

  // ----------------------------------------------------------
  // DEMO MODE — guided 12-step scenario
  // ----------------------------------------------------------
  const demoStep: WarehouseApi["demoStep"] = (step) => {
    const draft: AppState = structuredClone(stateRef.current);
    const run = (): Result => {
      switch (step) {
        case 1:
          return { ok: true }; // normal ops — no-op
        case 2: {
          const p2 = productBySku(draft, "SKU-204");
          if (!p2) return { ok: false, error: "SKU-204 missing." };
          p2.available = 4;
          p2.total = p2.available + p2.reserved + p2.damaged;
          pushEvent(draft, "DEMO · Stock shortage occurs · SKU-204 down to 4 units", "stock", "danger");
          return { ok: true };
        }
        case 3: {
          const key = "conflict:SKU-204";
          if (!draft.decisions.some((d) => d.refKey === key && d.status === "Pending")) {
            const c = findConflicts(draft).find((x) => x.sku === "SKU-204");
            if (c) {
              const d = recommendAllocation(draft, c);
              d.refKey = key;
              d.id = `DC-${draft.counters.decisionSeq++}`;
              draft.decisions.push(d);
            }
          }
          pushEvent(draft, "DEMO · System detects allocation conflict on SKU-204", "decision", "warn");
          return { ok: true };
        }
        case 4:
          for (const o of draft.orders) {
            const pr = computePriority(o, draft.products);
            o.priority = pr.score;
            o.priorityReasons = pr.reasons;
          }
          pushEvent(draft, "DEMO · Priority engine recalculated all live orders", "system", "info");
          return { ok: true };
        case 5: {
          const d = draft.decisions.find((x) => x.refKey === "conflict:SKU-204" && x.status === "Pending");
          if (d) pushEvent(draft, `DEMO · Allocation engine recommends: ${d.recommendation}`, "decision", "info");
          return d ? { ok: true } : { ok: false, error: "No pending SKU-204 decision." };
        }
        case 6: {
          const d = draft.decisions.find((x) => x.refKey === "conflict:SKU-204" && x.status === "Pending");
          if (!d) return { ok: false, error: "Decision not found." };
          const res = applyDecision(draft, d);
          if (!res.ok) return res;
          d.status = "Approved";
          d.resolvedAt = nowIso();
          return { ok: true };
        }
        case 7: {
          const p2 = productBySku(draft, "SKU-204");
          pushEvent(draft, `DEMO · Inventory updated · SKU-204 available ${p2?.available ?? 0}, reserved ${p2?.reserved ?? 0}`, "stock", "info");
          return { ok: true };
        }
        case 8: {
          const o = orderById(draft, "NXS-1042");
          if (o) {
            o.allocationStatus = o.items.every((i) => i.allocated >= i.qty) ? "Full" : "Partial";
            o.stage = "Allocated";
            if (!o.missionId) createMissionForOrder(draft, o);
            o.history.push({ at: nowIso(), label: "Partially allocated", detail: "Awaiting remaining stock" });
          }
          pushEvent(draft, "DEMO · NXS-1042 partially allocated · awaiting restock", "order", "info");
          return { ok: true };
        }
        case 9: {
          const p2 = productBySku(draft, "SKU-204");
          const key = "reorder:SKU-204";
          if (p2 && !draft.decisions.some((d) => d.refKey === key && d.status === "Pending")) {
            const rec = reorderRecommendation(p2);
            if (rec) {
              rec.refKey = key;
              rec.id = `DC-${draft.counters.decisionSeq++}`;
              draft.decisions.push(rec);
            }
          }
          pushEvent(draft, "DEMO · Reorder recommendation appeared for SKU-204", "stock", "warn");
          return { ok: true };
        }
        case 10: {
          const key = "bottleneck:packing";
          if (!draft.decisions.some((d) => d.refKey === key && d.status === "Pending")) {
            const b = detectBottlenecks(draft)[0];
            if (b) {
              draft.decisions.push({
                id: `DC-${draft.counters.decisionSeq++}`,
                kind: "Bottleneck",
                title: `${b.stage} bottleneck — queue ${b.queue} orders`,
                problem: `${b.stage} queued ${b.queue} orders.`,
                data: [`Queue: ${b.queue}`, `Avg: ${b.avgMin} min`, `Impact: +${b.impactMin} min`],
                options: ["Move staff", "Accept delay", "Overtime"],
                recommendation: "Move staff to packing.",
                reasoning: "Delay propagates downstream.",
                impact: "Queue drops by ~3 orders within the hour.",
                risk: "Low",
                status: "Pending",
                action: "move-staff",
                params: { fromStage: "QC", station: "PK-2" },
                refKey: key,
                createdAt: nowIso(),
              });
            }
          }
          pushEvent(draft, "DEMO · Packing bottleneck appeared · queue growing", "system", "warn");
          return { ok: true };
        }
        case 11: {
          const d = draft.decisions.find((x) => x.refKey === "bottleneck:packing" && x.status === "Pending");
          if (d) pushEvent(draft, `DEMO · Recommended action: ${d.recommendation}`, "system", "info");
          return d ? { ok: true } : { ok: false, error: "No bottleneck decision." };
        }
        case 12: {
          const ex = draft.exceptions.find((x) => x.id === "EX-004");
          if (ex && ex.status !== "Resolved") {
            ex.status = "Resolved";
            ex.resolution = "Supplier expedited — 40 units inbound.";
            ex.resolvedAt = nowIso();
          }
          pushEvent(draft, "DEMO · Exception EX-004 resolved · scenario complete", "exception", "success");
          return { ok: true };
        }
        default:
          return { ok: false, error: "Unknown step." };
      }
    };
    const res = run();
    if (res.ok) {
      reconcile(draft);
      setState(draft);
      return { ok: true, message: "" };
    }
    return { ok: false, message: res.error };
  };

  // ----------------------------------------------------------
  const api = useMemo<WarehouseApi>(
    () => ({
      state,
      createOrder,
      updateOrder,
      prioritizeOrder,
      allocateOrder,
      releaseAllocation,
      holdOrder,
      unholdOrder,
      cancelOrder,
      dispatchOrder,
      approveDecision,
      rejectDecision,
      updateDecision,
      editStock,
      reserveStock,
      releaseStock,
      markDamaged,
      restock,
      createReorder,
      receiveIncoming,
      startMission,
      pauseMission,
      resumeMission,
      completeItem,
      completeMission,
      reassignMission,
      startPacking,
      markPacked,
      holdPacking,
      resumePacking,
      qcPass,
      qcFail,
      createBatch,
      markBatchReady,
      dispatchBatch,
      createException,
      analyzeException,
      requestDecision,
      startResolution,
      resolveException,
      createReplacementAllocation,
      markNotificationRead,
      markAllNotificationsRead,
      clearEvents,
      togglePaused,
      updateSettings,
      resetData,
      runScenario,
      applyScenario,
      demoStep,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  );

  return <WarehouseContext.Provider value={api}>{children}</WarehouseContext.Provider>;
}

export function useWarehouse(): WarehouseApi {
  const ctx = useContext(WarehouseContext);
  if (!ctx) throw new Error("useWarehouse must be used within WarehouseProvider");
  return ctx;
}
