import { schema, type Database } from '@sangam/db';
import type { Cafe } from '@sangam/types';
import { and, desc, eq } from 'drizzle-orm';

export interface NewCafe {
  ownerId: string;
  name: string;
  slug: string;
  gstin: string | null;
  fssai: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  isAirConditioned: boolean;
  primaryColor: string | null;
  logoUrl: string | null;
}

export interface CafesRepository {
  create(data: NewCafe): Promise<Cafe>;
  listByOwner(ownerId: string): Promise<Cafe[]>;
  findByIdAndOwner(id: string, ownerId: string): Promise<Cafe | null>;
}

export function createDrizzleCafesRepo(db: Database): CafesRepository {
  return {
    async create(data) {
      const [row] = await db.insert(schema.cafes).values(data).returning();
      if (!row) throw new Error('Failed to insert cafe — empty returning() result');
      return row;
    },

    async listByOwner(ownerId) {
      return db
        .select()
        .from(schema.cafes)
        .where(eq(schema.cafes.ownerId, ownerId))
        .orderBy(desc(schema.cafes.createdAt));
    },

    async findByIdAndOwner(id, ownerId) {
      const [row] = await db
        .select()
        .from(schema.cafes)
        .where(and(eq(schema.cafes.id, id), eq(schema.cafes.ownerId, ownerId)))
        .limit(1);
      return row ?? null;
    },
  };
}
