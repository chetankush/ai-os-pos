'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type {
  Expense,
  ExpenseCategory,
  ExpenseListResponse,
  ExpenseSummaryResponse,
} from '@sangam/types';
import { EXPENSE_CATEGORIES } from '@sangam/types';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: 'Rent',
  salary: 'Salary',
  supplies: 'Supplies',
  utilities: 'Utilities',
  marketing: 'Marketing',
  other: 'Other',
};

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

async function authedHeaders(): Promise<Record<string, string>> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    'content-type': 'application/json',
    ...(session ? { authorization: `Bearer ${session.access_token}` } : {}),
  };
}

interface Props {
  cafeId: string;
  initialExpenses: Expense[];
  initialSummary: ExpenseSummaryResponse;
  initialFrom: string;
  initialTo: string;
  todayRevenuePaise: number | null;
}

export function ExpensesView({
  cafeId,
  initialExpenses,
  initialSummary,
  initialFrom,
  initialTo,
  todayRevenuePaise,
}: Props) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [summary, setSummary] = useState<ExpenseSummaryResponse>(initialSummary);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  // Add-expense form
  const [category, setCategory] = useState<ExpenseCategory>('supplies');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [incurredOn, setIncurredOn] = useState(initialTo);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function reload(rangeFrom = from, rangeTo = to) {
    const headers = await authedHeaders();
    const [listRes, sumRes] = await Promise.all([
      fetch(`${API_URL}/cafes/${cafeId}/expenses?from=${rangeFrom}&to=${rangeTo}`, {
        headers,
        cache: 'no-store',
      }),
      fetch(`${API_URL}/cafes/${cafeId}/expenses/summary?from=${rangeFrom}&to=${rangeTo}`, {
        headers,
        cache: 'no-store',
      }),
    ]);
    if (listRes.ok) setExpenses(((await listRes.json()) as ExpenseListResponse).expenses);
    if (sumRes.ok) setSummary((await sumRes.json()) as ExpenseSummaryResponse);
  }

  async function addExpense() {
    const amountPaise = Math.round((Number(amount) || 0) * 100);
    if (amountPaise <= 0) {
      toast.error('Enter an amount');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/cafes/${cafeId}/expenses`, {
        method: 'POST',
        headers: await authedHeaders(),
        body: JSON.stringify({
          category,
          amountPaise,
          incurredOn,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(data?.error?.message ?? `Failed (${res.status})`);
      }
      toast.success(`Added ${rupees(amountPaise)} · ${CATEGORY_LABELS[category]}`);
      setAmount('');
      setNote('');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add expense');
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`${API_URL}/cafes/${cafeId}/expenses/${id}`, {
        method: 'DELETE',
        headers: await authedHeaders(),
      });
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(data?.error?.message ?? `Failed (${res.status})`);
      }
      toast.success('Expense deleted');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete expense');
    } finally {
      setDeletingId(null);
    }
  }

  // Today's P&L snapshot — revenue is today-only (API limitation), so the
  // net is scoped to today to keep the comparison honest.
  const todayExpensesPaise = expenses
    .filter((e) => e.incurredOn === initialTo)
    .reduce((s, e) => s + e.amountPaise, 0);
  const netTodayPaise = todayRevenuePaise !== null ? todayRevenuePaise - todayExpensesPaise : null;

  return (
    <div className="space-y-8">
      {/* Today P&L snapshot */}
      {todayRevenuePaise !== null && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Today's snapshot</h2>
            <span className="text-[11px] uppercase tracking-wider text-muted">Today only</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Stat label="Revenue" value={rupees(todayRevenuePaise)} tone="success" />
            <Stat label="Expenses" value={rupees(todayExpensesPaise)} tone="danger" />
            <Stat
              label="Net"
              value={netTodayPaise !== null ? rupees(netTodayPaise) : '—'}
              tone={netTodayPaise !== null && netTodayPaise < 0 ? 'danger' : 'fg'}
            />
          </div>
        </Card>
      )}

      {/* Add expense */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Add expense</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg focus:ring-offset-2 focus:ring-offset-bg"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Amount ₹
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm tabular-nums focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg focus:ring-offset-2 focus:ring-offset-bg"
            />
          </label>
          <label className="text-xs text-muted">
            Date
            <input
              type="date"
              value={incurredOn}
              onChange={(e) => setIncurredOn(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm tabular-nums focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg focus:ring-offset-2 focus:ring-offset-bg"
            />
          </label>
          <label className="text-xs text-muted">
            Note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="optional"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg focus:ring-offset-2 focus:ring-offset-bg"
            />
          </label>
        </div>
        <Button
          type="button"
          onClick={addExpense}
          loading={saving}
          disabled={saving}
          className="mt-4"
        >
          {!saving && <Plus className="size-4" />}
          Add expense
        </Button>
      </Card>

      {/* Period filter + summary */}
      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-sm font-semibold">By category</h2>
          <div className="flex items-end gap-2">
            <label className="text-xs text-muted">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 h-9 rounded-lg border border-border bg-bg px-2 text-sm tabular-nums focus:border-fg focus:outline-none"
              />
            </label>
            <label className="text-xs text-muted">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 h-9 rounded-lg border border-border bg-bg px-2 text-sm tabular-nums focus:border-fg focus:outline-none"
              />
            </label>
            <Button type="button" variant="secondary" size="sm" onClick={() => reload(from, to)}>
              Apply
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {summary.byCategory.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No expenses in this period.</p>
          ) : (
            summary.byCategory.map((row) => (
              <div
                key={row.category}
                className="flex items-center justify-between border-b border-border py-2 last:border-0"
              >
                <span className="text-sm">{CATEGORY_LABELS[row.category]}</span>
                <span className="text-sm font-medium tabular-nums">{rupees(row.totalPaise)}</span>
              </div>
            ))
          )}
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-sm font-semibold tabular-nums">
              {rupees(summary.grandTotalPaise)}
            </span>
          </div>
        </div>
      </Card>

      {/* Expense list */}
      <div className="space-y-2">
        <h2 className="px-1 text-sm font-semibold">
          Expenses{' '}
          <span className="font-normal text-muted">
            ({expenses.length} · {from} → {to})
          </span>
        </h2>
        {expenses.length === 0 ? (
          <Card className="border-dashed p-8 text-center text-sm text-muted">
            No expenses recorded in this period.
          </Card>
        ) : (
          expenses.map((e) => (
            <Card key={e.id} className="flex items-center gap-4 p-3.5">
              <span className="rounded-full border border-border bg-subtle px-2 py-0.5 text-[11px] font-medium text-muted">
                {CATEGORY_LABELS[e.category]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{e.note ?? CATEGORY_LABELS[e.category]}</p>
                <p className="text-xs tabular-nums text-muted">{e.incurredOn}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums">{rupees(e.amountPaise)}</span>
              <button
                type="button"
                aria-label="Delete expense"
                disabled={deletingId === e.id}
                onClick={() => deleteExpense(e.id)}
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-danger/5 hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'fg' | 'success' | 'danger';
}) {
  const toneClass =
    tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-fg';
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}
