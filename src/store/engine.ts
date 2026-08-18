// ============================================================
// NEXUS WMS — decision engines
// Pure functions: priority, risk, allocation, reorder, bottleneck
// ============================================================
import type {
  AppState,
  Decision,
  MetricSnapshot,
  Order,
  Product,
} from "./types";

export const HOUR = 3_600_000;
export const MIN = 60_000;
export const DAY = 86_400_000;

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtAgo(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  return `${Math.floor(diff / DAY)}d ago`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)} · ${fmtTime(iso)}`;
}

export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function stockStatus(p: Product): "Healthy" | "Low" | "Critical" | "Out of Stock" {
  if (p.available <= 0 && p.reserved === 0) return "Out of Stock";
  if (p.available <= 0) return "Out of Stock";
  if (p.available <= p.reorderPoint * 0.5) return "Critical";
  if (p.available <= p.reorderPoint) return "Low";
  return "Healthy";
}

// ------------------------------------------------------------
// PRIORITY ENGINE  (score 0-100, explained)
// ------------------------------------------------------------
export function computePriority(
  order: Order,
  products: Product[],
  now: number = Date.now(),
): { score: number; reasons: { label: string; points: number }[] } {
  if (order.stage === "Cancelled" || order.stage === "Dispatched" || order.held) {
    return { score: 0, reasons: [] };
  }
  const reasons: { label: string; points: number }[] = [];
  let score = 0;

  // 1. Delivery deadline approaching — up to +30
  const hoursLeft = (new Date(order.promisedAt).getTime() - now) / HOUR;
  if (hoursLeft < 24) {
    const pts = Math.max(0, Math.round(30 * Math.min(1, (24 - hoursLeft) / 22)));
    if (pts > 0) {
      reasons.push({
        label:
          hoursLeft < 0
            ? `Delivery deadline passed (${Math.abs(Math.round(hoursLeft))}h overdue)`
            : `Delivery deadline in ${Math.max(1, Math.round(hoursLeft))}h`,
        points: pts,
      });
      score += pts;
    }
  }

  // 2. Customer tier — +20 / +15 / +5
  const tierPts = order.tier === "Premium" ? 20 : order.tier === "Enterprise" ? 15 : 5;
  reasons.push({ label: `${order.tier} customer`, points: tierPts });
  score += tierPts;

  // 3. Order age — up to +17
  const ageHours = (now - new Date(order.createdAt).getTime()) / HOUR;
  const agePts = Math.round(Math.min(17, (ageHours / 72) * 17));
  if (agePts > 0) {
    reasons.push({ label: `Order age ${Math.round(ageHours)}h`, points: agePts });
    score += agePts;
  }

  // 4. Delay / fulfillment risk — up to +25
  let riskPts = 0;
  if (order.allocationStatus === "None" && order.stage === "Prioritized") riskPts += 8;
  if (order.allocationStatus === "Partial") riskPts += 6;
  for (const it of order.items) {
    const p = products.find((x) => x.sku === it.sku);
    if (p && p.available < it.qty - it.allocated) riskPts += 3;
  }
  if (order.stage === "Picking" && order.missionId) {
    const ms = order.missionId;
    if (ms) {
      riskPts += 4;
    }
  }
  if (order.qcStatus === "Failed") riskPts += 6;
  const capped = Math.min(25, riskPts);
  if (capped > 0) {
    reasons.push({ label: "Fulfillment delay risk", points: capped });
    score += capped;
  }

  return { score: Math.min(100, score), reasons };
}

// ------------------------------------------------------------
// RISK SCORE 0-100
// ------------------------------------------------------------
export function computeRisk(
  order: Order,
  products: Product[],
  now: number = Date.now(),
): number {
  if (order.stage === "Dispatched" || order.stage === "Cancelled") return 0;
  let risk = 0;
  const hoursLeft = (new Date(order.promisedAt).getTime() - now) / HOUR;
  if (hoursLeft < 24) {
    risk += Math.max(0, Math.round(38 * Math.min(1, (24 - hoursLeft) / 24)));
  }
  if (order.allocationStatus === "None") risk += 22;
  if (order.allocationStatus === "Partial") risk += 14;
  for (const it of order.items) {
    const p = products.find((x) => x.sku === it.sku);
    if (p) {
      const short = it.qty - it.allocated - Math.max(0, p.available);
      if (short > 0) risk += Math.min(18, short * 6);
    }
  }
  if (order.stage === "Picking" && order.missionId) risk += 10;
  if (order.qcStatus === "Failed") risk += 15;
  if (order.held) risk += 10;
  return Math.min(100, Math.round(risk));
}

// ------------------------------------------------------------
// ALLOCATION ENGINE — resolves a stock conflict
// ------------------------------------------------------------
export interface Conflict {
  sku: string;
  available: number;
  demand: number;
  orders: { orderId: string; qty: number; priority: number; deadline: string }[];
}

export function findConflicts(state: AppState): Conflict[] {
  const active = state.orders.filter(
    (o) => o.stage !== "Dispatched" && o.stage !== "Cancelled" && !o.held,
  );
  const bySku = new Map<string, { orderId: string; qty: number; priority: number; deadline: string }[]>();
  for (const o of active) {
    for (const it of o.items) {
      const need = it.qty - it.allocated;
      if (need <= 0) continue;
      const list = bySku.get(it.sku) ?? [];
      list.push({ orderId: o.id, qty: need, priority: o.priority, deadline: o.promisedAt });
      bySku.set(it.sku, list);
    }
  }
  const conflicts: Conflict[] = [];
  for (const [sku, orders] of bySku) {
    const p = state.products.find((x) => x.sku === sku);
    if (!p) continue;
    const demand = orders.reduce((s, o) => s + o.qty, 0);
    if (p.available >= demand) continue;
    conflicts.push({
      sku,
      available: p.available,
      demand,
      orders: [...orders].sort((a, b) => b.priority - a.priority),
    });
  }
  return conflicts.sort((a, b) => (b.orders[0]?.priority ?? 0) - (a.orders[0]?.priority ?? 0));
}

export function recommendAllocation(state: AppState, conflict: Conflict): Decision {
  const p = state.products.find((x) => x.sku === conflict.sku)!;
  const top = conflict.orders[0];
  const second = conflict.orders[1];
  const now = Date.now();
  const incoming = p.incoming;
  const topOrder = state.orders.find((o) => o.id === top.orderId);

  const deadlineHours = topOrder
    ? (new Date(topOrder.promisedAt).getTime() - now) / HOUR
    : 24;
  const isUrgent = top.priority >= 72 || deadlineHours < 6;

  const options = [
    `Allocate all ${conflict.available} units of ${conflict.sku} to ${top.orderId} (priority ${top.priority})`,
    `Split ${conflict.available} units between ${top.orderId} and ${second ? second.orderId : "next order"}`,
    `Hold stock and wait for incoming replenishment (${incoming} units in transit)`,
    `Release ${conflict.sku} reservations from lower-priority orders to free stock`,
  ];

  let chosen = 0;
  let recommendation = options[0];
  let reasoning = "";
  let impact = "";
  let action: Decision["action"] = "allocate";
  let params: Decision["params"] = {
    sku: conflict.sku,
    orderId: top.orderId,
    qty: conflict.available,
  };

  if (incoming > 0 && !isUrgent && top.priority < 75) {
    chosen = 2;
    recommendation = options[2];
    reasoning = `${incoming} units of ${conflict.sku} are already in transit and the highest-priority demand (${top.orderId}, priority ${top.priority}) can wait. Holding avoids breaking allocation integrity.`;
    impact = `All ${conflict.demand} units fulfilled once replenishment lands. Zero partial shipments.`;
    action = "hold";
    params = { sku: conflict.sku, qty: 0 };
  } else if (isUrgent && top.priority >= 80 && conflict.available >= top.qty) {
    chosen = 0;
    recommendation = options[0];
    reasoning = `${top.orderId} has the highest urgency (priority ${top.priority}) and the shortest delivery deadline. Full allocation maximizes on-time fulfillment for the most critical commitment.`;
    impact = `Urgent order ${top.orderId} becomes fully allocated (${top.qty} units).`;
    params = { sku: conflict.sku, orderId: top.orderId, qty: conflict.available };
  } else if (isUrgent && conflict.available >= top.qty * 0.5) {
    chosen = 1;
    recommendation = options[1];
    reasoning = `${conflict.available} units cover a large share of the urgent order but not all demand. Splitting keeps the urgent order moving while serving the next-highest priority.`;
    impact = `${top.orderId} partially fulfilled; ${second ? second.orderId : "secondary orders"} receive the remainder. Replenishment will close the gap.`;
    params = { sku: conflict.sku, orderId: top.orderId, qty: conflict.available };
  } else {
    chosen = 1;
    recommendation = options[1];
    reasoning = `Available stock (${conflict.available}) is below urgent demand. Split allocation preserves partial progress on the highest-priority order and distributes remaining units fairly.`;
    impact = `Partial allocation across ${conflict.orders.length} order(s); reorder recommendation triggered for ${conflict.sku}.`;
    params = { sku: conflict.sku, orderId: top.orderId, qty: conflict.available };
  }

  const decision: Decision = {
    id: `DC-${Math.floor(100 + Math.random() * 899)}`,
    kind: "Stock Conflict",
    title: `${conflict.sku} — demand exceeds available stock`,
    problem: `${conflict.sku} has ${conflict.available} units available but ${conflict.demand} units demanded across ${conflict.orders.length} order(s).`,
    data: [
      `Available: ${conflict.available} units`,
      `Demand: ${conflict.demand} units`,
      `Top demand: ${top.orderId} (priority ${top.priority}, ${top.qty} units)`,
      `Incoming: ${incoming} units`,
      `Reorder point: ${p.reorderPoint}`,
    ],
    options,
    recommendation,
    reasoning,
    impact,
    risk: isUrgent ? "Low — urgent order protected" : "Medium — partial fulfillment may upset downstream deadlines",
    status: "Pending",
    action,
    params,
    refKey: `conflict:${conflict.sku}`,
    createdAt: new Date(now).toISOString(),
  };
  return decision;
}

// ------------------------------------------------------------
// REORDER ENGINE
// ------------------------------------------------------------
export function reorderRecommendation(p: Product): Decision | null {
  const status = stockStatus(p);
  if (status === "Healthy" || status === "Out of Stock" && p.available > 0) return null;
  if (p.available > p.reorderPoint) return null;
  const gap = p.reorderPoint * 2 - p.available;
  const qty = Math.max(p.minOrderQty, Math.ceil(gap / p.minOrderQty) * p.minOrderQty);
  const ratio = p.available / Math.max(1, p.reorderPoint);
  const urgency = ratio < 0.35 ? "HIGH" : ratio < 0.7 ? "MEDIUM" : "LOW";
  const weeks = p.incoming > 0 ? 0 : 1;
  return {
    id: `DC-${Math.floor(100 + Math.random() * 899)}`,
    kind: "Replenishment",
    title: `Restock ${p.sku} — available ${p.available} vs reorder point ${p.reorderPoint}`,
    problem: `${p.sku} available stock (${p.available}) has fallen to or below its reorder point (${p.reorderPoint}).`,
    data: [
      `Available: ${p.available} units`,
      `Reorder point: ${p.reorderPoint}`,
      `Incoming: ${p.incoming} units`,
      `Damaged: ${p.damaged} units`,
      `Demand pressure: ${weeks} weeks of expected demand`,
    ],
    options: [
      `Create resupply mission for ${qty} units (${urgency} urgency)`,
      `Expedite existing supplier order`,
      `Reallocate stock from another warehouse`,
    ],
    recommendation: `Create resupply mission for ${qty} units (${urgency} urgency).`,
    reasoning: `At current consumption, ${p.available} units will not cover demand until the next planned replenishment cycle. Ordering ${qty} units restores buffer to ${qty + p.available} (${Math.round(((qty + p.available) / p.reorderPoint) * 100)}% of reorder point).`,
    impact: `Stockout probability drops from ${ratio < 0.35 ? "High" : "Elevated"} to Low within ${weeks + 1} day(s).`,
    risk: urgency === "HIGH" ? "High if delayed — possible stockout" : "Low",
    status: "Pending",
    action: "reorder",
    params: { sku: p.sku, qty },
    refKey: `reorder:${p.sku}`,
    createdAt: new Date().toISOString(),
  };
}

// ------------------------------------------------------------
// BOTTLENECK DETECTION
// ------------------------------------------------------------
export interface BottleneckReport {
  stage: "Picking" | "Packing" | "QC" | "Dispatch";
  queue: number;
  avgMin: number;
  normalMin: number;
  delayRate: number; // 0-100
  impactMin: number;
}

const NORMAL_MIN: Record<string, number> = {
  Picking: 4.2,
  Packing: 6.8,
  QC: 3.1,
  Dispatch: 2.4,
};

export function detectBottlenecks(state: AppState): BottleneckReport[] {
  const orders = state.orders;
  const reports: BottleneckReport[] = [];

  // PICKING: queued = Allocated (not yet picked); in-flight = Picking
  const pickingQueue = orders.filter((o) => o.stage === "Allocated").length;
  const missions = state.missions;
  const delayedMissions = missions.filter((m) => m.status === "Delayed").length;
  const activeMissions = missions.filter((m) => m.status === "Active" || m.status === "Paused").length;
  const avgPick = missions.length
    ? missions.reduce((s, m) => s + m.elapsedMin, 0) / Math.max(1, activeMissions + delayedMissions)
    : 4.2;
  reports.push({
    stage: "Picking",
    queue: pickingQueue,
    avgMin: Math.round(avgPick * 10) / 10,
    normalMin: NORMAL_MIN.Picking,
    delayRate: missions.length ? Math.round((delayedMissions / missions.length) * 100) : 0,
    impactMin: Math.max(0, Math.round((avgPick - NORMAL_MIN.Picking) * pickingQueue)),
  });

  // PACKING: queued = stage Packing without station; processing = on station
  const packingQueue = orders.filter((o) => o.stage === "Packing" && !o.stationId).length;
  const packingOrders = orders.filter((o) => o.stage === "Packing");
  const avgPack = packingOrders.length
    ? packingOrders.reduce((s, o) => s + (state.stations.find((st) => st.id === o.stationId)?.avgTimeMin ?? 6.8), 0) /
      packingOrders.length
    : 6.8;
  reports.push({
    stage: "Packing",
    queue: packingQueue + orders.filter((o) => o.stage === "Packing" && !!o.stationId).length,
    avgMin: Math.round(avgPack * 10) / 10,
    normalMin: NORMAL_MIN.Packing,
    delayRate: Math.round((packingOrders.filter((o) => o.held).length / Math.max(1, packingOrders.length)) * 100),
    impactMin: Math.max(0, Math.round((avgPack - NORMAL_MIN.Packing) * packingQueue)),
  });

  // QC: queued = QC pending
  const qcQueue = orders.filter((o) => o.stage === "QC" && o.qcStatus === "Pending").length;
  const qcFailed = orders.filter((o) => o.qcStatus === "Failed").length;
  const qcTotal = orders.filter((o) => o.qcStatus !== undefined).length;
  reports.push({
    stage: "QC",
    queue: qcQueue,
    avgMin: 3.4,
    normalMin: NORMAL_MIN.QC,
    delayRate: qcTotal ? Math.round((qcFailed / qcTotal) * 100) : 0,
    impactMin: Math.round(0.3 * qcQueue),
  });

  // DISPATCH: queued = QC passed, not dispatched
  const dispatchQueue = orders.filter(
    (o) => o.stage === "QC" && o.qcStatus === "Passed" && !o.dispatchedAt,
  ).length;
  reports.push({
    stage: "Dispatch",
    queue: dispatchQueue,
    avgMin: 2.6,
    normalMin: NORMAL_MIN.Dispatch,
    delayRate: 0,
    impactMin: Math.round(0.2 * dispatchQueue),
  });

  return reports.sort((a, b) => b.impactMin - a.impactMin);
}

// ------------------------------------------------------------
// METRIC SNAPSHOT (for simulator before/after)
// ------------------------------------------------------------
export function snapshot(state: AppState): MetricSnapshot {
  const sevenDays = Date.now() - 7 * DAY;
  const recent = state.orders.filter((o) => new Date(o.createdAt).getTime() >= sevenDays);
  const fulfilled = recent.filter((o) => o.dispatchedAt).length;
  const products = state.products;
  const healthy = products.filter((p) => stockStatus(p) === "Healthy").length;
  const bottlenecks = detectBottlenecks(state);
  const top = bottlenecks[0];
  return {
    fulfillmentRate: recent.length ? Math.round((fulfilled / recent.length) * 100) : 0,
    ordersAtRisk: state.orders.filter((o) => o.risk >= 70 && o.stage !== "Dispatched" && o.stage !== "Cancelled").length,
    openExceptions: state.exceptions.filter((e) => e.status !== "Resolved").length,
    pendingDecisions: state.decisions.filter((d) => d.status === "Pending").length,
    inventoryHealth: products.length ? Math.round((healthy / products.length) * 100) : 0,
    pickingCapacity: state.pickers.filter((p) => p.status === "Active").length,
    bottleneck: top ? { stage: top.stage, impactMin: top.impactMin } : undefined,
    pickingQueue: state.orders.filter((o) => o.stage === "Allocated").length,
    packingQueue: state.orders.filter((o) => o.stage === "Packing").length,
    qcQueue: state.orders.filter((o) => o.stage === "QC" && o.qcStatus === "Pending").length,
    dispatchQueue: state.orders.filter((o) => o.stage === "QC" && o.qcStatus === "Passed" && !o.dispatchedAt).length,
  };
}
