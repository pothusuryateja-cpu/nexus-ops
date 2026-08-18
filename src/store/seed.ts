// ============================================================
// NEXUS WMS — mock data seed (internally consistent)
// ============================================================
import type {
  AppState,
  Batch,
  Category,
  Counters,
  Decision,
  ExceptionRecord,
  Mission,
  Order,
  OrderItem,
  Picker,
  Product,
  Station,
  Tier,
  Zone,
} from "./types";
import {
  computePriority,
  computeRisk,
  DAY,
  detectBottlenecks,
  findConflicts,
  HOUR,
  recommendAllocation,
  reorderRecommendation,
  stockStatus,
} from "./engine";

// deterministic PRNG
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260818);

const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

// ------------------------------------------------------------
// PRODUCTS
// [sku, name, category, zone, total, damaged, incoming, reorderPoint, minOrder, cost, price]
// ------------------------------------------------------------
type ProductRow = [string, string, Category, string, number, number, number, number, number, number, number];

const productRows: ProductRow[] = [
  // Electronics — Zone A
  ["SKU-101", "Wireless Earbuds Pro", "Electronics", "A", 96, 0, 0, 24, 20, 38, 89],
  ["SKU-102", "Smart Watch SE", "Electronics", "A", 44, 1, 0, 12, 10, 72, 149],
  ["SKU-103", "Bluetooth Speaker Mini", "Electronics", "A", 88, 0, 0, 20, 15, 21, 49],
  ["SKU-104", "USB-C Hub 7-in-1", "Electronics", "A", 61, 0, 12, 16, 12, 17, 39],
  ["SKU-105", "Power Bank 20K", "Electronics", "A", 73, 2, 0, 18, 12, 15, 42],
  ["SKU-106", "HD Webcam 1080p", "Electronics", "A", 52, 0, 0, 14, 10, 26, 59],
  ["SKU-107", "Mechanical Keyboard TKL", "Electronics", "A", 38, 0, 0, 10, 8, 44, 99],
  ["SKU-108", "Wireless Mouse", "Electronics", "A", 84, 0, 0, 20, 15, 12, 29],
  ["SKU-109", "Noise-Cancel Headphones", "Electronics", "A", 12, 0, 0, 8, 6, 62, 129],
  ["SKU-110", "Smart Plug Duo", "Electronics", "A", 47, 0, 0, 12, 10, 9, 25],
  // Accessories — Zone B
  ["SKU-201", "Phone Case MagSafe", "Accessories", "B", 132, 1, 0, 30, 25, 4, 19],
  ["SKU-202", "Screen Protector 2-Pack", "Accessories", "B", 118, 0, 0, 28, 20, 2, 12],
  ["SKU-203", "Charging Cable 2m", "Accessories", "B", 204, 0, 24, 40, 30, 3, 14],
  ["SKU-204", "Magnetic Phone Mount", "Accessories", "B", 8, 1, 0, 10, 40, 6, 16],
  ["SKU-205", "Laptop Sleeve 13\"", "Accessories", "B", 56, 0, 0, 14, 10, 8, 27],
  ["SKU-206", "Travel Adapter EU/US", "Accessories", "B", 66, 0, 0, 16, 12, 10, 31],
  ["SKU-207", "Car Phone Holder", "Accessories", "B", 74, 0, 0, 18, 15, 7, 22],
  ["SKU-208", "USB-C to HDMI Cable", "Accessories", "B", 91, 0, 0, 22, 15, 6, 18],
  ["SKU-209", "Stylus Pen", "Accessories", "B", 49, 0, 0, 12, 10, 5, 16],
  ["SKU-210", "Cable Organizer Kit", "Accessories", "B", 27, 0, 0, 8, 20, 4, 13],
  // Apparel — Zone C
  ["SKU-301", "Cotton Tee (M)", "Apparel", "C", 140, 0, 0, 30, 25, 5, 20],
  ["SKU-302", "Hoodie Fleece", "Apparel", "C", 64, 0, 0, 16, 12, 16, 48],
  ["SKU-303", "Running Shorts", "Apparel", "C", 71, 0, 0, 18, 12, 7, 24],
  ["SKU-304", "Bomber Jacket", "Apparel", "C", 33, 1, 0, 8, 6, 28, 74],
  ["SKU-305", "Crew Socks 5-Pack", "Apparel", "C", 120, 0, 0, 30, 20, 4, 15],
  ["SKU-306", "Beanie Knit", "Apparel", "C", 58, 0, 0, 14, 10, 6, 21],
  ["SKU-307", "Performance Polo", "Apparel", "C", 44, 0, 0, 12, 10, 9, 28],
  ["SKU-308", "Joggers Slim", "Apparel", "C", 62, 0, 0, 16, 12, 13, 38],
  ["SKU-309", "Scarf Wool Blend", "Apparel", "C", 29, 0, 0, 8, 6, 11, 32],
  ["SKU-310", "Cap Snapback", "Apparel", "C", 4, 0, 0, 10, 30, 5, 18],
  ["SKU-311", "Thermal Base Layer", "Apparel", "C", 0, 0, 0, 8, 20, 12, 35],
  // Home — Zone D
  ["SKU-401", "Ceramic Mug Set", "Home", "D", 54, 0, 0, 14, 10, 9, 26],
  ["SKU-402", "Throw Pillow 45cm", "Home", "D", 8, 0, 0, 6, 12, 7, 22],
  ["SKU-403", "LED Desk Lamp", "Home", "D", 37, 0, 0, 10, 8, 15, 38],
  ["SKU-404", "Storage Basket", "Home", "D", 46, 0, 0, 12, 10, 6, 19],
  ["SKU-405", "Glassware Set 6pc", "Home", "D", 29, 3, 0, 8, 6, 11, 33],
  ["SKU-406", "Bath Towel Set", "Home", "D", 68, 0, 0, 16, 12, 12, 34],
  ["SKU-407", "Wall Clock Minimal", "Home", "D", 31, 0, 0, 8, 6, 14, 41],
  ["SKU-408", "Photo Frame A4", "Home", "D", 42, 0, 0, 10, 8, 5, 17],
  ["SKU-409", "Desk Organizer Bamboo", "Home", "D", 25, 0, 0, 8, 6, 10, 28],
  // Grocery — Zone E
  ["SKU-501", "Olive Oil 750ml", "Grocery", "E", 88, 0, 0, 20, 15, 7, 18],
  ["SKU-502", "Granola 1kg", "Grocery", "E", 74, 0, 0, 18, 12, 4, 12],
  ["SKU-503", "Coffee Beans 1kg", "Grocery", "E", 96, 0, 40, 22, 15, 9, 24],
  ["SKU-504", "Pasta Sauce 680g", "Grocery", "E", 110, 0, 0, 26, 20, 3, 9],
  ["SKU-505", "Honey Jar 500g", "Grocery", "E", 58, 0, 0, 14, 10, 5, 14],
  ["SKU-506", "Almonds 500g", "Grocery", "E", 83, 0, 0, 20, 15, 4, 11],
  ["SKU-507", "Green Tea 40ct", "Grocery", "E", 64, 0, 0, 16, 12, 3, 10],
  ["SKU-508", "Dark Chocolate 70%", "Grocery", "E", 92, 0, 0, 22, 15, 2, 7],
  // Fragile — Zone F
  ["SKU-601", "Wine Glasses Set", "Fragile", "F", 22, 2, 0, 6, 6, 13, 36],
  ["SKU-602", "Ceramic Vase", "Fragile", "F", 17, 1, 0, 6, 6, 15, 42],
  ["SKU-603", "Mirror Round 60cm", "Fragile", "F", 11, 1, 0, 4, 4, 18, 55],
  ["SKU-604", "Glass Carafe", "Fragile", "F", 26, 0, 0, 8, 6, 8, 23],
  ["SKU-605", "Porcelain Dinner Set", "Fragile", "F", 14, 2, 0, 4, 4, 26, 78],
  ["SKU-606", "Picture Frame Glass", "Fragile", "F", 31, 0, 0, 8, 6, 7, 20],
  ["SKU-607", "Whisky Decanter", "Fragile", "F", 9, 0, 0, 4, 4, 21, 62],
  // High Value — Zone G
  ["SKU-701", "Action Camera 4K", "Electronics", "G", 21, 0, 0, 6, 5, 96, 219],
  ["SKU-702", "Smart Speaker HiFi", "Electronics", "G", 13, 0, 0, 4, 4, 54, 129],
];

