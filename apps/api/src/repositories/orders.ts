import { schema, type Database } from '@sangam/db';
import type {
  Order,
  OrderItem,
  OrderStatus,
  OrderStatsResponse,
  OrderWithItems,
  PaymentMethod,
  PaymentStatus,
} from '@sangam/types';
import { and, count, desc, eq, gte, ilike, inArray, sql, sum } from 'drizzle-orm';
import { buildBillNumber, financialYear } from '../orders/build.js';

export interface NewOrderItem {
  menuItemId: string | null;
  itemNameSnapshot: string;
  unitPricePaise: number;
  quantity: number;
  notes: string | null;
}

export interface NewOrder {
  cafeId: string;
  source: 'counter' | 'qr' | 'phone';
  tableLabel: string | null;
  tableSessionId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  subtotalPaise: number;
  discountPaise: number;
  discountReason: string | null;
  serviceChargePaise: number;
  packagingChargePaise: number;
  taxPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  gstRateBp: number;
  items: NewOrderItem[];
}

export interface OrdersRepository {
  create(data: NewOrder): Promise<OrderWithItems>;
  listByCafe(cafeId: string, limit?: number): Promise<Order[]>;
  /** All orders (with items) attached to a table session, oldest first. */
  listBySession(sessionId: string, cafeId: string): Promise<OrderWithItems[]>;
  findByIdAndCafe(id: string, cafeId: string): Promise<OrderWithItems | null>;
  updateStatus(
    id: string,
    cafeId: string,
    status: OrderStatus,
    paymentMethod?: PaymentMethod,
  ): Promise<Order | null>;
  todayStats(cafeId: string): Promise<OrderStatsResponse>;
  /** Best-selling items today (by quantity), scoped to this cafe's orders. */
  topItemsToday(
    cafeId: string,
    limit: number,
  ): Promise<{ name: string; qty: number; revenuePaise: number }[]>;
  /** Quantity + revenue sold today for items whose snapshot name matches `name`. */
  itemSalesToday(
    cafeId: string,
    name: string,
  ): Promise<{ name: string; qty: number; revenuePaise: number }>;
  /** Look up an order (with items) by its human-facing order number. */
  findByOrderNumber(orderNumber: string, cafeId: string): Promise<OrderWithItems | null>;
  /** Diner started online payment: store the provider order id, mark pending. */
  setPaymentPending(
    id: string,
    cafeId: string,
    providerOrderId: string,
  ): Promise<Order | null>;
  /** Signature verified: mark paid, record the provider payment id + paidAt. */
  markPaid(id: string, cafeId: string, providerPaymentId: string): Promise<Order | null>;
  /** Signature verification failed: mark the payment failed (retry allowed). */
  markPaymentFailed(id: string, cafeId: string): Promise<Order | null>;
}

