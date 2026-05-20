import { type Database, schema } from '@sangam/db';
import type { Staff, StaffRole } from '@sangam/types';
import { and, asc, eq } from 'drizzle-orm';

export interface NewStaff {
  name: string;
  role: StaffRole;
  /** Pre-hashed PIN, or null. The route hashes the raw PIN before calling. */
  pinHash: string | null;
  isActive: boolean;
}

export interface UpdateStaff {
  name?: string;
  role?: StaffRole;
  /** Pre-hashed PIN, or null to clear it. Omit to leave unchanged. */
  pinHash?: string | null;
  isActive?: boolean;
}

export interface StaffRepository {
  list(cafeId: string): Promise<Staff[]>;
  create(cafeId: string, data: NewStaff): Promise<Staff>;
  findByIdAndCafe(id: string, cafeId: string): Promise<Staff | null>;
  update(id: string, cafeId: string, patch: UpdateStaff): Promise<Staff | null>;
  /** Returns true if a row was deleted, false if nothing matched. */
  delete(id: string, cafeId: string): Promise<boolean>;
}

/** Maps a DB row to the API shape — strips pinHash, exposes hasPin. */
function toStaff(row: schema.StaffRow): Staff {
  return {
    id: row.id,
    cafeId: row.cafeId,
    name: row.name,
    role: row.role,
    hasPin: row.pinHash !== null && row.pinHash !== '',
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createDrizzleStaffRepo(db: Database): StaffRepository {
  return {
    async list(cafeId) {
      const rows = await db
        .select()
        .from(schema.staff)
        .where(eq(schema.staff.cafeId, cafeId))
        .orderBy(asc(schema.staff.name));
      return rows.map(toStaff);
    },

    async create(cafeId, data) {
      const [row] = await db
        .insert(schema.staff)
        .values({ cafeId, ...data })
        .returning();
      if (!row) throw new Error('Failed to insert staff — empty returning() result');
      return toStaff(row);
    },

    async findByIdAndCafe(id, cafeId) {
      const [row] = await db
        .select()
        .from(schema.staff)
        .where(and(eq(schema.staff.id, id), eq(schema.staff.cafeId, cafeId)))
        .limit(1);
      return row ? toStaff(row) : null;
    },

    async update(id, cafeId, patch) {
      const [row] = await db
        .update(schema.staff)
        .set(patch)
        .where(and(eq(schema.staff.id, id), eq(schema.staff.cafeId, cafeId)))
        .returning();
      return row ? toStaff(row) : null;
    },

    async delete(id, cafeId) {
      const rows = await db
        .delete(schema.staff)
        .where(and(eq(schema.staff.id, id), eq(schema.staff.cafeId, cafeId)))
        .returning({ id: schema.staff.id });
      return rows.length > 0;
    },
  };
}
