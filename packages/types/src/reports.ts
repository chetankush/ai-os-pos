/**
 * Reporting shapes — day-end "Z-report", sales analytics, exports.
 * All money is integer paise. Business days + hours are bucketed in IST
 * (Asia/Kolkata) on the server; the client just renders.
 */

import type { PaymentMethod } from './domain.js';

/** Sales aggregated by a single payment method on a business day. */
export interface PaymentMethodBreakdown {
  method: PaymentMethod;
  /** Gross (totalPaise) settled with this method. */
  grossPaise: number;
  count: number;
}

/** Sales aggregated by a single order source on a business day. */
export interface SourceBreakdown {
  source: 'counter' | 'qr' | 'phone';
  grossPaise: number;
  count: number;
}

/**
 * Day-end Z-report for one IST business day. Revenue figures exclude
 * cancelled orders; cancellations are reported separately for the audit trail.
 * No discount data exists yet, so it is omitted.
 */
export interface DayEndReport {
  /** The business day this report covers, ISO date (YYYY-MM-DD) in IST. */
  date: string;
  /** Sum of totalPaise across non-cancelled orders. */
  grossSalesPaise: number;
  /** Sum of subtotalPaise (pre-tax) across non-cancelled orders. */
  netSalesPaise: number;
  /** Sum of taxPaise across non-cancelled orders. */
  taxPaise: number;
  /** Count of non-cancelled orders. */
  orderCount: number;
  /** Count of orders in 'completed' status. */
  completedCount: number;
  /** Cancelled orders — count + gross value (kept out of revenue totals). */
  cancelledCount: number;
  cancelledValuePaise: number;
  /** Per payment-method breakdown (non-cancelled orders). */
  byPaymentMethod: PaymentMethodBreakdown[];
  /** Per source breakdown (non-cancelled orders). */
  bySource: SourceBreakdown[];
}

export interface DayEndReportResponse {
  report: DayEndReport;
}

/** Grouping dimension for the sales analytics report. */
export type SalesGroupBy = 'item' | 'category' | 'hour';

/** One aggregated sales row keyed by item name. */
export interface ItemSalesRow {
  name: string;
  qty: number;
  revenuePaise: number;
}

/** One aggregated sales row keyed by category name. */
export interface CategorySalesRow {
  category: string;
  qty: number;
  revenuePaise: number;
}

/** One aggregated sales row keyed by hour-of-day (0–23 IST). */
export interface HourSalesRow {
  hour: number;
  orderCount: number;
  revenuePaise: number;
}

export type SalesRow = ItemSalesRow | CategorySalesRow | HourSalesRow;

export interface SalesReportResponse {
  groupBy: SalesGroupBy;
  from: string;
  to: string;
  rows: SalesRow[];
}
