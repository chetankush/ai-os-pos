import { schema, type Database } from '@sangam/db';
import type { MenuCategory, MenuCategoryWithItems, MenuItem } from '@sangam/types';
import { and, asc, eq } from 'drizzle-orm';

export interface NewMenuCategory {
  cafeId: string;
  name: string;
  sortOrder: number;
}

export interface NewMenuItem {
  cafeId: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePricePaise: number;
  imageUrl: string | null;
  isVegetarian: boolean;
  isVegan: boolean;
  containsEgg: boolean;
  spiceLevel: number;
  sortOrder: number;
}

export interface UpdateMenuItem {
  name?: string;
  description?: string | null;
  basePricePaise?: number;
  imageUrl?: string | null;
  isVegetarian?: boolean;
  isVegan?: boolean;
  containsEgg?: boolean;
  spiceLevel?: number;
  isAvailable?: boolean;
  sortOrder?: number;
  categoryId?: string;
}

export interface MenuRepository {
  getFullMenu(cafeId: string): Promise<MenuCategoryWithItems[]>;
  /** True iff the category exists AND belongs to the given cafe. */
  categoryExists(categoryId: string, cafeId: string): Promise<boolean>;
  createCategory(data: NewMenuCategory): Promise<MenuCategory>;
  createItem(data: NewMenuItem): Promise<MenuItem>;
  updateItem(
    itemId: string,
    cafeId: string,
    patch: UpdateMenuItem,
  ): Promise<MenuItem | null>;
  deleteItem(itemId: string, cafeId: string): Promise<boolean>;
}

export function createDrizzleMenuRepo(db: Database): MenuRepository {
  return {
    async getFullMenu(cafeId) {
      const [categories, items] = await Promise.all([
        db
          .select()
          .from(schema.menuCategories)
          .where(eq(schema.menuCategories.cafeId, cafeId))
          .orderBy(asc(schema.menuCategories.sortOrder), asc(schema.menuCategories.name)),
        db
          .select()
          .from(schema.menuItems)
          .where(eq(schema.menuItems.cafeId, cafeId))
          .orderBy(asc(schema.menuItems.sortOrder), asc(schema.menuItems.name)),
      ]);

      const itemsByCategory = new Map<string, MenuItem[]>();
      for (const item of items) {
        const list = itemsByCategory.get(item.categoryId) ?? [];
        list.push(item);
        itemsByCategory.set(item.categoryId, list);
      }

      return categories.map((cat) => ({
        ...cat,
        items: itemsByCategory.get(cat.id) ?? [],
      }));
    },

    async categoryExists(categoryId, cafeId) {
      const [row] = await db
        .select({ id: schema.menuCategories.id })
        .from(schema.menuCategories)
        .where(
          and(
            eq(schema.menuCategories.id, categoryId),
            eq(schema.menuCategories.cafeId, cafeId),
          ),
        )
        .limit(1);
      return row != null;
    },

    async createCategory(data) {
      const [row] = await db.insert(schema.menuCategories).values(data).returning();
      if (!row) throw new Error('Failed to insert menu category');
      return row;
    },

    async createItem(data) {
      const [row] = await db.insert(schema.menuItems).values(data).returning();
      if (!row) throw new Error('Failed to insert menu item');
      return row;
    },

    async updateItem(itemId, cafeId, patch) {
      const [row] = await db
        .update(schema.menuItems)
        .set(patch)
        .where(and(eq(schema.menuItems.id, itemId), eq(schema.menuItems.cafeId, cafeId)))
        .returning();
      return row ?? null;
    },

    async deleteItem(itemId, cafeId) {
      const rows = await db
        .delete(schema.menuItems)
        .where(and(eq(schema.menuItems.id, itemId), eq(schema.menuItems.cafeId, cafeId)))
        .returning({ id: schema.menuItems.id });
      return rows.length > 0;
    },
  };
}
