import { type Database, schema } from '@sangam/db';
import type { RestaurantTable, TableShape } from '@sangam/types';
import { and, asc, eq } from 'drizzle-orm';

export interface NewTable {
  label: string;
  area: string | null;
  shape: TableShape;
  seats: number;
  x: number;
  y: number;
  sortOrder: number;
}

export interface UpdateTable {
  label?: string;
  area?: string | null;
  shape?: TableShape;
  seats?: number;
  x?: number;
  y?: number;
  sortOrder?: number;
}

export interface TablesRepository {
  list(cafeId: string): Promise<RestaurantTable[]>;
  create(cafeId: string, data: NewTable): Promise<RestaurantTable>;
  findByIdAndCafe(id: string, cafeId: string): Promise<RestaurantTable | null>;
  update(id: string, cafeId: string, patch: UpdateTable): Promise<RestaurantTable | null>;
  /** Returns true if a row was deleted, false if nothing matched. */
  delete(id: string, cafeId: string): Promise<boolean>;
}

export function createDrizzleTablesRepo(db: Database): TablesRepository {
  return {
    async list(cafeId) {
      return db
        .select()
        .from(schema.restaurantTables)
        .where(eq(schema.restaurantTables.cafeId, cafeId))
        .orderBy(asc(schema.restaurantTables.sortOrder), asc(schema.restaurantTables.label));
    },

    async create(cafeId, data) {
      const [row] = await db
        .insert(schema.restaurantTables)
        .values({ cafeId, ...data })
        .returning();
      if (!row) throw new Error('Failed to insert table — empty returning() result');
      return row;
    },

    async findByIdAndCafe(id, cafeId) {
      const [row] = await db
        .select()
        .from(schema.restaurantTables)
        .where(and(eq(schema.restaurantTables.id, id), eq(schema.restaurantTables.cafeId, cafeId)))
        .limit(1);
      return row ?? null;
    },

    async update(id, cafeId, patch) {
      const [row] = await db
        .update(schema.restaurantTables)
        .set(patch)
        .where(and(eq(schema.restaurantTables.id, id), eq(schema.restaurantTables.cafeId, cafeId)))
        .returning();
      return row ?? null;
    },

    async delete(id, cafeId) {
      const rows = await db
        .delete(schema.restaurantTables)
        .where(and(eq(schema.restaurantTables.id, id), eq(schema.restaurantTables.cafeId, cafeId)))
        .returning({ id: schema.restaurantTables.id });
      return rows.length > 0;
    },
  };
}
