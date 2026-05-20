import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// NOTE: FKs declared at SQL level in the migration (see drizzle/migrations),
// matching the rest of the schema (the drizzle-kit CJS loader can't resolve
// cross-file .js imports in our ESM setup). See orders.ts / tables.ts.

export const staffRoleValues = ['owner', 'manager', 'cashier', 'waiter'] as const;
export type StaffRole = (typeof staffRoleValues)[number];

/**
 * A staff member belonging to a cafe. PIN login enforcement comes later —
 * for now we only STORE the hashed PIN (never the raw value). pinHash is
 * nullable so a member can exist before a PIN is assigned.
 */
export const staff = pgTable(
  'staff',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    name: text().notNull(),
    role: text({ enum: staffRoleValues }).notNull().default('waiter'),
    // Hash of the staff PIN (scrypt). Never store or return the raw PIN.
    pinHash: text(),
    isActive: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex('staff_cafe_name_idx').on(table.cafeId, table.name),
    index('staff_cafe_idx').on(table.cafeId),
  ],
);

export type StaffRow = typeof staff.$inferSelect;
export type StaffInsert = typeof staff.$inferInsert;