function buildProducts(): Product[] {
  const zoneCount: Record<string, number> = {};
  return productRows.map(([sku, name, category, zone, total, damaged, incoming, reorderPoint, minOrder, cost, price], i) => {
    zoneCount[zone] = (zoneCount[zone] ?? 0) + 1;
    const n = zoneCount[zone];
    const loc = `${zone}-${Math.ceil(n / 4)}-${String((n % 4) + 1).padStart(2, "0")}`;
    return {
      sku,
      name,
      category,
      zone,
      location: loc,
      total,
      available: total - damaged,
      reserved: 0,
      damaged,
      incoming,
      reorderPoint,
      minOrderQty: minOrder,
      cost,
      price,
    };
  });
}

// ------------------------------------------------------------
// ORDERS
// ------------------------------------------------------------
const CUSTOMERS: [string, Tier][] = [
  ["Atlas Retail Group", "Premium"],
  ["Nordic Supply Co.", "Premium"],
  ["Bloom & Bloom", "Enterprise"],
  ["Coastal Mart", "Enterprise"],
  ["Vertex Electronics", "Premium"],
  ["Harbor Market", "Standard"],
  ["Lumen Outfitters", "Standard"],
  ["Cascade Foods", "Enterprise"],
  ["Monarch Home", "Standard"],
  ["Summit Traders", "Standard"],
  ["Aurora Gifts", "Standard"],
  ["Fern & Field", "Standard"],
];

type OrderRow = {
  id: string;
  customer: string;
  tier: Tier;
  items: [string, number][];
  createdHoursAgo: number;
  promisedFromNow: number; // hours
  stage: Order["stage"];
  stationId?: string;
  missionId?: string;
  qcStatus?: Order["qcStatus"];
  dispatchedHoursAgo?: number;
  held?: boolean;
  source?: "seed" | "simulator" | "manual";
};

