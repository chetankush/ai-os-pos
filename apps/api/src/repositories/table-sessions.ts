import { type Database, schema } from '@sangam/db';
import type {
  OrderWithItems,
  PaymentMethod,
  RestaurantTable,
  TableLiveStatus,
  TableSession,
  TableSessionDetail,
  TableWithStatus,
} from '@sangam/types';
import { and, asc, eq, inArray } from 'drizzle-orm';

export interface NewTableSession {
  cafeId: string;
  tableId: string;
  guestName: string | null;
  guestPhone: string | null;
  partySize: number | null;
}

export interface TableSessionsRepository {
  open(data: NewTableSession): Promise<TableSession>;
  findOpenByTable(tableId: string, cafeId: string): Promise<TableSession | null>;
  findByIdAndCafe(id: string, cafeId: string): Promise<TableSession | null>;
  getDetail(id: string, cafeId: string): Promise<TableSessionDetail | null>;
  /** Every table for the cafe with its open session + derived live status. */
  floor(cafeId: string): Promise<TableWithStatus[]>;
  /**
   * Settle the whole tab in a transaction: mark every order completed + paid,
   * then close the session. Returns the post-settle detail (null if missing).
   */
  settle(
    id: string,
    cafeId: string,
    paymentMethod: PaymentMethod,
  ): Promise<TableSessionDetail | null>;
  /** Abandon an open session (no payment): close it, leave orders untouched. */
  close(id: string, cafeId: string): Promise<TableSession | null>;
}

/**
 * Live status from a session + its orders:
 *  - billed   → session.status === 'billed'
 *  - ready    → has orders AND every order is ready/completed
 *  - occupied → otherwise (open session)
 * (free is handled by the caller when there's no open session.)
 */
function deriveLiveStatus(session: TableSession, orders: { status: string }[]): TableLiveStatus {
  if (session.status === 'billed') return 'billed';
  if (orders.length > 0 && orders.every((o) => o.status === 'ready' || o.status === 'completed')) {
    return 'ready';
  }
  return 'occupied';
}

