/**
 * Expense tracking + P&L domain types and API request/response envelopes.
 * Kept independent of database concerns — these are the API/UI shapes. Money
 * is integer paise throughout. `incurredOn` is a YYYY-MM-DD IST business date.
 */

import type { CafeId } from './domain.js';

export type ExpenseCategory = 'rent' | 'salary' | 'supplies' | 'utilities' | 'marketing' | 'other';

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'rent',
  'salary',
  'supplies',
  'utilities',
  'marketing',
  'other',
];

export interface Expense {
  id: string;
  cafeId: CafeId;
  category: ExpenseCategory;
  amountPaise: number;
  note: string | null;
  /** Business date the expense applies to (YYYY-MM-DD, IST). */
  incurredOn: string;
  createdAt: string;
}

// ─── Requests ─────────────────────────────────────────────────────────────

export interface CreateExpenseRequest {
  category: ExpenseCategory;
  amountPaise: number;
  note?: string;
  /** YYYY-MM-DD. */
  incurredOn: string;
}

export interface UpdateExpenseRequest {
  category?: ExpenseCategory;
  amountPaise?: number;
  note?: string | null;
  /** YYYY-MM-DD. */
  incurredOn?: string;
}

// ─── Responses ──────────────────────────────────────────────────────────────

export interface ExpenseResponse {
  expense: Expense;
}

export interface ExpenseListResponse {
  expenses: Expense[];
  /** The effective date range applied (YYYY-MM-DD), echoed back. */
  from: string;
  to: string;
}

/** A single category's total within the summary window (paise). */
export interface ExpenseCategoryTotal {
  category: ExpenseCategory;
  totalPaise: number;
}

export interface ExpenseSummaryResponse {
  from: string;
  to: string;
  byCategory: ExpenseCategoryTotal[];
  /** Sum across every category (paise). */
  grandTotalPaise: number;
}
