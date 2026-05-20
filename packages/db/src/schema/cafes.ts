import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const cafes = pgTable(
  'cafes',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    // Supabase auth user id of the owner. No hard FK to auth.users so this
    // schema is portable; application code enforces the link via JWT claims.
    ownerId: uuid().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    gstin: text(),
    fssai: text(),
    addressLine1: text().notNull(),
    addressLine2: text(),
    city: text().notNull(),
    state: text().notNull(),
    pincode: text().notNull(),
    isAirConditioned: boolean().notNull().default(false),
    primaryColor: text(),
    logoUrl: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex('cafes_slug_idx').on(table.slug),
    index('cafes_owner_id_idx').on(table.ownerId),
  ],
);

export type CafeRow = typeof cafes.$inferSelect;
export type CafeInsert = typeof cafes.$inferInsert;