const orderRows: OrderRow[] = [
  // ---- historical, dispatched (last 14 days) ----
  { id: "NXS-1001", customer: "Atlas Retail Group", tier: "Premium", items: [["SKU-101", 4], ["SKU-201", 6]], createdHoursAgo: 336, promisedFromNow: 330, stage: "Dispatched", dispatchedHoursAgo: 331 },
  { id: "NXS-1002", customer: "Harbor Market", tier: "Standard", items: [["SKU-501", 8], ["SKU-503", 4]], createdHoursAgo: 312, promisedFromNow: 308, stage: "Dispatched", dispatchedHoursAgo: 305 },
  { id: "NXS-1003", customer: "Nordic Supply Co.", tier: "Premium", items: [["SKU-302", 6], ["SKU-305", 10]], createdHoursAgo: 288, promisedFromNow: 282, stage: "Dispatched", dispatchedHoursAgo: 284 },
  { id: "NXS-1004", customer: "Vertex Electronics", tier: "Premium", items: [["SKU-102", 3], ["SKU-108", 5]], createdHoursAgo: 264, promisedFromNow: 258, stage: "Dispatched", dispatchedHoursAgo: 259 },
  { id: "NXS-1005", customer: "Bloom & Bloom", tier: "Enterprise", items: [["SKU-401", 4], ["SKU-406", 3]], createdHoursAgo: 240, promisedFromNow: 234, stage: "Dispatched", dispatchedHoursAgo: 232 },
  { id: "NXS-1006", customer: "Cascade Foods", tier: "Enterprise", items: [["SKU-502", 12], ["SKU-506", 8]], createdHoursAgo: 216, promisedFromNow: 210, stage: "Dispatched", dispatchedHoursAgo: 209 },
  { id: "NXS-1007", customer: "Lumen Outfitters", tier: "Standard", items: [["SKU-301", 8], ["SKU-307", 4]], createdHoursAgo: 192, promisedFromNow: 186, stage: "Dispatched", dispatchedHoursAgo: 185 },
  { id: "NXS-1008", customer: "Summit Traders", tier: "Standard", items: [["SKU-105", 2], ["SKU-104", 3]], createdHoursAgo: 168, promisedFromNow: 162, stage: "Dispatched", dispatchedHoursAgo: 161 },
  { id: "NXS-1009", customer: "Monarch Home", tier: "Standard", items: [["SKU-403", 3], ["SKU-408", 5]], createdHoursAgo: 144, promisedFromNow: 138, stage: "Dispatched", dispatchedHoursAgo: 137 },
  { id: "NXS-1010", customer: "Aurora Gifts", tier: "Standard", items: [["SKU-601", 2], ["SKU-606", 4]], createdHoursAgo: 120, promisedFromNow: 114, stage: "Dispatched", dispatchedHoursAgo: 113 },
  // ---- active ----
  { id: "NXS-1011", customer: "Harbor Market", tier: "Standard", items: [["SKU-204", 5], ["SKU-207", 3]], createdHoursAgo: 26, promisedFromNow: 18, stage: "Prioritized" },
  { id: "NXS-1012", customer: "Vertex Electronics", tier: "Premium", items: [["SKU-701", 2], ["SKU-208", 4]], createdHoursAgo: 52, promisedFromNow: 7, stage: "QC", qcStatus: "Passed" },
  { id: "NXS-1013", customer: "Atlas Retail Group", tier: "Premium", items: [["SKU-103", 6], ["SKU-203", 8]], createdHoursAgo: 48, promisedFromNow: 9, stage: "QC", qcStatus: "Passed" },
  { id: "NXS-1014", customer: "Bloom & Bloom", tier: "Enterprise", items: [["SKU-302", 4], ["SKU-308", 4]], createdHoursAgo: 44, promisedFromNow: 10, stage: "QC", qcStatus: "Pending" },
  { id: "NXS-1015", customer: "Coastal Mart", tier: "Enterprise", items: [["SKU-501", 6], ["SKU-504", 8], ["SKU-508", 6]], createdHoursAgo: 40, promisedFromNow: 12, stage: "QC", qcStatus: "Pending" },
  { id: "NXS-1016", customer: "Cascade Foods", tier: "Enterprise", items: [["SKU-503", 5], ["SKU-505", 4]], createdHoursAgo: 38, promisedFromNow: 14, stage: "QC", qcStatus: "Pending" },
  { id: "NXS-1017", customer: "Nordic Supply Co.", tier: "Premium", items: [["SKU-109", 2], ["SKU-205", 2]], createdHoursAgo: 36, promisedFromNow: 16, stage: "QC", qcStatus: "Pending" },
  { id: "NXS-1018", customer: "Lumen Outfitters", tier: "Standard", items: [["SKU-301", 6], ["SKU-306", 4]], createdHoursAgo: 34, promisedFromNow: 18, stage: "QC", qcStatus: "Pending" },
  { id: "NXS-1019", customer: "Summit Traders", tier: "Standard", items: [["SKU-107", 2], ["SKU-110", 4]], createdHoursAgo: 32, promisedFromNow: 20, stage: "QC", qcStatus: "Pending" },
  { id: "NXS-1020", customer: "Aurora Gifts", tier: "Standard", items: [["SKU-601", 3], ["SKU-604", 2]], createdHoursAgo: 30, promisedFromNow: 22, stage: "QC", qcStatus: "Failed" },
  { id: "NXS-1021", customer: "Monarch Home", tier: "Standard", items: [["SKU-401", 4], ["SKU-409", 3]], createdHoursAgo: 28, promisedFromNow: 24, stage: "QC", qcStatus: "Pending" },
  { id: "NXS-1022", customer: "Atlas Retail Group", tier: "Premium", items: [["SKU-101", 5], ["SKU-201", 5]], createdHoursAgo: 26, promisedFromNow: 6, stage: "Packing", stationId: "PK-1" },
  { id: "NXS-1023", customer: "Coastal Mart", tier: "Enterprise", items: [["SKU-104", 4], ["SKU-105", 3]], createdHoursAgo: 24, promisedFromNow: 8, stage: "Packing", stationId: "PK-2" },
  { id: "NXS-1024", customer: "Vertex Electronics", tier: "Premium", items: [["SKU-102", 2], ["SKU-106", 2], ["SKU-110", 3]], createdHoursAgo: 22, promisedFromNow: 5, stage: "Packing", stationId: "PK-3" },
  { id: "NXS-1025", customer: "Bloom & Bloom", tier: "Enterprise", items: [["SKU-401", 3], ["SKU-402", 2]], createdHoursAgo: 20, promisedFromNow: 9, stage: "Packing" },
  { id: "NXS-1026", customer: "Nordic Supply Co.", tier: "Premium", items: [["SKU-302", 4], ["SKU-305", 6]], createdHoursAgo: 18, promisedFromNow: 7, stage: "Packing" },
  { id: "NXS-1027", customer: "Harbor Market", tier: "Standard", items: [["SKU-501", 6], ["SKU-507", 4]], createdHoursAgo: 16, promisedFromNow: 11, stage: "Packing" },
  { id: "NXS-1028", customer: "Cascade Foods", tier: "Enterprise", items: [["SKU-502", 8], ["SKU-506", 6]], createdHoursAgo: 15, promisedFromNow: 12, stage: "Packing" },
  { id: "NXS-1029", customer: "Monarch Home", tier: "Standard", items: [["SKU-403", 3], ["SKU-407", 2], ["SKU-408", 4]], createdHoursAgo: 14, promisedFromNow: 10, stage: "Packing" },
  { id: "NXS-1030", customer: "Lumen Outfitters", tier: "Standard", items: [["SKU-301", 8], ["SKU-303", 5]], createdHoursAgo: 12, promisedFromNow: 15, stage: "Allocated" },
  { id: "NXS-1031", customer: "Summit Traders", tier: "Standard", items: [["SKU-105", 3], ["SKU-108", 4]], createdHoursAgo: 11, promisedFromNow: 16, stage: "Allocated" },
  { id: "NXS-1032", customer: "Coastal Mart", tier: "Enterprise", items: [["SKU-310", 4]], createdHoursAgo: 10, promisedFromNow: 13, stage: "Prioritized" },
  { id: "NXS-1033", customer: "Aurora Gifts", tier: "Standard", items: [["SKU-605", 2], ["SKU-607", 1]], createdHoursAgo: 9, promisedFromNow: 17, stage: "Allocated" },
  { id: "NXS-1034", customer: "Bloom & Bloom", tier: "Enterprise", items: [["SKU-406", 4], ["SKU-409", 2]], createdHoursAgo: 8, promisedFromNow: 18, stage: "Allocated" },
  { id: "NXS-1035", customer: "Atlas Retail Group", tier: "Premium", items: [["SKU-107", 2], ["SKU-108", 4], ["SKU-209", 6]], createdHoursAgo: 7, promisedFromNow: 5, stage: "Picking", missionId: "PX-104" },
  { id: "NXS-1036", customer: "Vertex Electronics", tier: "Premium", items: [["SKU-701", 2], ["SKU-702", 1]], createdHoursAgo: 6, promisedFromNow: 8, stage: "Picking", missionId: "PX-105" },
  { id: "NXS-1037", customer: "Nordic Supply Co.", tier: "Premium", items: [["SKU-101", 4], ["SKU-102", 2]], createdHoursAgo: 6, promisedFromNow: 9, stage: "Picking", missionId: "PX-106" },
  { id: "NXS-1038", customer: "Cascade Foods", tier: "Enterprise", items: [["SKU-501", 6], ["SKU-402", 2]], createdHoursAgo: 30, promisedFromNow: -20, stage: "Packing" },
  { id: "NXS-1039", customer: "Monarch Home", tier: "Standard", items: [["SKU-307", 4], ["SKU-309", 2]], createdHoursAgo: 5, promisedFromNow: 14, stage: "Allocated", missionId: "PX-107" },
  { id: "NXS-1040", customer: "Summit Traders", tier: "Standard", items: [["SKU-402", 1], ["SKU-406", 3], ["SKU-408", 2]], createdHoursAgo: 4, promisedFromNow: 12, stage: "Picking", missionId: "PX-108" },
  { id: "NXS-1041", customer: "Harbor Market", tier: "Standard", items: [["SKU-310", 6], ["SKU-301", 4]], createdHoursAgo: 3, promisedFromNow: 20, stage: "Created" },
  { id: "NXS-1042", customer: "Atlas Retail Group", tier: "Premium", items: [["SKU-204", 10], ["SKU-109", 2]], createdHoursAgo: 70, promisedFromNow: 1, stage: "Prioritized" },
  { id: "NXS-1043", customer: "Bloom & Bloom", tier: "Enterprise", items: [["SKU-402", 2], ["SKU-404", 2], ["SKU-409", 2]], createdHoursAgo: 3, promisedFromNow: 22, stage: "Allocated", missionId: "PX-109" },
  { id: "NXS-1044", customer: "Lumen Outfitters", tier: "Standard", items: [["SKU-301", 6], ["SKU-305", 6]], createdHoursAgo: 2, promisedFromNow: 24, stage: "Allocated" },
  // ---- recent history (dispatched within the last 7 days) ----
  { id: "NXS-1045", customer: "Summit Traders", tier: "Standard", items: [["SKU-203", 6], ["SKU-208", 3]], createdHoursAgo: 160, promisedFromNow: 156, stage: "Dispatched", dispatchedHoursAgo: 157 },
  { id: "NXS-1046", customer: "Cascade Foods", tier: "Enterprise", items: [["SKU-502", 10], ["SKU-507", 6]], createdHoursAgo: 144, promisedFromNow: 140, stage: "Dispatched", dispatchedHoursAgo: 141 },
  { id: "NXS-1047", customer: "Aurora Gifts", tier: "Standard", items: [["SKU-604", 4], ["SKU-606", 3]], createdHoursAgo: 128, promisedFromNow: 124, stage: "Dispatched", dispatchedHoursAgo: 125 },
  { id: "NXS-1048", customer: "Monarch Home", tier: "Standard", items: [["SKU-401", 3], ["SKU-409", 4]], createdHoursAgo: 112, promisedFromNow: 108, stage: "Dispatched", dispatchedHoursAgo: 109 },
  { id: "NXS-1049", customer: "Atlas Retail Group", tier: "Premium", items: [["SKU-101", 5], ["SKU-201", 4]], createdHoursAgo: 96, promisedFromNow: 92, stage: "Dispatched", dispatchedHoursAgo: 93 },
  { id: "NXS-1050", customer: "Nordic Supply Co.", tier: "Premium", items: [["SKU-302", 5], ["SKU-306", 3]], createdHoursAgo: 80, promisedFromNow: 76, stage: "Dispatched", dispatchedHoursAgo: 77 },
  { id: "NXS-1051", customer: "Vertex Electronics", tier: "Premium", items: [["SKU-105", 3], ["SKU-108", 2], ["SKU-110", 2]], createdHoursAgo: 66, promisedFromNow: 62, stage: "Dispatched", dispatchedHoursAgo: 63 },
  { id: "NXS-1052", customer: "Bloom & Bloom", tier: "Enterprise", items: [["SKU-402", 2], ["SKU-406", 4]], createdHoursAgo: 52, promisedFromNow: 48, stage: "Dispatched", dispatchedHoursAgo: 49 },
  { id: "NXS-1053", customer: "Harbor Market", tier: "Standard", items: [["SKU-501", 7], ["SKU-508", 4]], createdHoursAgo: 40, promisedFromNow: 36, stage: "Dispatched", dispatchedHoursAgo: 37 },
  { id: "NXS-1054", customer: "Lumen Outfitters", tier: "Standard", items: [["SKU-301", 6], ["SKU-307", 2]], createdHoursAgo: 32, promisedFromNow: 28, stage: "Dispatched", dispatchedHoursAgo: 29 },
  { id: "NXS-1055", customer: "Coastal Mart", tier: "Enterprise", items: [["SKU-503", 3], ["SKU-505", 2]], createdHoursAgo: 26, promisedFromNow: 22, stage: "Dispatched", dispatchedHoursAgo: 23 },
  { id: "NXS-1056", customer: "Cascade Foods", tier: "Enterprise", items: [["SKU-504", 8], ["SKU-506", 5]], createdHoursAgo: 20, promisedFromNow: 16, stage: "Dispatched", dispatchedHoursAgo: 17 },
];

