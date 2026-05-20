/**
 * API request/response envelopes shared between frontend and backend.
 */

import type {
  Cafe,
  GstMode,
  MenuCategory,
  MenuCategoryWithItems,
  MenuItem,
  Order,
  OrderStatus,
  OrderWithItems,
  PaymentMethod,
  PaymentStatus,
  RestaurantTable,
  TableHistory,
  TableSession,
  TableSessionDetail,
  TableShape,
  TableWithStatus,
  SettleConfig,
  SettleReport,
  SettleStatement,
} from './domain.js';

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export interface HealthResponse {
  status: 'ok';
  uptime: number;
  version: string;
  timestamp: string;
}

// ─── Cafes ────────────────────────────────────────────────────────────────────

export interface CreateCafeRequest {
  name: string;
  slug?: string;
  gstin?: string;
  fssai?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  isAirConditioned?: boolean;
  gstMode?: GstMode;
  primaryColor?: string;
  logoUrl?: string;
}

export interface UpdateCafeRequest {
  name?: string;
  gstin?: string | null;
  fssai?: string | null;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
  isAirConditioned?: boolean;
  gstMode?: GstMode;
  primaryColor?: string | null;
  logoUrl?: string | null;
  onlinePaymentEnabled?: boolean;
  qrPrepaidRequired?: boolean;
}

export interface CafesListResponse {
  cafes: Cafe[];
}

export interface CafeResponse {
  cafe: Cafe;
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export interface MenuResponse {
  categories: MenuCategoryWithItems[];
}

export interface CreateMenuCategoryRequest {
  name: string;
  sortOrder?: number;
}

export interface CreateMenuItemRequest {
  categoryId: string;
  name: string;
  description?: string;
  basePricePaise: number;
  imageUrl?: string;
  isVegetarian?: boolean;
  isVegan?: boolean;
  containsEgg?: boolean;
  spiceLevel?: number;
  sortOrder?: number;
}

export interface UpdateMenuItemRequest {
  name?: string;
  description?: string | null;
  basePricePaise?: number;
  imageUrl?: string | null;
  isVegetarian?: boolean;
  isVegan?: boolean;
  containsEgg?: boolean;
  spiceLevel?: number;
  isAvailable?: boolean;
  sortOrder?: number;
  categoryId?: string;
}

export interface MenuCategoryResponse {
  category: MenuCategory;
}

export interface MenuItemResponse {
  item: MenuItem;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface CreateOrderRequest {
  source?: 'counter' | 'qr' | 'phone';
  tableLabel?: string;
  tableSessionId?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    notes?: string;
  }>;
  /** Bill-level adjustments (counter/owner flow only — diners can't discount). */
  discount?: { type: 'percent' | 'flat'; value: number; reason?: string };
  serviceChargeBp?: number;
  packagingChargePaise?: number;
  roundOff?: boolean;
}

export interface OrderResponse {
  order: OrderWithItems;
}

export interface OrdersListResponse {
  orders: Order[];
}

export interface OrderStatsResponse {
  todayCount: number;
  todayRevenuePaise: number;
  todayGstPaise: number;
  byStatus: Record<OrderStatus, number>;
  paymentBreakdownPaise: Record<PaymentMethod, number>;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
}

// ─── Public QR ordering + payments (unauthenticated diner flow) ────────────────

/** Public, diner-safe cafe fields returned with the QR menu. */
export interface PublicCafe {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  city: string;
  /** Effective: cafe opted in AND the server has Razorpay keys configured. */
  onlinePaymentEnabled: boolean;
  /** If true, QR orders must be paid online before they're accepted. */
  prepaidRequired: boolean;
}

export interface PublicMenuResponse {
  cafe: PublicCafe;
  categories: MenuCategoryWithItems[];
}

/** Diner-safe confirmation returned after placing a QR order. */
export interface PublicOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalPaise: number;
  tableLabel: string | null;
}

export interface PublicOrderResponse {
  order: PublicOrder;
}

/** A single line on a diner's order (name + quantity, no internal ids). */
export interface PublicOrderLine {
  name: string;
  quantity: number;
}

/** Full diner-safe order, used to refresh live status for "Your orders". */
export interface PublicOrderDetail extends PublicOrder {
  items: PublicOrderLine[];
  createdAt: string;
}

export interface PublicOrderDetailResponse {
  order: PublicOrderDetail;
}

/** Response from starting payment on a QR order — drives Razorpay Checkout. */
export interface CreatePaymentResponse {
  /** Razorpay public key id — the client opens Checkout with this. */
  keyId: string;
  /** Razorpay order id. */
  providerOrderId: string;
  amountPaise: number;
  currency: string;
  orderId: string;
}

/** Razorpay Checkout success payload, posted back for server verification. */
export interface VerifyPaymentRequest {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature: string;
}

export interface VerifyPaymentResponse {
  order: PublicOrder;
}

// ─── Tables & floor plan ────────────────────────────────────────────────────

export interface CreateTableRequest {
  label: string;
  area?: string | null;
  shape?: TableShape;
  seats?: number;
  x?: number;
  y?: number;
  sortOrder?: number;
}

export interface UpdateTableRequest {
  label?: string;
  area?: string | null;
  shape?: TableShape;
  seats?: number;
  x?: number;
  y?: number;
  sortOrder?: number;
}

export interface TablesListResponse {
  tables: RestaurantTable[];
}

export interface TableResponse {
  table: RestaurantTable;
}

/** Live floor view — every table with its current session summary. */
export interface FloorResponse {
  tables: TableWithStatus[];
}

export interface OpenSessionRequest {
  tableId: string;
  guestName?: string;
  guestPhone?: string;
  partySize?: number;
}

export interface TableSessionResponse {
  session: TableSession;
}

export interface TableSessionDetailResponse {
  session: TableSessionDetail;
}

/** Settle the whole table session (all its orders) as one bill. */
export interface SettleSessionRequest {
  paymentMethod: PaymentMethod;
}

/** Settled-session history for a cafe — per-table totals + session drill-down. */
export type TableHistoryResponse = TableHistory;

// ─── Settle ─────────────────────────────────────────────────────────────────

/** Analyze a statement that has already been normalized client- or server-side. */
export interface SettleAnalyzeRequest {
  statement: SettleStatement;
  config?: SettleConfig;
}

export interface SettleAnalyzeResponse {
  report: SettleReport;
}
