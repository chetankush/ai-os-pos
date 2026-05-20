/**
 * Core domain entities — kept independent of database concerns.
 * Database row types live in @sangam/db; these are the API/UI shapes.
 */

export type CafeId = string;
export type MenuCategoryId = string;
export type MenuItemId = string;

export interface Cafe {
  id: CafeId;
  ownerId: string;
  name: string;
  slug: string;
  gstin: string | null;
  fssai: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  isAirConditioned: boolean;
  primaryColor: string | null;
  logoUrl: string | null;
  onlinePaymentEnabled: boolean;
  qrPrepaidRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MenuCategory {
  id: MenuCategoryId;
  cafeId: CafeId;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  id: MenuItemId;
  cafeId: CafeId;
  categoryId: MenuCategoryId;
  name: string;
  description: string | null;
  basePricePaise: number;
  imageUrl: string | null;
  isVegetarian: boolean;
  isVegan: boolean;
  containsEgg: boolean;
  spiceLevel: number;
  isAvailable: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MenuCategoryWithItems extends MenuCategory {
  items: MenuItem[];
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export type OrderId = string;
export type OrderItemId = string;

export type OrderStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled';

export type OrderSource = 'counter' | 'qr' | 'phone';

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'online';

export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';

export interface OrderItem {
  id: OrderItemId;
  orderId: OrderId;
  menuItemId: string | null;
  itemNameSnapshot: string;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
  notes: string | null;
}

export interface Order {
  id: OrderId;
  cafeId: CafeId;
  orderNumber: string;
  status: OrderStatus;
  source: OrderSource;
  tableLabel: string | null;
  tableSessionId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  gstRateBp: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

// ─── Tables & floor plan ────────────────────────────────────────────────────────

export type TableId = string;
export type TableShape = 'round' | 'square';
export type TableSessionStatus = 'open' | 'billed' | 'closed';

export interface RestaurantTable {
  id: TableId;
  cafeId: CafeId;
  label: string;
  area: string | null;
  shape: TableShape;
  seats: number;
  x: number;
  y: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TableSession {
  id: string;
  cafeId: CafeId;
  tableId: TableId;
  status: TableSessionStatus;
  guestName: string | null;
  guestPhone: string | null;
  partySize: number | null;
  openedAt: string;
  closedAt: string | null;
}

/** Derived display status for the live floor view. */
export type TableLiveStatus = 'free' | 'occupied' | 'ready' | 'billed';

/** A table plus its current session summary — powers the live floor view. */
export interface TableWithStatus extends RestaurantTable {
  liveStatus: TableLiveStatus;
  session: TableSession | null;
  orderCount: number;
  runningTotalPaise: number;
}

/** A session with its orders + combined totals — the running tab / settle view. */
export interface TableSessionDetail {
  session: TableSession;
  table: RestaurantTable;
  orders: OrderWithItems[];
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
}

/** An ordered item rolled up across a session (name + total quantity). */
export interface TableHistoryItem {
  name: string;
  quantity: number;
}

/** A past (settled) session — what a table ordered and what it was billed. */
export interface TableHistorySession {
  id: string;
  tableId: TableId;
  tableLabel: string;
  area: string | null;
  guestName: string | null;
  guestPhone: string | null;
  partySize: number | null;
  openedAt: string;
  closedAt: string | null;
  orderCount: number;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  /** Distinct payment methods used to settle this session's orders. */
  paymentMethods: PaymentMethod[];
  items: TableHistoryItem[];
}

/** Per-table rollup across all its settled sessions. */
export interface TableHistoryTableSummary {
  tableId: TableId;
  label: string;
  area: string | null;
  sessionCount: number;
  totalBilledPaise: number;
}

/** Settled-session history: per-table totals + the session drill-down list. */
export interface TableHistory {
  tables: TableHistoryTableSummary[];
  sessions: TableHistorySession[];
}

// ─── Settle (aggregator reconciliation + dispute recovery) ──────────────────────

export type SettlePlatform = 'zomato' | 'swiggy';

export type SettleCategory =
  | 'commission'
  | 'service_fee'
  | 'payment_gateway'
  | 'ads'
  | 'discount'
  | 'refund'
  | 'cancellation'
  | 'tcs'
  | 'tds'
  | 'gst'
  | 'packaging'
  | 'delivery'
  | 'other';

export interface SettleDeduction {
  category: SettleCategory;
  /** Raw label as it appeared in the statement. */
  label: string;
  /** Positive magnitude in paise (money taken from the restaurant). */
  amountPaise: number;
}

/** A normalized, platform-agnostic settlement statement. */
export interface SettleStatement {
  platform: SettlePlatform;
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  orderCount: number;
  /** Gross value of food sold (sum of order subtotals), in paise. */
  grossSalesPaise: number;
  deductions: SettleDeduction[];
  /** Net amount the platform says it paid out, in paise (optional — we derive it). */
  netPayoutPaise?: number;
}

export interface SettleConfig {
  /** The commission rate the cafe actually contracted, e.g. 22 (%). */
  contractedCommissionRatePct?: number;
  /** Did the owner consent to ads this period? Default false → ads flagged. */
  adsConsented?: boolean;
  /** Did the owner approve the discounts this period? Default false → flagged for review. */
  discountsApproved?: boolean;
}

export type SettleFindingCode =
  | 'UNAUTHORIZED_ADS'
  | 'COMMISSION_OVERCHARGE'
  | 'DISCOUNT_REVIEW'
  | 'REFUND_DEDUCTION'
  | 'HIGH_TAKE_RATE'
  | 'TCS_MISMATCH'
  | 'TDS_MISMATCH';

export interface SettleFinding {
  code: SettleFindingCode;
  title: string;
  detail: string;
  /** At-risk / disputable amount in paise. */
  amountPaise: number;
  severity: 'high' | 'medium' | 'low';
  /** Whether this amount is realistically recoverable via dispute. */
  disputable: boolean;
}

export interface SettleReport {
  platform: SettlePlatform;
  periodStart: string;
  periodEnd: string;
  orderCount: number;
  grossSalesPaise: number;
  totalDeductionsPaise: number;
  netPayoutPaise: number;
  /** totalDeductions / grossSales * 100, rounded to 1 dp. */
  effectiveTakeRatePct: number;
  /** Deductions that are contractual and NOT recoverable. */
  mandatoryDeductionsPaise: number;
  /** Sum of disputable findings — the recoverable headline number. */
  disputablePaise: number;
  findings: SettleFinding[];
  /** WhatsApp-ready plain-text summary. */
  whatsappSummary: string;
}
