import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import type {
  CafeResponse,
  ExpenseListResponse,
  ExpenseSummaryResponse,
  OrderStatsResponse,
} from '@sangam/types';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExpensesView } from './expenses-view';

export const metadata = { title: 'Expenses · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
}

/** First day of the current IST month, and today, as YYYY-MM-DD. */
function currentIstMonthRange(): { from: string; to: string } {
  const IST_OFFSET_MS = 330 * 60 * 1000;
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const today = ist.toISOString().slice(0, 10);
  const from = `${today.slice(0, 7)}-01`;
  return { from, to: today };
}

export default async function ExpensesPage({ params }: PageProps) {
  const { id } = await params;
  const { from, to } = currentIstMonthRange();

  let cafeRes: CafeResponse;
  let listRes: ExpenseListResponse;
  let summaryRes: ExpenseSummaryResponse;
  let stats: OrderStatsResponse | null = null;
  try {
    [cafeRes, listRes, summaryRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<ExpenseListResponse>(`/cafes/${id}/expenses?from=${from}&to=${to}`),
      serverFetch<ExpenseSummaryResponse>(`/cafes/${id}/expenses/summary?from=${from}&to=${to}`),
    ]);
    // Revenue source is "today only" (see follow-up note in the report); a
    // failure here must not break the page, so isolate it.
    try {
      stats = await serverFetch<OrderStatsResponse>(`/cafes/${id}/orders/stats`);
    } catch {
      stats = null;
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const cafe = cafeRes.cafe;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link
          href={`/cafes/${cafe.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="size-3" />
          Back to dashboard
        </Link>
        <div className="mt-3 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Expenses</p>
          <h1 className="text-3xl font-semibold tracking-tight">{cafe.name}</h1>
          <p className="text-sm text-muted">
            Track operating costs and see a simple profit &amp; loss snapshot.
          </p>
        </div>
      </div>

      <ExpensesView
        cafeId={cafe.id}
        initialExpenses={listRes.expenses}
        initialSummary={summaryRes}
        initialFrom={from}
        initialTo={to}
        todayRevenuePaise={stats?.todayRevenuePaise ?? null}
      />
    </div>
  );
}
