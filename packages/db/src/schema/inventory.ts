import { sql } from 'drizzle-orm';
import { index, integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// NOTE: FKs (cafeId → cafes.id, menuItemId → menu_items.id) are declared at the
// SQL level in the migration, NOT via the drizzle references() helper — matching
// the rest of the schema. The drizzle-kit CJS loader can't resolve cross-file
// `.js` imports in this ESM setup. App code enforces cafe scoping via cafeId.

/**
 * Per-menu-item stock tracking. One row per menu item that the cafe chooses to
 * track. A NULL stockQty means the item is "untracked" (sells without limit);
 * a NULL lowStockThreshold disables low-stock warnings for that item.
 *
 * Kept in a separate table (rather than columns on menu_items) so the menu read
 * path stays lean and stock writes don't churn the menu rows.
 */
export const menuItemStock = pgTable(
  'menu_item_stock',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    menuItemId: uuid().notNull(),
    // NULL = untracked (no quantity limit). 0 = out of stock.
    stockQty: integer(),
    // NULL = no low-stock warning configured for this item.
    lowStockThreshold: integer(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex('menu_item_stock_menu_item_idx').on(table.menuItemId),
    index('menu_item_stock_cafe_idx').on(table.cafeId),
  ],
);

export type MenuItemStockRow = typeof menuItemStock.$inferSelect;
export type MenuItemStockInsert = typeof menuItemStock.$inferInsert;