function buildOrder(row: OrderRow, products: Product[]): Order {
  const items: OrderItem[] = row.items.map(([sku, qty]) => ({ sku, qty, allocated: 0, picked: 0, packed: 0 }));
  const createdMs = NOW - row.createdHoursAgo * HOUR;
  const promisedMs = NOW + row.promisedFromNow * HOUR;
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const value = items.reduce((s, i) => {
    const p = products.find((x) => x.sku === i.sku);
    return s + (p ? p.price : 0) * i.qty;
  }, 0);
  const zone =
    products.find((x) => x.sku === items[0].sku)?.zone ?? "A";
  const history = [
    { at: iso(createdMs), label: "Order created", detail: `Submitted via ${row.customer} portal` },
    { at: iso(createdMs + 4 * 60000), label: "Priority calculated", detail: `Scored by NEXUS priority engine` },
    { at: iso(createdMs + 18 * 60000), label: "Inventory checked", detail: "Availability verified across zones" },
  ];
  return {
    id: row.id,
    customer: row.customer,
    tier: row.tier,
    items,
    totalQty,
    value,
    createdAt: iso(createdMs),
    promisedAt: iso(promisedMs),
    priority: 0,
    priorityReasons: [],
    risk: 0,
    stage: row.stage,
    allocationStatus: "None",
    zone,
    missionId: row.missionId,
    stationId: row.stationId,
    qcStatus: row.qcStatus,
    held: row.held,
    history,
    dispatchedAt: row.dispatchedHoursAgo ? iso(NOW - row.dispatchedHoursAgo * HOUR) : undefined,
    createdSource: row.source ?? "seed",
  };
}

