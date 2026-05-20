import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// NOTE: FKs declared at SQL level in the migration (see drizzle/migrations).

export const cashDrawerStatusValues = ['open', 'closed'] as const;
export type CashDrawerStatus = (typeof cashDrawerStatusValues)[number];

/**
 * A cash-drawer / shift session: opened with a starting float, closed with a
 * counted total. We record the expected cash at close so the variance
 * (counted − expected) is auditable. At most one 'open' session per cafe at a
 * time (enforced in application code). Money is integer paise.
 */
export const cashDrawerSessions = pgTable(
  'cash_drawer_sessions',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    openedByStaffId: uuid(),
    // Starting cash placed in the drawer.
    openingFloatPaise: integer().notNull().default(0),
    // Physically counted cash at close (set on close).
    closingCountedPaise: integer(),
    // What the system expected to be in the drawer at close (set on close).
    expectedCashPaise: integer(),
    status: text({ enum: cashDrawerStatusValues }).notNull().default('open'),
    openedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    closedAt: timestamp({ withTimezone: true, mode: 'string' }),
    notes: text(),
  },
  (table) => [index('cash_drawer_sessions_cafe_status_idx').on(table.cafeId, table.status)],
);

export type CashDrawerSessionRow = typeof cashDrawerSessions.$inferSelect;
export type CashDrawerSessionInsert = typeof cashDrawerSessions.$inferInsert;
