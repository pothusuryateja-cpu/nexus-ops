// ============================================================
// NEXUS WMS — domain types
// ============================================================

export type Tier = "Premium" | "Enterprise" | "Standard";
export type Category =
  | "Electronics"
  | "Accessories"
  | "Apparel"
  | "Home"
  | "Grocery"
  | "Fragile";
export type StockStatus = "Healthy" | "Low" | "Critical" | "Out of Stock";

export interface Product {
  sku: string;
  name: string;
  category: Category;
  zone: string; // Zone letter: A..H
  location: string; // aisle/bin code
  total: number; // physical on hand (available + reserved + damaged)
  available: number; // free, sellable
  reserved: number; // committed to orders
  damaged: number;
  incoming: number; // on order / in transit
  reorderPoint: number;
  minOrderQty: number;
  cost: number;
  price: number;
}

export type Stage =
  | "Created"
  | "Prioritized"
  | "Allocated"
  | "Picking"
  | "Packing"
  | "QC"
  | "Dispatched"
  | "Held"
  | "Cancelled";

export type AllocationStatus = "None" | "Partial" | "Full" | "Released";
export type QcStatus = "Pending" | "Passed" | "Failed";

export interface OrderItem {
  sku: string;
  qty: number; // requested
  allocated: number; // committed to this order
  picked: number;
  packed: number;
}

export interface TimelineEntry {
  at: string; // ISO
  label: string;
  detail?: string;
}

export interface Order {
  id: string; // NXS-1042
  customer: string;
  tier: Tier;
  items: OrderItem[];
  totalQty: number;
  value: number;
  createdAt: string;
  promisedAt: string;
  priority: number; // 0-100 (engine computed)
  priorityReasons: { label: string; points: number }[];
  risk: number; // 0-100 (engine computed)
  stage: Stage;
  allocationStatus: AllocationStatus;
  zone: string; // primary zone
  pickerId?: string;
  missionId?: string;
  stationId?: string;
  qcStatus?: QcStatus;
  held?: boolean;
  history: TimelineEntry[];
  // timestamps
  allocatedAt?: string;
  pickedAt?: string;
  packedAt?: string;
  qcAt?: string;
  dispatchedAt?: string;
  createdSource?: "seed" | "simulator" | "manual";
}

export interface Picker {
  id: string; // P-01
  name: string;
  status: "Idle" | "Active" | "Paused" | "Offline";
  efficiency: number; // %
  zone: string; // current zone
  activeMissionId?: string;
}

export interface MissionItem {
  sku: string;
  qty: number;
  picked: number;
  bin: string;
}

export interface Mission {
  id: string; // PX-104
  orderId: string;
  pickerId: string;
  items: MissionItem[];
  zones: string[];
  route: { normalM: number; optimizedM: number; savedM: number; savedMin: number };
  status: "Ready" | "Active" | "Paused" | "Delayed" | "Completed";
  progress: number; // 0-100
  deadlineMin: number;
  elapsedMin: number;
  startedAt?: string;
  completedAt?: string;
}

export interface Station {
  id: string; // PK-1
  name: string;
  status: "Idle" | "Active" | "Held";
  orderId?: string;
  avgTimeMin: number;
}

export type ExceptionType =
  | "Damaged Item"
  | "Missing Item"
  | "Low Stock"
  | "Out of Stock"
  | "Delayed Order"
  | "Picking Delay"
  | "QC Failure"
  | "Misallocation";

export type Severity = "Low" | "Medium" | "High" | "Critical";

export interface ExceptionRecord {
  id: string; // EX-008
  type: ExceptionType;
  severity: Severity;
  orderId?: string;
  sku?: string;
  zone?: string;
  createdAt: string;
  cause: string;
  recommendation: string;
  status:
    | "Detected"
    | "Analyzing"
    | "Decision Required"
    | "In Progress"
    | "Resolved";
  resolution?: string;
  resolvedAt?: string;
}

export type DecisionKind =
  | "Stock Conflict"
  | "At-Risk Order"
  | "Replenishment"
  | "Bottleneck"
  | "Allocation";

export interface Decision {
  id: string; // DC-101
  kind: DecisionKind;
  title: string;
  problem: string;
  data: string[];
  options: string[];
  recommendation: string;
  reasoning: string;
  impact: string;
  risk: string;
  status: "Pending" | "Approved" | "Rejected" | "Modified";
  action: "allocate" | "reorder" | "reassign" | "expedite" | "move-staff" | "hold";
  params?: {
    sku?: string;
    orderId?: string;
    qty?: number;
    fromOrderId?: string;
    pickerId?: string;
    toPickerId?: string;
    station?: string;
    fromStage?: string;
  };
  refKey?: string; // dedupe key, e.g. sku / order / bottleneck id
  createdAt: string;
  resolvedAt?: string;
}

export interface Zone {
  id: string; // "A"
  name: string;
  capacity: number; // order-slots
}

export type NotificationType =
  | "Critical Stock"
  | "Order Delay"
  | "Allocation Conflict"
  | "Exception"
  | "Bottleneck"
  | "Reorder";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  navigateTo?: string;
}

export interface Batch {
  id: string; // D-41
  orderIds: string[];
  carrier: string;
  createdAt: string;
  status: "Planned" | "Ready" | "Dispatched";
  dispatchedAt?: string;
}

export type ActivityLevel = "info" | "warn" | "danger" | "success";

export interface ActivityEvent {
  id: string;
  at: string;
  kind: "order" | "picker" | "stock" | "exception" | "dispatch" | "system" | "decision";
  text: string;
  level: ActivityLevel;
}

export interface Settings {
  theme: "studio" | "ink";
  animation: "full" | "reduced" | "off";
  notifications: {
    criticalStock: boolean;
    orderDelay: boolean;
    allocationConflict: boolean;
    exception: boolean;
    bottleneck: boolean;
    reorder: boolean;
  };
  warehouse: string;
  autoRefresh: boolean;
  demoMode: boolean;
  sound: boolean;
}

export interface SimulationReport {
  id: string;
  at: string;
  scenario: Scenario;
  before: MetricSnapshot;
  after: MetricSnapshot;
  impact: { label: string; before: string; after: string; delta: string; kind: "good" | "bad" | "neutral" }[];
  recommendation: string;
  applied: boolean;
}

export interface MetricSnapshot {
  fulfillmentRate: number;
  ordersAtRisk: number;
  openExceptions: number;
  pendingDecisions: number;
  inventoryHealth: number; // % products healthy
  pickingCapacity: number; // active pickers
  bottleneck?: { stage: string; impactMin: number };
  pickingQueue: number;
  packingQueue: number;
  qcQueue: number;
  dispatchQueue: number;
}

export interface Scenario {
  sku?: string;
  skuTarget?: number;
  urgentOrders?: number;
  disabledPicker?: string;
  packingDelayFactor?: number;
  delayedIncomingSkus?: string[];
  demandSpikeOrders?: number;
  label?: string;
}

export interface Counters {
  orderSeq: number;
  missionSeq: number;
  exceptionSeq: number;
  decisionSeq: number;
  batchSeq: number;
  eventSeq: number;
  notifSeq: number;
  historySeq: number;
}

export interface AppState {
  version: number;
  products: Product[];
  orders: Order[];
  pickers: Picker[];
  missions: Mission[];
  stations: Station[];
  exceptions: ExceptionRecord[];
  decisions: Decision[];
  zones: Zone[];
  notifications: AppNotification[];
  events: ActivityEvent[];
  batches: Batch[];
  settings: Settings;
  counters: Counters;
  paused: boolean; // activity simulation paused
  reports: SimulationReport[]; // simulation history
}
