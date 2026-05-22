import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// NOTE: FKs declared at SQL level in the migration (see drizzle/migrations).
// Inlined (not imported from ./orders) because drizzle-kit's CJS loader can't
// resolve our ESM `.js` cross-imports — must mirror orders.paymentMethodValues.
const paymentMethodValues = ['cash', 'upi', 'card', 'online'] as const;

export const orderPaymentKindValues = ['payment', 'refund'] as const;
export type OrderPaymentKind = (typeof orderPaymentKindValues)[number];

/**
 * Tender ledger for an order — one row per payment or refund. Used for split
 * tender (e.g. part cash + part UPI) and refunds. Single-method counter
 * settlements stay on orders.paymentMethod; this table records the breakdown
 * when more than one method (or a refund) is involved.
 *   kind='payment' → amountPaise is money taken in
 *   kind='refund'  → amountPaise is the (positive) magnitude refunded
 */
export const orderPayments = pgTable(
  'order_payments',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    orderId: uuid().notNull(),
    kind: text({ enum: orderPaymentKindValues }).notNull().default('payment'),
    method: text({ enum: paymentMethodValues }).notNull(),
    amountPaise: integer().notNull(),
    reason: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    index('order_payments_order_idx').on(table.orderId),
    index('order_payments_cafe_created_at_idx').on(table.cafeId, table.createdAt),
  ],
);

export type OrderPaymentRow = typeof orderPayments.$inferSelect;
export type OrderPaymentInsert = typeof orderPayments.$inferInsert;
