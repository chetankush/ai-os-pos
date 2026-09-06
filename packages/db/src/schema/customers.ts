import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// NOTE: FKs declared at SQL level in the migration (see drizzle/migrations),
// matching the rest of the schema (the drizzle-kit CJS loader can't resolve
// cross-file .js imports in our ESM setup). See orders.ts / staff.ts.

/**
 * A customer (CRM / loyalty foundation) belonging to a cafe. Identified by
 * phone within a cafe — one row per (cafeId, phone). Totals are denormalised
 * running aggregates maintained by `upsertFromOrder` at order-creation time
 * (integration deferred — see customers repo).
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    phone: text().notNull(),
    name: text(),
    // Money in paise (integer) for exactness. Indian POS convention.
    totalOrders: integer().notNull().default(0),
    totalSpentPaise: integer().notNull().default(0),
    lastOrderAt: timestamp({ withTimezone: true, mode: 'string' }),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('customers_cafe_phone_idx').on(table.cafeId, table.phone),
    index('customers_cafe_idx').on(table.cafeId),
  ],
);

export type CustomerRow = typeof customers.$inferSelect;
export type CustomerInsert = typeof customers.$inferInsert;