// ------------------------------------------------------------
// MAIN SEED
// ------------------------------------------------------------
export function seedState(): AppState {
  const products = buildProducts();
  const p = (sku: string) => products.find((x) => x.sku === sku)!;

  // --- orders ---
  let orders = orderRows.map((row) => buildOrder(row, products));

  // --- allocation pass (active orders only, in priority order) ---
  const stagesWithAlloc = new Set(["Allocated", "Picking", "Packing", "QC", "Held"]);
  const allocatable = orders
    .filter((o) => stagesWithAlloc.has(o.stage))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const o of allocatable) {
    let full = true;
    let any = false;
    for (const it of o.items) {
      const prod = p(it.sku);
      const give = Math.min(it.qty, prod.available);
      if (give > 0) {
        prod.available -= give;
        prod.reserved += give;
        it.allocated = give;
        any = true;
      }
      if (it.allocated < it.qty) full = false;
    }
    o.allocationStatus = !any ? "None" : full ? "Full" : "Partial";
    o.allocatedAt = iso(new Date(o.createdAt).getTime() + 40 * 60000);
    o.history.push({
      at: o.allocatedAt,
      label: o.allocationStatus === "Full" ? "Fully allocated" : "Partially allocated",
      detail: `${o.totalQty} units committed${full ? "" : " (stock conflict)"}`,
    });
  }
  // stages beyond allocation
  for (const o of orders) {
    const t = (min: number) => iso(new Date(o.createdAt).getTime() + min * 60000);
    if (o.stage === "Picking" || o.stage === "Packing" || o.stage === "QC" || o.stage === "Dispatched") {
      o.history.push({ at: t(60), label: "Picking started", detail: o.missionId ? `Mission ${o.missionId}` : "Picking queue" });
    }
    if (o.stage === "Packing" || o.stage === "QC" || o.stage === "Dispatched") {
      o.pickedAt = t(95);
      o.history.push({ at: o.pickedAt, label: "Picking completed", detail: "All lines picked" });
      o.history.push({ at: t(120), label: "Sent to packing", detail: o.stationId ?? "Packing queue" });
      o.packedAt = t(120);
    }
    if (o.stage === "QC" || o.stage === "Dispatched") {
      o.history.push({ at: t(140), label: "Packed & queued for QC", detail: "" });
      o.qcAt = t(150);
      if (o.qcStatus === "Passed" || o.qcStatus === "Pending") {
        o.history.push({ at: o.qcAt, label: "QC pending", detail: "" });
      }
      if (o.qcStatus === "Failed") {
        o.history.push({ at: o.qcAt, label: "QC failed", detail: "Returned for rework" });
      }
    }
    if (o.stage === "Dispatched") {
      o.history.push({ at: o.dispatchedAt ?? t(160), label: "Dispatched", detail: "Shipped to customer" });
    }
  }

  // priorities + risk (after allocation state known)
  orders = orders.map((o) => {
    const pr = computePriority(o, products);
    return { ...o, priority: pr.score, priorityReasons: pr.reasons, risk: computeRisk(o, products) };
  });

  // --- missions ---
  const binOf = (sku: string) => p(sku).location;
  const missions: Mission[] = [
    {
      id: "PX-101", orderId: "NXS-1024", pickerId: "P-01", status: "Completed", progress: 100,
      deadlineMin: 20, elapsedMin: 18, completedAt: iso(NOW - 5 * HOUR),
      items: orders.find((o) => o.id === "NXS-1024")!.items.map((i) => ({ sku: i.sku, qty: i.allocated, picked: i.allocated, bin: binOf(i.sku) })),
      zones: [...new Set(orders.find((o) => o.id === "NXS-1024")!.items.map((i) => p(i.sku).zone))],
      route: { normalM: 142, optimizedM: 96, savedM: 46, savedMin: 7 },
    },
    {
      id: "PX-102", orderId: "NXS-1025", pickerId: "P-02", status: "Completed", progress: 100,
      deadlineMin: 22, elapsedMin: 19, completedAt: iso(NOW - 4 * HOUR),
      items: orders.find((o) => o.id === "NXS-1025")!.items.map((i) => ({ sku: i.sku, qty: i.allocated, picked: i.allocated, bin: binOf(i.sku) })),
      zones: [...new Set(orders.find((o) => o.id === "NXS-1025")!.items.map((i) => p(i.sku).zone))],
      route: { normalM: 128, optimizedM: 84, savedM: 44, savedMin: 6 },
    },
    {
      id: "PX-103", orderId: "NXS-1026", pickerId: "P-03", status: "Completed", progress: 100,
      deadlineMin: 18, elapsedMin: 15, completedAt: iso(NOW - 3 * HOUR),
      items: orders.find((o) => o.id === "NXS-1026")!.items.map((i) => ({ sku: i.sku, qty: i.allocated, picked: i.allocated, bin: binOf(i.sku) })),
      zones: [...new Set(orders.find((o) => o.id === "NXS-1026")!.items.map((i) => p(i.sku).zone))],
      route: { normalM: 116, optimizedM: 78, savedM: 38, savedMin: 5 },
    },
    {
      id: "PX-104", orderId: "NXS-1035", pickerId: "P-03", status: "Delayed", progress: 63,
      deadlineMin: 18, elapsedMin: 34, startedAt: iso(NOW - 34 * 60000),
      items: orders.find((o) => o.id === "NXS-1035")!.items.map((i) => ({ sku: i.sku, qty: i.allocated, picked: Math.floor(i.allocated * 0.63), bin: binOf(i.sku) })),
      zones: [...new Set(orders.find((o) => o.id === "NXS-1035")!.items.map((i) => p(i.sku).zone))],
      route: { normalM: 152, optimizedM: 101, savedM: 51, savedMin: 8 },
    },
    {
      id: "PX-105", orderId: "NXS-1036", pickerId: "P-01", status: "Active", progress: 48,
      deadlineMin: 25, elapsedMin: 13, startedAt: iso(NOW - 13 * 60000),
      items: orders.find((o) => o.id === "NXS-1036")!.items.map((i) => ({ sku: i.sku, qty: i.allocated, picked: Math.floor(i.allocated * 0.48), bin: binOf(i.sku) })),
      zones: [...new Set(orders.find((o) => o.id === "NXS-1036")!.items.map((i) => p(i.sku).zone))],
      route: { normalM: 134, optimizedM: 88, savedM: 46, savedMin: 7 },
    },
    {
      id: "PX-106", orderId: "NXS-1037", pickerId: "P-02", status: "Active", progress: 32,
      deadlineMin: 22, elapsedMin: 8, startedAt: iso(NOW - 8 * 60000),
      items: orders.find((o) => o.id === "NXS-1037")!.items.map((i) => ({ sku: i.sku, qty: i.allocated, picked: Math.floor(i.allocated * 0.32), bin: binOf(i.sku) })),
      zones: [...new Set(orders.find((o) => o.id === "NXS-1037")!.items.map((i) => p(i.sku).zone))],
      route: { normalM: 121, optimizedM: 80, savedM: 41, savedMin: 6 },
    },
    {
      id: "PX-107", orderId: "NXS-1039", pickerId: "", status: "Ready", progress: 0,
      deadlineMin: 26, elapsedMin: 0,
      items: orders.find((o) => o.id === "NXS-1039")!.items.map((i) => ({ sku: i.sku, qty: i.allocated, picked: 0, bin: binOf(i.sku) })),
      zones: [...new Set(orders.find((o) => o.id === "NXS-1039")!.items.map((i) => p(i.sku).zone))],
      route: { normalM: 108, optimizedM: 71, savedM: 37, savedMin: 5 },
    },
    {
      id: "PX-108", orderId: "NXS-1040", pickerId: "P-04", status: "Paused", progress: 45,
      deadlineMin: 30, elapsedMin: 41, startedAt: iso(NOW - 41 * 60000),
      items: orders.find((o) => o.id === "NXS-1040")!.items.map((i) => ({ sku: i.sku, qty: i.allocated, picked: Math.floor(i.allocated * 0.45), bin: binOf(i.sku) })),
      zones: [...new Set(orders.find((o) => o.id === "NXS-1040")!.items.map((i) => p(i.sku).zone))],
      route: { normalM: 163, optimizedM: 104, savedM: 59, savedMin: 9 },
    },
    {
      id: "PX-109", orderId: "NXS-1043", pickerId: "", status: "Ready", progress: 0,
      deadlineMin: 28, elapsedMin: 0,
      items: orders.find((o) => o.id === "NXS-1043")!.items.map((i) => ({ sku: i.sku, qty: i.allocated, picked: 0, bin: binOf(i.sku) })),
      zones: [...new Set(orders.find((o) => o.id === "NXS-1043")!.items.map((i) => p(i.sku).zone))],
      route: { normalM: 146, optimizedM: 95, savedM: 51, savedMin: 8 },
    },
  ];

  // --- pickers ---
  const pickers: Picker[] = [
    { id: "P-01", name: "Ada Reyes", status: "Active", efficiency: 88, zone: "D", activeMissionId: "PX-105" },
    { id: "P-02", name: "Marco Silva", status: "Active", efficiency: 84, zone: "A", activeMissionId: "PX-106" },
    { id: "P-03", name: "Lena Ortiz", status: "Active", efficiency: 91, zone: "F", activeMissionId: "PX-104" },
    { id: "P-04", name: "Tom Nilsen", status: "Paused", efficiency: 79, zone: "C", activeMissionId: "PX-108" },
  ];

  // --- stations ---
  const stations: Station[] = [
    { id: "PK-1", name: "Station 1", status: "Active", orderId: "NXS-1022", avgTimeMin: 11.2 },
    { id: "PK-2", name: "Station 2", status: "Active", orderId: "NXS-1023", avgTimeMin: 10.4 },
    { id: "PK-3", name: "Station 3", status: "Active", orderId: "NXS-1024", avgTimeMin: 9.6 },
  ];

  // --- zones ---
  const zones: Zone[] = [
    { id: "A", name: "Electronics", capacity: 40 },
    { id: "B", name: "Accessories", capacity: 45 },
    { id: "C", name: "Apparel", capacity: 50 },
    { id: "D", name: "Home", capacity: 35 },
    { id: "E", name: "Grocery", capacity: 45 },
    { id: "F", name: "Fragile", capacity: 25 },
    { id: "G", name: "High Value", capacity: 15 },
    { id: "H", name: "Dispatch", capacity: 30 },
  ];

  // --- exceptions ---
  const nowIso = iso(NOW);
  const exceptions: ExceptionRecord[] = [
    {
      id: "EX-008", type: "QC Failure", severity: "High", orderId: "NXS-1020", zone: "F",
      createdAt: iso(NOW - 55 * 60000), status: "In Progress",
      cause: "2 units of SKU-601 arrived at QC with mismatched labels.",
      recommendation: "Relabel affected units and re-run QC before dispatch.",
    },
    {
      id: "EX-007", type: "Missing Item", severity: "High", orderId: "NXS-1040", sku: "SKU-402", zone: "D",
      createdAt: iso(NOW - 70 * 60000), status: "Decision Required",
      cause: "SKU-402 not found at bin D-1-02 during pick mission PX-108.",
      recommendation: "Verify bin location and reserve replacement stock for order NXS-1040.",
    },
    {
      id: "EX-006", type: "Damaged Item", severity: "Medium", sku: "SKU-204", zone: "B",
      createdAt: iso(NOW - 95 * 60000), status: "Analyzing",
      cause: "1 unit of SKU-204 damaged during inbound receiving.",
      recommendation: "Reserve replacement stock from available inventory.",
    },
    {
      id: "EX-005", type: "Low Stock", severity: "Medium", sku: "SKU-310", zone: "C",
      createdAt: iso(NOW - 2 * HOUR), status: "Decision Required",
      cause: "SKU-310 available stock (4) fell below reorder point (10).",
      recommendation: "Create replenishment mission for 30 units.",
    },
    {
      id: "EX-004", type: "Out of Stock", severity: "Critical", sku: "SKU-311", zone: "C",
      createdAt: iso(NOW - 3 * HOUR), status: "Detected",
      cause: "SKU-311 has zero available stock with active demand.",
      recommendation: "Expedite supplier delivery or substitute with equivalent product.",
    },
    {
      id: "EX-003", type: "Picking Delay", severity: "Medium", orderId: "NXS-1040", zone: "C",
      createdAt: iso(NOW - 3.5 * HOUR), status: "In Progress",
      cause: "Mission PX-108 paused for 41 minutes on bin C-3-02.",
      recommendation: "Resume mission or reassign to available picker.",
    },
    {
      id: "EX-002", type: "Delayed Order", severity: "High", orderId: "NXS-1038", zone: "E",
      createdAt: iso(NOW - 4 * HOUR), status: "Decision Required",
      cause: "Order NXS-1038 is 20h past its promised delivery window.",
      recommendation: "Expedite NXS-1038 through packing and offer priority shipping.",
    },
    {
      id: "EX-001", type: "Misallocation", severity: "Low", orderId: "NXS-1044", zone: "C",
      createdAt: iso(NOW - 5 * HOUR), status: "Analyzing",
      cause: "Reserved lot detected in allocation for NXS-1044.",
      recommendation: "Reallocate from available stock and re-verify allocation.",
    },
    // resolved history
    { id: "EX-097", type: "Damaged Item", severity: "Medium", sku: "SKU-105", zone: "A", createdAt: iso(NOW - 26 * HOUR), status: "Resolved", cause: "Unit damaged in transit to picking.", recommendation: "Replace stock from overflow.", resolution: "Replacement stock reserved and verified.", resolvedAt: iso(NOW - 24 * HOUR) },
    { id: "EX-098", type: "QC Failure", severity: "Medium", orderId: "NXS-1009", zone: "D", createdAt: iso(NOW - 40 * HOUR), status: "Resolved", cause: "Scanned barcode mismatch.", recommendation: "Re-scan and re-verify.", resolution: "Re-scan passed; order released to dispatch.", resolvedAt: iso(NOW - 38 * HOUR) },
    { id: "EX-099", type: "Low Stock", severity: "Low", sku: "SKU-503", zone: "E", createdAt: iso(NOW - 60 * HOUR), status: "Resolved", cause: "Stock below threshold.", recommendation: "Create resupply mission.", resolution: "40 units inbound; threshold restored.", resolvedAt: iso(NOW - 55 * HOUR) },
    { id: "EX-096", type: "Delayed Order", severity: "Medium", orderId: "NXS-1010", zone: "F", createdAt: iso(NOW - 3 * DAY), status: "Resolved", cause: "Carrier pickup missed.", recommendation: "Re-book pickup window.", resolution: "Re-booked and dispatched 2h later.", resolvedAt: iso(NOW - 3 * DAY + 2 * HOUR) },
  ];

  // --- decisions (generated by the real engines so behavior matches runtime) ---
  const tempState = {
    products, orders, pickers, missions, stations, zones, exceptions, decisions: [] as Decision[],
    batches: [] as Batch[], notifications: [], events: [], settings: {} as AppState["settings"],
    counters: {} as Counters, paused: false, reports: [], version: 1,
  } as unknown as AppState;

  const decisions: Decision[] = [];
  const conflicts = findConflicts(tempState);
  const sku204Conflict = conflicts.find((c) => c.sku === "SKU-204");
  const sku310Conflict = conflicts.find((c) => c.sku === "SKU-310");
  if (sku204Conflict) {
    const d = { ...recommendAllocation(tempState, sku204Conflict), id: "DC-101" };
    decisions.push(d);
  }
  if (sku310Conflict) {
    const d = { ...recommendAllocation(tempState, sku310Conflict), id: "DC-105" };
    decisions.push(d);
  }
  const reorder204 = reorderRecommendation(p("SKU-204"));
  if (reorder204) decisions.push({ ...reorder204, id: "DC-102" });
  const bottleneck = detectBottlenecks(tempState)[0];
  if (bottleneck && bottleneck.stage === "Packing") {
    decisions.push({
      id: "DC-103",
      kind: "Bottleneck",
      title: `Packing bottleneck — queue ${bottleneck.queue} orders`,
      problem: `The packing area is the current bottleneck: ${bottleneck.queue} orders queued, average processing ${bottleneck.avgMin} min vs ${bottleneck.normalMin} min normal.`,
      data: [
        `Queue: ${bottleneck.queue} orders`,
        `Average processing: ${bottleneck.avgMin} min`,
        `Normal: ${bottleneck.normalMin} min`,
        `Estimated impact: +${bottleneck.impactMin} min on fulfillment`,
      ],
      options: [
        "Move available staff to packing stations",
        "Reduce QC staff by one and reassign to packing",
        "Accept delay and notify affected customers",
      ],
      recommendation: "Move available staff to packing stations (option 1).",
      reasoning: `Packing delay of +${bottleneck.impactMin} minutes propagates to QC and dispatch. Reassigning 1 staff member reduces the queue by ~${Math.min(bottleneck.queue, 3)} orders within the hour.`,
      impact: `Packing queue drops to ~${Math.max(0, bottleneck.queue - 3)} orders and fulfillment delay reduces to near normal.`,
      risk: "Low — no inventory or customer impact",
      status: "Pending",
      action: "move-staff",
      params: { fromStage: "QC", station: "PK-2" },
      refKey: "bottleneck:packing",
      createdAt: iso(NOW - 1.2 * HOUR),
    });
  }
  const atRisk = orders.filter((o) => o.risk >= 70 && o.stage !== "Dispatched" && o.stage !== "Cancelled").sort((a, b) => b.risk - a.risk)[0];
  if (atRisk) {
    decisions.push({
      id: "DC-104",
      kind: "At-Risk Order",
      title: `${atRisk.id} at risk (risk ${atRisk.risk}/100)`,
      problem: `${atRisk.id} (${atRisk.customer}) is ${Math.abs(Math.round((new Date(atRisk.promisedAt).getTime() - NOW) / HOUR))}h past its promised delivery.`,
      data: [
        `Order: ${atRisk.id} — ${atRisk.customer}`,
        `Promised: ${new Date(atRisk.promisedAt).toLocaleString()}`,
        `Stage: ${atRisk.stage}`,
        `Risk score: ${atRisk.risk}/100`,
      ],
      options: [
        "Expedite through packing and dispatch",
        "Contact customer with revised delivery window",
        "Cancel and re-sell stock to next priority order",
      ],
      recommendation: "Expedite through packing and dispatch (option 1).",
      reasoning: `The order is already past its promise; every hour in the packing queue adds to customer-impact. Expediting costs minimal capacity because only one order is involved.`,
      impact: "Order ships within 2 hours and customer SLA impact is contained.",
      risk: "Low — expedite path uses existing capacity",
      status: "Pending",
      action: "expedite",
      params: { orderId: atRisk.id },
      refKey: `atrisk:${atRisk.id}`,
      createdAt: iso(NOW - 1 * HOUR),
    });
  }
  // resolved decision history
  decisions.push(
    {
      id: "DC-099", kind: "Replenishment", title: "Restock SKU-503", problem: "SKU-503 below reorder point.", data: [], options: [], recommendation: "Order 40 units.", reasoning: "Restore buffer.", impact: "Stock restored.", risk: "Low",
      status: "Approved", action: "reorder", params: { sku: "SKU-503", qty: 40 }, refKey: "reorder:SKU-503",
      createdAt: iso(NOW - 55 * HOUR), resolvedAt: iso(NOW - 54 * HOUR),
    },
    {
      id: "DC-098", kind: "Stock Conflict", title: "SKU-105 demand vs stock", problem: "Transient conflict during spike.", data: [], options: [], recommendation: "Split 3 units.", reasoning: "Balance priorities.", impact: "Both orders partially filled.", risk: "Low",
      status: "Approved", action: "allocate", params: { sku: "SKU-105", orderId: "NXS-1008", qty: 3 }, refKey: "conflict:SKU-105",
      createdAt: iso(NOW - 3 * DAY), resolvedAt: iso(NOW - 3 * DAY + 20 * 60000),
    },
  );

  // --- batches ---
  const batches: Batch[] = [
    { id: "D-39", orderIds: ["NXS-1006", "NXS-1007", "NXS-1008", "NXS-1009", "NXS-1010"], carrier: "AeroPost", createdAt: iso(NOW - 26 * HOUR), status: "Dispatched", dispatchedAt: iso(NOW - 25 * HOUR) },
    { id: "D-40", orderIds: ["NXS-1012"], carrier: "SwiftLine Logistics", createdAt: iso(NOW - 40 * 60000), status: "Ready" },
    { id: "D-41", orderIds: ["NXS-1013"], carrier: "Metro Freight", createdAt: iso(NOW - 12 * 60000), status: "Planned" },
  ];

  // --- notifications ---
  const notifications = [
    { id: "NT-01", type: "Allocation Conflict", title: "Stock conflict on SKU-204", body: "15 units demanded, 7 available. Recommendation ready for review.", read: false, createdAt: iso(NOW - 18 * 60000), navigateTo: "/decisions?decision=DC-101" },
    { id: "NT-02", type: "Critical Stock", title: "SKU-204 below reorder point", body: "Available stock is 7 against reorder point 10.", read: false, createdAt: iso(NOW - 22 * 60000), navigateTo: "/inventory?sku=SKU-204" },
    { id: "NT-03", type: "Bottleneck", title: "Packing bottleneck detected", body: "6 orders queued; estimated +22 min impact.", read: false, createdAt: iso(NOW - 1.2 * HOUR), navigateTo: "/decisions?decision=DC-103" },
    { id: "NT-04", type: "Order Delay", title: "NXS-1038 delayed", body: "Order is 20h past its promised delivery window.", read: false, createdAt: iso(NOW - 4 * HOUR), navigateTo: "/orders?order=NXS-1038" },
    { id: "NT-05", type: "Exception", title: "EX-004 — out of stock SKU-311", body: "Zero available stock with active demand.", read: false, createdAt: iso(NOW - 3 * HOUR), navigateTo: "/exceptions?exception=EX-004" },
    { id: "NT-06", type: "Reorder", title: "Resupply recommended for SKU-204", body: "40 units suggested at HIGH urgency.", read: false, createdAt: iso(NOW - 16 * 60000), navigateTo: "/inventory?sku=SKU-204" },
    { id: "NT-07", type: "Exception", title: "EX-008 — QC failure", body: "NXS-1020 failed QC, sent for rework.", read: true, createdAt: iso(NOW - 55 * 60000), navigateTo: "/exceptions?exception=EX-008" },
    { id: "NT-08", type: "Order Delay", title: "PX-104 mission delayed", body: "Mission PX-104 running 16 min over deadline.", read: true, createdAt: iso(NOW - 2 * HOUR), navigateTo: "/picking" },
    { id: "NT-09", type: "Critical Stock", title: "SKU-310 low stock", body: "4 units available, reorder point 10.", read: true, createdAt: iso(NOW - 2 * HOUR), navigateTo: "/inventory?sku=SKU-310" },
  ] as AppState["notifications"];

  // --- activity events ---
  const events: AppState["events"] = [
    { id: "EV-01", at: iso(NOW - 8 * 60000), kind: "order", text: "ORDER #NXS-1044 allocated · 12 units · Zone C", level: "info" },
    { id: "EV-02", at: iso(NOW - 12 * 60000), kind: "decision", text: "DECISION DC-101 created · SKU-204 stock conflict", level: "warn" },
    { id: "EV-03", at: iso(NOW - 16 * 60000), kind: "stock", text: "SKU-204 stock below threshold (7 ≤ 10)", level: "warn" },
    { id: "EV-04", at: iso(NOW - 20 * 60000), kind: "picker", text: "PICKER P-03 started mission PX-104 · 12 items", level: "info" },
    { id: "EV-05", at: iso(NOW - 28 * 60000), kind: "exception", text: "EXCEPTION EX-008 created · QC failure NXS-1020", level: "danger" },
    { id: "EV-06", at: iso(NOW - 40 * 60000), kind: "dispatch", text: "DISPATCH BATCH #D-40 prepared · 1 order · SwiftLine", level: "success" },
    { id: "EV-07", at: iso(NOW - 52 * 60000), kind: "order", text: "ORDER #NXS-1038 delayed · 20h past promise", level: "danger" },
    { id: "EV-08", at: iso(NOW - 1.2 * HOUR), kind: "system", text: "BOTTLENECK detected · Packing queue 6 orders", level: "warn" },
    { id: "EV-09", at: iso(NOW - 1.5 * HOUR), kind: "order", text: "ORDER #NXS-1013 passed QC · ready for dispatch", level: "success" },
    { id: "EV-10", at: iso(NOW - 2 * HOUR), kind: "picker", text: "PICKER P-04 paused mission PX-108 · bin C-3-02", level: "warn" },
    { id: "EV-11", at: iso(NOW - 2.5 * HOUR), kind: "stock", text: "SKU-311 out of stock · zero available", level: "danger" },
    { id: "EV-12", at: iso(NOW - 3 * HOUR), kind: "dispatch", text: "DISPATCH BATCH #D-39 completed · 5 orders · AeroPost", level: "success" },
    { id: "EV-13", at: iso(NOW - 4 * HOUR), kind: "decision", text: "DECISION DC-099 approved · resupply SKU-503", level: "success" },
    { id: "EV-14", at: iso(NOW - 5 * HOUR), kind: "order", text: "ORDER #NXS-1035 allocated · 12 units · Zone A", level: "info" },
  ];

  const counters: Counters = {
    orderSeq: 1057, missionSeq: 110, exceptionSeq: 100, decisionSeq: 106, batchSeq: 42, eventSeq: 40, notifSeq: 20, historySeq: 1,
  };

  return {
    version: 1,
    products,
    orders,
    pickers,
    missions,
    stations,
    exceptions,
    decisions,
    zones,
    notifications,
    events,
    batches,
    settings: {
      theme: "studio",
      animation: "full",
      notifications: { criticalStock: true, orderDelay: true, allocationConflict: true, exception: true, bottleneck: true, reorder: true },
      warehouse: "MAIN WAREHOUSE",
      autoRefresh: true,
      demoMode: false,
      sound: false,
    },
    counters,
    paused: false,
    reports: [],
  };
}

export function nextId(prefix: string, seq: number): string {
  return `${prefix}-${seq}`;
}

export { NOW };
