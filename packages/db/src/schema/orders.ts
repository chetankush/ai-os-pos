import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// NOTE: FKs declared at SQL level in the migration (see drizzle/migrations).
// We avoid the drizzle references() helper because the drizzle-kit CJS loader
// cannot resolve cross-file .js imports in our ESM setup. See menu.ts.

export const orderStatusValues = [
  'pending',
  'preparing',
  'ready',
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof orderStatusValues)[number];

export const orderSourceValues = ['counter', 'qr', 'phone'] as const;
export type OrderSource = (typeof orderSourceValues)[number];

export const orders = pgTable(
  'orders',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    orderNumber: text().notNull(),
    status: text({ enum: orderStatusValues }).notNull().default('pending'),
    source: text({ enum: orderSourceValues }).notNull().default('counter'),

    tableLabel: text(),
    customerName: text(),
    customerPhone: text(),
    notes: text(),

    // Money in paise (integer) for exactness. Indian POS convention.
    subtotalPaise: integer().notNull().default(0),
    taxPaise: integer().notNull().default(0),
    totalPaise: integer().notNull().default(0),

    // GST rate stored in basis points (500 = 5.00%, 1800 = 18.00%) so we
    // never lose precision if rates change in future.
    gstRateBp: integer().notNull().default(500),

    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date().toISOString()),
    paidAt: timestamp({ withTimezone: true, mode: 'string' }),
  },
  (table) => [
    uniqueIndex('orders_cafe_order_number_idx').on(table.cafeId, table.orderNumber),
    index('orders_cafe_created_at_idx').on(table.cafeId, table.createdAt),
    index('orders_cafe_status_idx').on(table.cafeId, table.status),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid().notNull(),

    // Soft reference — kept for analytics but no FK so we can keep history
    // even if the menu item is later deleted.
    menuItemId: uuid(),

    // Snapshot fields — fixed at order time so menu edits don't change history.
    itemNameSnapshot: text().notNull(),
    unitPricePaise: integer().notNull(),
    quantity: integer().notNull(),
    lineTotalPaise: integer().notNull(),

    notes: text(),
  },
  (table) => [index('order_items_order_id_idx').on(table.orderId)],
);

export type OrderRow = typeof orders.$inferSelect;
export type OrderInsert = typeof orders.$inferInsert;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type OrderItemInsert = typeof orderItems.$inferInsert;
