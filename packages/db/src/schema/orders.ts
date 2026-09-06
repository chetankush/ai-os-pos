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

export const paymentMethodValues = ['cash', 'upi', 'card', 'online'] as const;
export type PaymentMethod = (typeof paymentMethodValues)[number];

export const paymentStatusValues = [
  'unpaid',
  'pending',
  'paid',
  'failed',
  'refunded',
] as const;
export type PaymentStatus = (typeof paymentStatusValues)[number];

export const orders = pgTable(
  'orders',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    orderNumber: text().notNull(),
    status: text({ enum: orderStatusValues }).notNull().default('pending'),
    source: text({ enum: orderSourceValues }).notNull().default('counter'),

    tableLabel: text(),
    // Links the order to a table session (running tab) when ordered at a table.
    tableSessionId: uuid(),
    customerName: text(),
    customerPhone: text(),
    // B2B diners (corporate meals) need their GSTIN on the invoice to claim
    // input tax credit. Null for the ordinary walk-in.
    customerGstin: text(),
    notes: text(),

    // Money in paise (integer) for exactness. Indian POS convention.
    subtotalPaise: integer().notNull().default(0),
    // Bill-level adjustments (pre-tax discount; charges added to the taxable base).
    discountPaise: integer().notNull().default(0),
    discountReason: text(),
    serviceChargePaise: integer().notNull().default(0),
    packagingChargePaise: integer().notNull().default(0),
    taxPaise: integer().notNull().default(0),
    // Nearest-rupee rounding delta applied to reach the payable total (can be negative).
    roundOffPaise: integer().notNull().default(0),
    totalPaise: integer().notNull().default(0),

    // GST rate stored in basis points (500 = 5.00%, 1800 = 18.00%) so we
    // never lose precision if rates change in future.
    gstRateBp: integer().notNull().default(500),

    // How many times the customer bill has been printed. The first print is
    // the original; every later one is stamped DUPLICATE, so a reprinted bill
    // can never be passed off as the original during a cash audit.
    billPrintCount: integer().notNull().default(0),

    // How the bill was settled — recorded when the order is completed.
    paymentMethod: text({ enum: paymentMethodValues }),

    // Payment lifecycle for online (Razorpay) QR orders. Counter orders stay
    // 'unpaid' until completed-with-method, then flip to 'paid'.
    paymentStatus: text({ enum: paymentStatusValues }).notNull().default('unpaid'),
    // Razorpay order id (created when the diner starts payment) + payment id
    // (set after the signature is verified). Kept for reconciliation + audit.
    providerOrderId: text(),
    providerPaymentId: text(),

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
    // HSN/SAC frozen at order time too — a later menu correction must not
    // rewrite the code printed on an invoice already given to a customer.
    hsnSnapshot: text(),
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