export function createDrizzleOrdersRepo(db: Database): OrdersRepository {
  return {
    async create(data) {
      // Wrap sequence allocation + order + items in one transaction so a failed
      // line insert rolls back the order row (and the consumed serial).
      return db.transaction(async (tx) => {
        // Gapless, legal invoice number (CGST Rule 46(b)): allocate the next
        // consecutive serial for this (cafe, financial year) with an atomic
        // upsert so concurrent terminals never duplicate or skip a number.
        const fy = financialYear(new Date());
        const [seqRow] = await tx
          .insert(schema.invoiceSequences)
          .values({ cafeId: data.cafeId, fy, lastSeq: 1 })
          .onConflictDoUpdate({
            target: [schema.invoiceSequences.cafeId, schema.invoiceSequences.fy],
            set: { lastSeq: sql`${schema.invoiceSequences.lastSeq} + 1` },
          })
          .returning({ lastSeq: schema.invoiceSequences.lastSeq });
        if (!seqRow) throw new Error('Failed to allocate invoice sequence');
        const orderNumber = buildBillNumber(fy, seqRow.lastSeq);

        const [orderRow] = await tx
          .insert(schema.orders)
          .values({
            cafeId: data.cafeId,
            orderNumber,
            source: data.source,
            tableLabel: data.tableLabel,
            tableSessionId: data.tableSessionId,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            notes: data.notes,
            subtotalPaise: data.subtotalPaise,
            discountPaise: data.discountPaise,
            discountReason: data.discountReason,
            serviceChargePaise: data.serviceChargePaise,
            packagingChargePaise: data.packagingChargePaise,
            taxPaise: data.taxPaise,
            roundOffPaise: data.roundOffPaise,
            totalPaise: data.totalPaise,
            gstRateBp: data.gstRateBp,
          })
          .returning();

        if (!orderRow) throw new Error('Failed to insert order');

        const itemRows: OrderItem[] = [];
        if (data.items.length > 0) {
          const inserted = await tx
            .insert(schema.orderItems)
            .values(
              data.items.map((it) => ({
                orderId: orderRow.id,
                menuItemId: it.menuItemId,
                itemNameSnapshot: it.itemNameSnapshot,
                unitPricePaise: it.unitPricePaise,
                quantity: it.quantity,
                lineTotalPaise: it.unitPricePaise * it.quantity,
                notes: it.notes,
              })),
            )
            .returning();
          itemRows.push(...inserted);
        }

        return { ...orderRow, items: itemRows };
      });
    },

    async listByCafe(cafeId, limit = 50) {
      return db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.cafeId, cafeId))
        .orderBy(desc(schema.orders.createdAt))
        .limit(limit);
    },

    async listBySession(sessionId, cafeId) {
      const orderRows = await db
        .select()
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.tableSessionId, sessionId),
            eq(schema.orders.cafeId, cafeId),
          ),
        )
        .orderBy(schema.orders.createdAt);

      if (orderRows.length === 0) return [];

      const ids = orderRows.map((o) => o.id);
      const itemRows = await db
        .select()
        .from(schema.orderItems)
        .where(inArray(schema.orderItems.orderId, ids));

      const byOrder = new Map<string, OrderItem[]>();
      for (const item of itemRows) {
        const list = byOrder.get(item.orderId) ?? [];
        list.push(item);
        byOrder.set(item.orderId, list);
      }
      return orderRows.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
    },

    async findByIdAndCafe(id, cafeId) {
      const [orderRow] = await db
        .select()
        .from(schema.orders)
        .where(and(eq(schema.orders.id, id), eq(schema.orders.cafeId, cafeId)))
        .limit(1);

      if (!orderRow) return null;

      const items = await db
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, id));

      return { ...orderRow, items };
    },

    async updateStatus(id, cafeId, status, paymentMethod) {
      const patch: {
        status: OrderStatus;
        paidAt?: string;
        paymentMethod?: PaymentMethod;
        paymentStatus?: PaymentStatus;
      } = { status };
      if (status === 'completed') {
        patch.paidAt = new Date().toISOString();
        if (paymentMethod) {
          patch.paymentMethod = paymentMethod;
          // Completing a counter order with a method also settles its payment —
          // keeps paymentStatus coherent with the recorded method.
          patch.paymentStatus = 'paid';
        }
      }

      const [row] = await db
        .update(schema.orders)
        .set(patch)
        .where(and(eq(schema.orders.id, id), eq(schema.orders.cafeId, cafeId)))
        .returning();
      return row ?? null;
    },

    async setPaymentPending(id, cafeId, providerOrderId) {
      const [row] = await db
        .update(schema.orders)
        .set({ providerOrderId, paymentStatus: 'pending' })
        .where(and(eq(schema.orders.id, id), eq(schema.orders.cafeId, cafeId)))
        .returning();
      return row ?? null;
    },

    async markPaid(id, cafeId, providerPaymentId) {
      const [row] = await db
        .update(schema.orders)
        .set({
          paymentStatus: 'paid',
          paymentMethod: 'online',
          providerPaymentId,
          paidAt: new Date().toISOString(),
        })
        .where(and(eq(schema.orders.id, id), eq(schema.orders.cafeId, cafeId)))
        .returning();
      return row ?? null;
    },

    async markPaymentFailed(id, cafeId) {
      const [row] = await db
        .update(schema.orders)
        .set({ paymentStatus: 'failed' })
        .where(and(eq(schema.orders.id, id), eq(schema.orders.cafeId, cafeId)))
        .returning();
      return row ?? null;
    },

    async todayStats(cafeId) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();

      const completedToday = and(
        eq(schema.orders.cafeId, cafeId),
        gte(schema.orders.createdAt, todayIso),
        eq(schema.orders.status, 'completed'),
      );

      const [todayAgg, statusAgg, paymentAgg] = await Promise.all([
        db
          .select({
            count: count(),
            revenue: sum(schema.orders.totalPaise),
            gst: sum(schema.orders.taxPaise),
          })
          .from(schema.orders)
          .where(completedToday),
        db
          .select({ status: schema.orders.status, count: count() })
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.cafeId, cafeId),
              gte(schema.orders.createdAt, todayIso),
            ),
          )
          .groupBy(schema.orders.status),
        db
          .select({
            method: schema.orders.paymentMethod,
            total: sum(schema.orders.totalPaise),
          })
          .from(schema.orders)
          .where(completedToday)
          .groupBy(schema.orders.paymentMethod),
      ]);

      const byStatus: Record<OrderStatus, number> = {
        pending: 0,
        preparing: 0,
        ready: 0,
        completed: 0,
        cancelled: 0,
      };
      for (const row of statusAgg) {
        byStatus[row.status as OrderStatus] = Number(row.count);
      }

      const paymentBreakdownPaise: Record<PaymentMethod, number> = {
        cash: 0,
        upi: 0,
        card: 0,
        online: 0,
      };
      for (const row of paymentAgg) {
        if (row.method) {
          paymentBreakdownPaise[row.method as PaymentMethod] = Number(row.total ?? 0);
        }
      }

      return {
        todayCount: Number(todayAgg[0]?.count ?? 0),
        todayRevenuePaise: Number(todayAgg[0]?.revenue ?? 0),
        todayGstPaise: Number(todayAgg[0]?.gst ?? 0),
        byStatus,
        paymentBreakdownPaise,
      };
    },

    async topItemsToday(cafeId, limit) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();

      // order_items has no cafeId — scope through the parent order (this cafe,
      // created today), then group by the snapshot name.
      const rows = await db
        .select({
          name: schema.orderItems.itemNameSnapshot,
          qty: sum(schema.orderItems.quantity),
          revenuePaise: sum(schema.orderItems.lineTotalPaise),
        })
        .from(schema.orderItems)
        .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
        .where(
          and(
            eq(schema.orders.cafeId, cafeId),
            gte(schema.orders.createdAt, todayIso),
          ),
        )
        .groupBy(schema.orderItems.itemNameSnapshot)
        .orderBy(desc(sum(schema.orderItems.quantity)))
        .limit(limit);

      return rows.map((r) => ({
        name: r.name,
        qty: Number(r.qty ?? 0),
        revenuePaise: Number(r.revenuePaise ?? 0),
      }));
    },

    async itemSalesToday(cafeId, name) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();

      const [row] = await db
        .select({
          qty: sum(schema.orderItems.quantity),
          revenuePaise: sum(schema.orderItems.lineTotalPaise),
        })
        .from(schema.orderItems)
        .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
        .where(
          and(
            eq(schema.orders.cafeId, cafeId),
            gte(schema.orders.createdAt, todayIso),
            ilike(schema.orderItems.itemNameSnapshot, `%${name}%`),
          ),
        );

      return {
        name,
        qty: Number(row?.qty ?? 0),
        revenuePaise: Number(row?.revenuePaise ?? 0),
      };
    },

    async findByOrderNumber(orderNumber, cafeId) {
      const [orderRow] = await db
        .select()
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.orderNumber, orderNumber),
            eq(schema.orders.cafeId, cafeId),
          ),
        )
        .limit(1);

      if (!orderRow) return null;

      const items = await db
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, orderRow.id));

      return { ...orderRow, items };
    },
  };
}
