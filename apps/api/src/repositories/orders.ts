import { schema, type Database } from '@mehfil/db';
import type {
  Order,
  OrderItem,
  OrderStatus,
  OrderStatsResponse,
  OrderWithItems,
} from '@mehfil/types';
import { and, count, desc, eq, gte, sql, sum } from 'drizzle-orm';

export interface NewOrderItem {
  menuItemId: string | null;
  itemNameSnapshot: string;
  unitPricePaise: number;
  quantity: number;
  notes: string | null;
}

export interface NewOrder {
  cafeId: string;
  orderNumber: string;
  source: 'counter' | 'qr' | 'phone';
  tableLabel: string | null;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  gstRateBp: number;
  items: NewOrderItem[];
}

export interface OrdersRepository {
  create(data: NewOrder): Promise<OrderWithItems>;
  listByCafe(cafeId: string, limit?: number): Promise<Order[]>;
  findByIdAndCafe(id: string, cafeId: string): Promise<OrderWithItems | null>;
  updateStatus(
    id: string,
    cafeId: string,
    status: OrderStatus,
  ): Promise<Order | null>;
  todayStats(cafeId: string): Promise<OrderStatsResponse>;
}

export function createDrizzleOrdersRepo(db: Database): OrdersRepository {
  return {
    async create(data) {
      // Wrap order + items in a transaction so a failed line insert rolls back
      // the order row.
      return db.transaction(async (tx) => {
        const [orderRow] = await tx
          .insert(schema.orders)
          .values({
            cafeId: data.cafeId,
            orderNumber: data.orderNumber,
            source: data.source,
            tableLabel: data.tableLabel,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            notes: data.notes,
            subtotalPaise: data.subtotalPaise,
            taxPaise: data.taxPaise,
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

    async updateStatus(id, cafeId, status) {
      const patch: { status: OrderStatus; paidAt?: string } = { status };
      if (status === 'completed') {
        patch.paidAt = new Date().toISOString();
      }

      const [row] = await db
        .update(schema.orders)
        .set(patch)
        .where(and(eq(schema.orders.id, id), eq(schema.orders.cafeId, cafeId)))
        .returning();
      return row ?? null;
    },

    async todayStats(cafeId) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();

      const [todayAgg, statusAgg] = await Promise.all([
        db
          .select({
            count: count(),
            revenue: sum(schema.orders.totalPaise),
          })
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.cafeId, cafeId),
              gte(schema.orders.createdAt, todayIso),
              eq(schema.orders.status, 'completed'),
            ),
          ),
        db
          .select({
            status: schema.orders.status,
            count: count(),
          })
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.cafeId, cafeId),
              gte(schema.orders.createdAt, todayIso),
            ),
          )
          .groupBy(schema.orders.status),
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

      return {
        todayCount: Number(todayAgg[0]?.count ?? 0),
        todayRevenuePaise: Number(todayAgg[0]?.revenue ?? 0),
        byStatus,
      };
    },
  };
}
