import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
// NOTE: cafes is referenced via raw SQL FK in the migration, not via the
// drizzle references() helper. The drizzle-kit CJS loader can't resolve `.js`
// imports between schema files in this ESM setup, so we declare FKs at the
// SQL level only. App code enforces cafe scoping via ownerId + cafeId checks.

export const menuCategories = pgTable(
  'menu_categories',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => [
    index('menu_categories_cafe_id_idx').on(table.cafeId),
    index('menu_categories_cafe_sort_idx').on(table.cafeId, table.sortOrder),
  ],
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    categoryId: uuid().notNull(),
    name: text().notNull(),
    description: text(),
    basePricePaise: integer().notNull(),
    /** HSN/SAC code used for GST filing (GSTR-1). Null = not yet classified. */
    hsnCode: text(),
    /**
     * Per-item GST rate in basis points (e.g. 1800 = 18%). When set, overrides
     * the cafe-level gstMode for this item. Null = use the cafe default.
     */
    gstRateBpOverride: integer(),
    imageUrl: text(),
    isVegetarian: boolean().notNull().default(true),
    isVegan: boolean().notNull().default(false),
    containsEgg: boolean().notNull().default(false),
    spiceLevel: integer().notNull().default(0),
    isAvailable: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => [
    index('menu_items_cafe_id_idx').on(table.cafeId),
    index('menu_items_cafe_category_idx').on(table.cafeId, table.categoryId),
    index('menu_items_cafe_available_idx').on(table.cafeId, table.isAvailable),
  ],
);

export const menuItemModifiers = pgTable(
  'menu_item_modifiers',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    itemId: uuid().notNull(),
    name: text().notNull(),
    selectionType: text({ enum: ['single', 'multi'] }).notNull(),
    isRequired: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
  },
  (table) => [index('menu_item_modifiers_item_id_idx').on(table.itemId)],
);

export const menuModifierOptions = pgTable(
  'menu_modifier_options',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    modifierId: uuid().notNull(),
    name: text().notNull(),
    priceDeltaPaise: integer().notNull().default(0),
    sortOrder: integer().notNull().default(0),
  },
  (table) => [index('menu_modifier_options_modifier_id_idx').on(table.modifierId)],
);

export type MenuCategoryRow = typeof menuCategories.$inferSelect;
export type MenuCategoryInsert = typeof menuCategories.$inferInsert;
export type MenuItemRow = typeof menuItems.$inferSelect;
export type MenuItemInsert = typeof menuItems.$inferInsert;
export type MenuItemModifierRow = typeof menuItemModifiers.$inferSelect;
export type MenuModifierOptionRow = typeof menuModifierOptions.$inferSelect;
