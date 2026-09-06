import { sql } from 'drizzle-orm';
import { date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// NOTE: FKs declared at SQL level in the migration (see drizzle/migrations).

export const expenseCategoryValues = [
  'rent',
  'salary',
  'supplies',
  'utilities',
  'marketing',
  'other',
] as const;
export type ExpenseCategory = (typeof expenseCategoryValues)[number];

/**
 * An operating expense for a cafe — rent, salaries, supplies, etc. Money is
 * integer paise. `incurredOn` is the business date the expense applies to
 * (a plain DATE so reports filter by IST calendar day without timezone math),
 * while `createdAt` records when the row was entered.
 */
export const expenses = pgTable(
  'expenses',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    category: text({ enum: expenseCategoryValues }).notNull(),
    amountPaise: integer().notNull(),
    note: text(),
    // The date the expense was incurred (YYYY-MM-DD, IST business day).
    incurredOn: date({ mode: 'string' }).notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [index('expenses_cafe_incurred_on_idx').on(table.cafeId, table.incurredOn)],
);

export type ExpenseRow = typeof expenses.$inferSelect;
export type ExpenseInsert = typeof expenses.$inferInsert;
