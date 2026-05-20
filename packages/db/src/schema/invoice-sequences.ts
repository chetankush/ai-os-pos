import { integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// NOTE: FKs declared at SQL level in the migration (see drizzle/migrations),
// matching the rest of the schema (the drizzle-kit CJS loader can't resolve
// cross-file .js imports in our ESM setup).

/**
 * Gapless, per-financial-year invoice sequence counter, one row per
 * (cafe, financial year). Indian GST law (CGST Rule 46(b)) requires invoice
 * numbers to be a CONSECUTIVE serial that is unique per outlet per FY with NO
 * gaps. The sequence is allocated inside the order-creation transaction with an
 * atomic `INSERT ... ON CONFLICT DO UPDATE SET last_seq = last_seq + 1
 * RETURNING last_seq`, so concurrent terminals never duplicate or skip a number.
 */
export const invoiceSequences = pgTable(
  'invoice_sequences',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    // Indian financial year label, e.g. '2026-27' (Apr 1 2026 – Mar 31 2027).
    fy: text().notNull(),
    // Last serial number issued for this (cafe, fy). The next bill is +1.
    lastSeq: integer().notNull().default(0),
  },
  (table) => [uniqueIndex('invoice_sequences_cafe_fy_idx').on(table.cafeId, table.fy)],
);

export type InvoiceSequenceRow = typeof invoiceSequences.$inferSelect;
export type InvoiceSequenceInsert = typeof invoiceSequences.$inferInsert;
