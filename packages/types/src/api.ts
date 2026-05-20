/**
 * API request/response envelopes shared between frontend and backend.
 */

import type {
  Cafe,
  MenuCategory,
  MenuCategoryWithItems,
  MenuItem,
  Order,
  OrderStatus,
  OrderWithItems,
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
  primaryColor?: string;
  logoUrl?: string;
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
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    notes?: string;
  }>;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
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
  byStatus: Record<OrderStatus, number>;
}

// ─── Settle ─────────────────────────────────────────────────────────────────

/** Analyze a statement that has already been normalized client- or server-side. */
export interface SettleAnalyzeRequest {
  statement: SettleStatement;
  config?: SettleConfig;
}

export interface SettleAnalyzeResponse {
  report: SettleReport;
}
