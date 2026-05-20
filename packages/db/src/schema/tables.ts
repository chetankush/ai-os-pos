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

// NOTE: FKs declared at SQL level in the migration (see drizzle/migrations),
// matching the rest of the schema (the drizzle-kit CJS loader can't resolve
// cross-file .js imports in our ESM setup).

export const tableShapeValues = ['round', 'square'] as const;
export type TableShape = (typeof tableShapeValues)[number];

/** A physical table on the cafe's floor plan (position, shape, seats, area). */
export const restaurantTables = pgTable(
  'restaurant_tables',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    label: text().notNull(),
    // Free-text section, e.g. "Main Hall", "Patio", "Near Window", "AC".
    area: text(),
    shape: text({ enum: tableShapeValues }).notNull().default('square'),
    seats: integer().notNull().default(4),
    // Canvas coordinates for the drag-drop floor plan.
    x: integer().notNull().default(0),
    y: integer().notNull().default(0),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex('restaurant_tables_cafe_label_idx').on(table.cafeId, table.label),
    index('restaurant_tables_cafe_idx').on(table.cafeId),
  ],
);

export const tableSessionStatusValues = ['open', 'billed', 'closed'] as const;
export type TableSessionStatus = (typeof tableSessionStatusValues)[number];

/**
 * A running tab opened at a table. Multiple orders attach to one session
 * (orders.tableSessionId) and settle together as a single bill. At most one
 * 'open' session per table at a time (enforced in application code).
 */
export const tableSessions = pgTable(
  'table_sessions',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    tableId: uuid().notNull(),
    status: text({ enum: tableSessionStatusValues }).notNull().default('open'),
    guestName: text(),
    guestPhone: text(),
    partySize: integer(),
    openedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    closedAt: timestamp({ withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('table_sessions_cafe_status_idx').on(table.cafeId, table.status),
    index('table_sessions_table_idx').on(table.tableId),
  ],
);

export type RestaurantTableRow = typeof restaurantTables.$inferSelect;
export type RestaurantTableInsert = typeof restaurantTables.$inferInsert;
export type TableSessionRow = typeof tableSessions.$inferSelect;
export type TableSessionInsert = typeof tableSessions.$inferInsert;
