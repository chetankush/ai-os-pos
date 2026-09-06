import { type Database, schema } from '@sangam/db';
import type { Expense, ExpenseCategory, ExpenseCategoryTotal } from '@sangam/types';
import { and, desc, eq, gte, lte, sql, sum } from 'drizzle-orm';

export interface CreateExpense {
  category: ExpenseCategory;
  amountPaise: number;
  note: string | null;
  incurredOn: string;
}

export interface UpdateExpense {
  category?: ExpenseCategory;
  amountPaise?: number;
  note?: string | null;
  incurredOn?: string;
}

export interface ExpensesRepository {
  /** Expenses for a cafe within [from, to] inclusive (YYYY-MM-DD), newest first. */
  list(cafeId: string, from: string, to: string): Promise<Expense[]>;
  create(cafeId: string, data: CreateExpense): Promise<Expense>;
  /** Updates an expense owned by the cafe; null if not found / not owned. */
  update(cafeId: string, id: string, data: UpdateExpense): Promise<Expense | null>;
  /** Deletes an expense owned by the cafe; true if a row was removed. */
  remove(cafeId: string, id: string): Promise<boolean>;
  /** Per-category totals (paise) within [from, to] inclusive. */
  summary(cafeId: string, from: string, to: string): Promise<ExpenseCategoryTotal[]>;
}

function toExpense(row: schema.ExpenseRow): Expense {
  return {
    id: row.id,
    cafeId: row.cafeId,
    category: row.category,
    amountPaise: row.amountPaise,
    note: row.note,
    incurredOn: row.incurredOn,
    createdAt: row.createdAt,
  };
}

export function createDrizzleExpensesRepo(db: Database): ExpensesRepository {
  return {
    async list(cafeId, from, to) {
      const rows = await db
        .select()
        .from(schema.expenses)
        .where(
          and(
            eq(schema.expenses.cafeId, cafeId),
            gte(schema.expenses.incurredOn, from),
            lte(schema.expenses.incurredOn, to),
          ),
        )
        // Newest business day first, then most-recently entered.
        .orderBy(desc(schema.expenses.incurredOn), desc(schema.expenses.createdAt));
      return rows.map(toExpense);
    },

    async create(cafeId, data) {
      const [row] = await db
        .insert(schema.expenses)
        .values({
          cafeId,
          category: data.category,
          amountPaise: data.amountPaise,
          note: data.note,
          incurredOn: data.incurredOn,
        })
        .returning();
      if (!row) throw new Error('Failed to create expense — empty returning() result');
      return toExpense(row);
    },

    async update(cafeId, id, data) {
      // Only assign provided fields so a partial PATCH leaves the rest intact.
      const patch: Partial<schema.ExpenseInsert> = {};
      if (data.category !== undefined) patch.category = data.category;
      if (data.amountPaise !== undefined) patch.amountPaise = data.amountPaise;
      if (data.note !== undefined) patch.note = data.note;
      if (data.incurredOn !== undefined) patch.incurredOn = data.incurredOn;

      if (Object.keys(patch).length === 0) {
        // Nothing to change — return the current row if it exists & is owned.
        const [row] = await db
          .select()
          .from(schema.expenses)
          .where(and(eq(schema.expenses.cafeId, cafeId), eq(schema.expenses.id, id)))
          .limit(1);
        return row ? toExpense(row) : null;
      }

      const [row] = await db
        .update(schema.expenses)
        .set(patch)
        .where(and(eq(schema.expenses.cafeId, cafeId), eq(schema.expenses.id, id)))
        .returning();
      return row ? toExpense(row) : null;
    },

    async remove(cafeId, id) {
      const rows = await db
        .delete(schema.expenses)
        .where(and(eq(schema.expenses.cafeId, cafeId), eq(schema.expenses.id, id)))
        .returning({ id: schema.expenses.id });
      return rows.length > 0;
    },

    async summary(cafeId, from, to) {
      const rows = await db
        .select({
          category: schema.expenses.category,
          totalPaise: sum(schema.expenses.amountPaise),
        })
        .from(schema.expenses)
        .where(
          and(
            eq(schema.expenses.cafeId, cafeId),
            gte(schema.expenses.incurredOn, from),
            lte(schema.expenses.incurredOn, to),
          ),
        )
        .groupBy(schema.expenses.category)
        .orderBy(desc(sql`sum(${schema.expenses.amountPaise})`));
      return rows.map((r) => ({
        category: r.category as ExpenseCategory,
        // sum() returns a numeric string (or null for empty groups).
        totalPaise: Number(r.totalPaise ?? 0),
      }));
    },
  };
}
