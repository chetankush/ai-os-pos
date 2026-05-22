import { type Database, schema } from '@sangam/db';
import type {
  CategorySalesRow,
  DayEndReport,
  HourSalesRow,
  ItemSalesRow,
  PaymentMethod,
  PaymentMethodBreakdown,
  SalesRow,
  SourceBreakdown,
} from '@sangam/types';
import { and, count, desc, eq, gte, isNull, lt, ne, sql, sum } from 'drizzle-orm';
import { istDayRange, istHourOf, istRange } from '../reports/date-range.js';

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'upi', 'card', 'online'];
const SOURCES: ('counter' | 'qr' | 'phone')[] = ['counter', 'qr', 'phone'];

export interface ReportsRepository {
  /** Z-report for one IST business day (date = YYYY-MM-DD). */
  dayEnd(cafeId: string, date: string): Promise<DayEndReport>;
  /**
   * Aggregated sales over an inclusive IST date range, grouped by item name,
   * category name, or hour-of-day (0–23 IST). Excludes cancelled orders.
   */
  sales(
    cafeId: string,
    from: string,
    to: string,
    groupBy: 'item' | 'category' | 'hour',
  ): Promise<SalesRow[]>;
}

export function createDrizzleReportsRepo(db: Database): ReportsRepository {
  return {
    async dayEnd(cafeId, date) {
      const { fromIso, toIso } = istDayRange(date);

      const inDay = and(
        eq(schema.orders.cafeId, cafeId),
        gte(schema.orders.createdAt, fromIso),
        lt(schema.orders.createdAt, toIso),
      );
      const notCancelled = and(inDay, ne(schema.orders.status, 'cancelled'));

      const [totalsAgg, paymentAgg, sourceAgg, cancelledAgg, completedAgg, splitAgg] =
        await Promise.all([
        db
          .select({
            gross: sum(schema.orders.totalPaise),
            net: sum(schema.orders.subtotalPaise),
            tax: sum(schema.orders.taxPaise),
            orders: count(),
          })
          .from(schema.orders)
          .where(notCancelled),
        db
          .select({
            method: schema.orders.paymentMethod,
            gross: sum(schema.orders.totalPaise),
            orders: count(),
          })
          .from(schema.orders)
          .where(notCancelled)
          .groupBy(schema.orders.paymentMethod),
        db
          .select({
            source: schema.orders.source,
            gross: sum(schema.orders.totalPaise),
            orders: count(),
          })
          .from(schema.orders)
          .where(notCancelled)
          .groupBy(schema.orders.source),
        db
          .select({
            value: sum(schema.orders.totalPaise),
            orders: count(),
          })
          .from(schema.orders)
          .where(and(inDay, eq(schema.orders.status, 'cancelled'))),
        db
          .select({ orders: count() })
          .from(schema.orders)
          .where(and(inDay, eq(schema.orders.status, 'completed'))),
        // Split-tender amounts live in order_payments; the parent order has a
        // null paymentMethod, so add them per method (single-tender is above).
        db
          .select({
            method: schema.orderPayments.method,
            gross: sum(schema.orderPayments.amountPaise),
            payments: count(),
          })
          .from(schema.orderPayments)
          .innerJoin(schema.orders, eq(schema.orderPayments.orderId, schema.orders.id))
          .where(
            and(
              eq(schema.orderPayments.cafeId, cafeId),
              eq(schema.orderPayments.kind, 'payment'),
              isNull(schema.orders.paymentMethod),
              gte(schema.orders.createdAt, fromIso),
              lt(schema.orders.createdAt, toIso),
              ne(schema.orders.status, 'cancelled'),
            ),
          )
          .groupBy(schema.orderPayments.method),
      ]);

      // Payment breakdown — keep a stable order; skip null-method rows (e.g.
      // unpaid counter orders not yet settled), which carry no method.
      const paymentByMethod = new Map<string, { gross: number; count: number }>();
      for (const row of paymentAgg) {
        if (!row.method) continue;
        paymentByMethod.set(row.method, {
          gross: Number(row.gross ?? 0),
          count: Number(row.orders),
        });
      }
      // Fold in split-tender amounts (order_payments) on top of single-tender.
      for (const row of splitAgg) {
        const cur = paymentByMethod.get(row.method) ?? { gross: 0, count: 0 };
        paymentByMethod.set(row.method, {
          gross: cur.gross + Number(row.gross ?? 0),
          count: cur.count + Number(row.payments),
        });
      }
      const byPaymentMethod: PaymentMethodBreakdown[] = PAYMENT_METHODS.filter((m) =>
        paymentByMethod.has(m),
      ).map((m) => {
        const v = paymentByMethod.get(m);
        return { method: m, grossPaise: v?.gross ?? 0, count: v?.count ?? 0 };
      });

      const sourceByName = new Map<string, { gross: number; count: number }>();
      for (const row of sourceAgg) {
        sourceByName.set(row.source, {
          gross: Number(row.gross ?? 0),
          count: Number(row.orders),
        });
      }
      const bySource: SourceBreakdown[] = SOURCES.filter((s) => sourceByName.has(s)).map((s) => {
        const v = sourceByName.get(s);
        return { source: s, grossPaise: v?.gross ?? 0, count: v?.count ?? 0 };
      });

      return {
        date,
        grossSalesPaise: Number(totalsAgg[0]?.gross ?? 0),
        netSalesPaise: Number(totalsAgg[0]?.net ?? 0),
        taxPaise: Number(totalsAgg[0]?.tax ?? 0),
        orderCount: Number(totalsAgg[0]?.orders ?? 0),
        completedCount: Number(completedAgg[0]?.orders ?? 0),
        cancelledCount: Number(cancelledAgg[0]?.orders ?? 0),
        cancelledValuePaise: Number(cancelledAgg[0]?.value ?? 0),
        byPaymentMethod,
        bySource,
      };
    },

    async sales(cafeId, from, to, groupBy) {
      const { fromIso, toIso } = istRange(from, to);

      const ordersInRange = and(
        eq(schema.orders.cafeId, cafeId),
        gte(schema.orders.createdAt, fromIso),
        lt(schema.orders.createdAt, toIso),
        ne(schema.orders.status, 'cancelled'),
      );

      if (groupBy === 'item') {
        const rows = await db
          .select({
            name: schema.orderItems.itemNameSnapshot,
            qty: sum(schema.orderItems.quantity),
            revenue: sum(schema.orderItems.lineTotalPaise),
          })
          .from(schema.orderItems)
          .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
          .where(ordersInRange)
          .groupBy(schema.orderItems.itemNameSnapshot)
          .orderBy(desc(sum(schema.orderItems.lineTotalPaise)));
        return rows.map(
          (r): ItemSalesRow => ({
            name: r.name,
            qty: Number(r.qty ?? 0),
            revenuePaise: Number(r.revenue ?? 0),
          }),
        );
      }

      if (groupBy === 'category') {
        // order_items has no category — resolve it through the soft menuItemId
        // reference. Items whose menu row is gone (deleted) fall into a single
        // "Uncategorized" bucket via COALESCE.
        const categoryName = sql<string>`coalesce(${schema.menuCategories.name}, 'Uncategorized')`;
        const rows = await db
          .select({
            category: categoryName,
            qty: sum(schema.orderItems.quantity),
            revenue: sum(schema.orderItems.lineTotalPaise),
          })
          .from(schema.orderItems)
          .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
          .leftJoin(schema.menuItems, eq(schema.orderItems.menuItemId, schema.menuItems.id))
          .leftJoin(
            schema.menuCategories,
            eq(schema.menuItems.categoryId, schema.menuCategories.id),
          )
          .where(ordersInRange)
          .groupBy(categoryName)
          .orderBy(desc(sum(schema.orderItems.lineTotalPaise)));
        return rows.map(
          (r): CategorySalesRow => ({
            category: r.category,
            qty: Number(r.qty ?? 0),
            revenuePaise: Number(r.revenue ?? 0),
          }),
        );
      }

      // groupBy === 'hour' — bucket order-level revenue by IST hour-of-day.
      // We aggregate per-order then bucket in JS so the SQL stays portable
      // (no DB timezone dependency), filtered by the same index-friendly range.
      const orderRows = await db
        .select({
          createdAt: schema.orders.createdAt,
          totalPaise: schema.orders.totalPaise,
        })
        .from(schema.orders)
        .where(ordersInRange);

      const byHour = new Map<number, { orderCount: number; revenuePaise: number }>();
      for (const o of orderRows) {
        const hour = istHourOf(o.createdAt);
        const bucket = byHour.get(hour) ?? { orderCount: 0, revenuePaise: 0 };
        bucket.orderCount += 1;
        bucket.revenuePaise += o.totalPaise;
        byHour.set(hour, bucket);
      }
      return Array.from(byHour.entries())
        .map(
          ([hour, v]): HourSalesRow => ({
            hour,
            orderCount: v.orderCount,
            revenuePaise: v.revenuePaise,
          }),
        )
        .sort((a, b) => a.hour - b.hour);
    },
  };
}