export function createDrizzleTableSessionsRepo(db: Database): TableSessionsRepository {
  async function ordersForSession(sessionId: string, cafeId: string): Promise<OrderWithItems[]> {
    const orderRows = await db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.tableSessionId, sessionId), eq(schema.orders.cafeId, cafeId)))
      .orderBy(asc(schema.orders.createdAt));

    if (orderRows.length === 0) return [];

    const ids = orderRows.map((o) => o.id);
    const itemRows = await db
      .select()
      .from(schema.orderItems)
      .where(inArray(schema.orderItems.orderId, ids));

    const byOrder = new Map<string, (typeof itemRows)[number][]>();
    for (const item of itemRows) {
      const list = byOrder.get(item.orderId) ?? [];
      list.push(item);
      byOrder.set(item.orderId, list);
    }
    return orderRows.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
  }

  function totals(orders: OrderWithItems[]): {
    subtotalPaise: number;
    taxPaise: number;
    totalPaise: number;
  } {
    return orders.reduce(
      (acc, o) => ({
        subtotalPaise: acc.subtotalPaise + o.subtotalPaise,
        taxPaise: acc.taxPaise + o.taxPaise,
        totalPaise: acc.totalPaise + o.totalPaise,
      }),
      { subtotalPaise: 0, taxPaise: 0, totalPaise: 0 },
    );
  }

  return {
    async open(data) {
      const [row] = await db
        .insert(schema.tableSessions)
        .values({
          cafeId: data.cafeId,
          tableId: data.tableId,
          guestName: data.guestName,
          guestPhone: data.guestPhone,
          partySize: data.partySize,
        })
        .returning();
      if (!row) throw new Error('Failed to insert table session');
      return row;
    },

    async findOpenByTable(tableId, cafeId) {
      const [row] = await db
        .select()
        .from(schema.tableSessions)
        .where(
          and(
            eq(schema.tableSessions.tableId, tableId),
            eq(schema.tableSessions.cafeId, cafeId),
            eq(schema.tableSessions.status, 'open'),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async findByIdAndCafe(id, cafeId) {
      const [row] = await db
        .select()
        .from(schema.tableSessions)
        .where(and(eq(schema.tableSessions.id, id), eq(schema.tableSessions.cafeId, cafeId)))
        .limit(1);
      return row ?? null;
    },

    async getDetail(id, cafeId) {
      const [session] = await db
        .select()
        .from(schema.tableSessions)
        .where(and(eq(schema.tableSessions.id, id), eq(schema.tableSessions.cafeId, cafeId)))
        .limit(1);
      if (!session) return null;

      const [table] = await db
        .select()
        .from(schema.restaurantTables)
        .where(eq(schema.restaurantTables.id, session.tableId))
        .limit(1);
      if (!table) return null;

      const orders = await ordersForSession(id, cafeId);
      return { session, table, orders, ...totals(orders) };
    },

    async floor(cafeId) {
      const [tables, openSessions] = await Promise.all([
        db
          .select()
          .from(schema.restaurantTables)
          .where(eq(schema.restaurantTables.cafeId, cafeId))
          .orderBy(asc(schema.restaurantTables.sortOrder), asc(schema.restaurantTables.label)),
        db
          .select()
          .from(schema.tableSessions)
          .where(
            and(eq(schema.tableSessions.cafeId, cafeId), eq(schema.tableSessions.status, 'open')),
          ),
      ]);

      // One open session per table (enforced at open()); index by tableId.
      const sessionByTable = new Map<string, TableSession>();
      for (const s of openSessions) sessionByTable.set(s.tableId, s);

      // Pull orders for all open sessions in one query, group by session.
      const sessionIds = openSessions.map((s) => s.id);
      const ordersBySession = new Map<string, { status: string; totalPaise: number }[]>();
      if (sessionIds.length > 0) {
        const orderRows = await db
          .select({
            tableSessionId: schema.orders.tableSessionId,
            status: schema.orders.status,
            totalPaise: schema.orders.totalPaise,
          })
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.cafeId, cafeId),
              inArray(schema.orders.tableSessionId, sessionIds),
            ),
          );
        for (const o of orderRows) {
          if (!o.tableSessionId) continue;
          const list = ordersBySession.get(o.tableSessionId) ?? [];
          list.push({ status: o.status, totalPaise: o.totalPaise });
          ordersBySession.set(o.tableSessionId, list);
        }
      }

      return tables.map((table): TableWithStatus => {
        const session = sessionByTable.get(table.id) ?? null;
        if (!session) {
          return {
            ...table,
            liveStatus: 'free',
            session: null,
            orderCount: 0,
            runningTotalPaise: 0,
          };
        }
        const sessionOrders = ordersBySession.get(session.id) ?? [];
        const runningTotalPaise = sessionOrders.reduce((sum, o) => sum + o.totalPaise, 0);
        return {
          ...table,
          liveStatus: deriveLiveStatus(session, sessionOrders),
          session,
          orderCount: sessionOrders.length,
          runningTotalPaise,
        };
      });
    },

    async settle(id, cafeId, paymentMethod) {
      const exists = await db
        .select({ id: schema.tableSessions.id })
        .from(schema.tableSessions)
        .where(and(eq(schema.tableSessions.id, id), eq(schema.tableSessions.cafeId, cafeId)))
        .limit(1);
      if (exists.length === 0) return null;

      const now = new Date().toISOString();
      await db.transaction(async (tx) => {
        await tx
          .update(schema.orders)
          .set({
            status: 'completed',
            paymentStatus: 'paid',
            paymentMethod,
            paidAt: now,
          })
          .where(eq(schema.orders.tableSessionId, id));

        await tx
          .update(schema.tableSessions)
          .set({ status: 'closed', closedAt: now })
          .where(and(eq(schema.tableSessions.id, id), eq(schema.tableSessions.cafeId, cafeId)));
      });

      return this.getDetail(id, cafeId);
    },

    async close(id, cafeId) {
      const [row] = await db
        .update(schema.tableSessions)
        .set({ status: 'closed', closedAt: new Date().toISOString() })
        .where(and(eq(schema.tableSessions.id, id), eq(schema.tableSessions.cafeId, cafeId)))
        .returning();
      return row ?? null;
    },
  };
}
