import { type Database, schema } from '@sangam/db';
import type { Customer, Order } from '@sangam/types';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';

export interface CustomersRepository {
  /** All customers for a cafe; optional fuzzy match on name OR phone. */
  listByCafe(cafeId: string, search?: string): Promise<Customer[]>;
  findByIdAndCafe(id: string, cafeId: string): Promise<Customer | null>;
  /** Recent orders for a customer's phone, newest first. Read-only. */
  recentOrdersByPhone(cafeId: string, phone: string, limit?: number): Promise<Order[]>;
  /**
   * Records an order against a customer: inserts the row if new, otherwise
   * increments lifetime totals and bumps lastOrderAt. Idempotent per call —
   * the (cafeId, phone) unique index guarantees a single row.
   *
   * DEFERRED INTEGRATION: not yet wired into order creation. The order-creation
   * flow (apps/api/src/routes/orders.ts) should call this after a successful
   * order insert when customerPhone is present.
   */
  upsertFromOrder(
    cafeId: string,
    phone: string,
    name: string | null,
    amountPaise: number,
  ): Promise<Customer>;
}

function toCustomer(row: schema.CustomerRow): Customer {
  return {
    id: row.id,
    cafeId: row.cafeId,
    phone: row.phone,
    name: row.name,
    totalOrders: row.totalOrders,
    totalSpentPaise: row.totalSpentPaise,
    lastOrderAt: row.lastOrderAt,
    createdAt: row.createdAt,
  };
}

export function createDrizzleCustomersRepo(db: Database): CustomersRepository {
  return {
    async listByCafe(cafeId, search) {
      const conditions = [eq(schema.customers.cafeId, cafeId)];
      const term = search?.trim();
      if (term) {
        const like = `%${term}%`;
        const match = or(ilike(schema.customers.name, like), ilike(schema.customers.phone, like));
        if (match) conditions.push(match);
      }
      const rows = await db
        .select()
        .from(schema.customers)
        .where(and(...conditions))
        // Most-recent visitors first; never-ordered (null) sort last by name.
        .orderBy(desc(schema.customers.lastOrderAt), asc(schema.customers.name));
      return rows.map(toCustomer);
    },

    async findByIdAndCafe(id, cafeId) {
      const [row] = await db
        .select()
        .from(schema.customers)
        .where(and(eq(schema.customers.id, id), eq(schema.customers.cafeId, cafeId)))
        .limit(1);
      return row ? toCustomer(row) : null;
    },

    async recentOrdersByPhone(cafeId, phone, limit = 20) {
      return db
        .select()
        .from(schema.orders)
        .where(and(eq(schema.orders.cafeId, cafeId), eq(schema.orders.customerPhone, phone)))
        .orderBy(desc(schema.orders.createdAt))
        .limit(limit);
    },

    async upsertFromOrder(cafeId, phone, name, amountPaise) {
      const now = new Date().toISOString();
      const [row] = await db
        .insert(schema.customers)
        .values({
          cafeId,
          phone,
          name,
          totalOrders: 1,
          totalSpentPaise: amountPaise,
          lastOrderAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.customers.cafeId, schema.customers.phone],
          set: {
            totalOrders: sql`${schema.customers.totalOrders} + 1`,
            totalSpentPaise: sql`${schema.customers.totalSpentPaise} + ${amountPaise}`,
            lastOrderAt: now,
            // Only fill in the name if we don't already have one.
            name: sql`coalesce(${schema.customers.name}, ${name})`,
          },
        })
        .returning();
      if (!row) throw new Error('Failed to upsert customer — empty returning() result');
      return toCustomer(row);
    },
  };
}
