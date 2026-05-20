import { type Database, schema } from '@sangam/db';
import type { CashDrawerSession } from '@sangam/types';
import { and, eq } from 'drizzle-orm';

export interface OpenDrawer {
  openingFloatPaise: number;
  openedByStaffId: string | null;
  notes: string | null;
}

export interface CloseDrawer {
  closingCountedPaise: number;
  expectedCashPaise: number | null;
  notes: string | null;
}

export interface CashDrawerRepository {
  /** The currently-open session for the cafe, or null. */
  findOpen(cafeId: string): Promise<CashDrawerSession | null>;
  open(cafeId: string, data: OpenDrawer): Promise<CashDrawerSession>;
  /** Closes the open session for the cafe; returns it, or null if none open. */
  close(cafeId: string, data: CloseDrawer): Promise<CashDrawerSession | null>;
}

function toSession(row: schema.CashDrawerSessionRow): CashDrawerSession {
  return {
    id: row.id,
    cafeId: row.cafeId,
    openedByStaffId: row.openedByStaffId,
    openingFloatPaise: row.openingFloatPaise,
    closingCountedPaise: row.closingCountedPaise,
    expectedCashPaise: row.expectedCashPaise,
    status: row.status,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    notes: row.notes,
  };
}

export function createDrizzleCashDrawerRepo(db: Database): CashDrawerRepository {
  return {
    async findOpen(cafeId) {
      const [row] = await db
        .select()
        .from(schema.cashDrawerSessions)
        .where(
          and(
            eq(schema.cashDrawerSessions.cafeId, cafeId),
            eq(schema.cashDrawerSessions.status, 'open'),
          ),
        )
        .limit(1);
      return row ? toSession(row) : null;
    },

    async open(cafeId, data) {
      const [row] = await db
        .insert(schema.cashDrawerSessions)
        .values({
          cafeId,
          openingFloatPaise: data.openingFloatPaise,
          openedByStaffId: data.openedByStaffId,
          notes: data.notes,
          status: 'open',
        })
        .returning();
      if (!row) throw new Error('Failed to open cash drawer — empty returning() result');
      return toSession(row);
    },

    async close(cafeId, data) {
      const [row] = await db
        .update(schema.cashDrawerSessions)
        .set({
          status: 'closed',
          closingCountedPaise: data.closingCountedPaise,
          expectedCashPaise: data.expectedCashPaise,
          notes: data.notes,
          closedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(schema.cashDrawerSessions.cafeId, cafeId),
            eq(schema.cashDrawerSessions.status, 'open'),
          ),
        )
        .returning();
      return row ? toSession(row) : null;
    },
  };
}
