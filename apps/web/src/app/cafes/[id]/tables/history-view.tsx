'use client';

import type { PaymentMethod, TableHistory, TableHistorySession } from '@sangam/types';
import { ChevronDown, History, Receipt, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { authedFetch, formatRupees } from './tables-tool';

interface Props {
  cafeId: string;
}

const PAY_LABEL: Record<PaymentMethod, string> = {
  upi: 'UPI',
  cash: 'Cash',
  card: 'Card',
  online: 'Online',
};

const DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function formatWhen(iso: string | null): string {
  return iso ? DATE_FMT.format(new Date(iso)) : '—';
}

export function HistoryView({ cafeId }: Props) {
  const [data, setData] = useState<TableHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    authedFetch<TableHistory>(`/cafes/${cafeId}/table-sessions/history`)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load history');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cafeId]);

  const sessions = useMemo(() => {
    if (!data) return [];
    return tableFilter ? data.sessions.filter((s) => s.tableId === tableFilter) : data.sessions;
  }, [data, tableFilter]);

  const grandTotalPaise = useMemo(
    () => (data ? data.tables.reduce((sum, t) => sum + t.totalBilledPaise, 0) : 0),
    [data],
  );

  if (loading) return <HistorySkeleton />;

  if (error) {
    return (
      <Card className="p-8 text-center border-dashed">
        <p className="text-sm text-danger">{error}</p>
      </Card>
    );
  }

  if (!data || data.sessions.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed">
        <div className="mx-auto size-12 rounded-lg bg-subtle border border-border grid place-items-center">
          <History className="size-5 text-muted" />
        </div>
        <h3 className="mt-4 font-medium">No settled sessions yet</h3>
        <p className="mt-1 text-sm text-muted">
          Once you settle a table, what it ordered and was billed shows up here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Grand total */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">By table</p>
        <p className="text-sm text-muted">
          <span className="font-semibold text-fg tabular-nums">
            {formatRupees(grandTotalPaise)}
          </span>{' '}
          billed across {data.sessions.length}{' '}
          {data.sessions.length === 1 ? 'session' : 'sessions'}
        </p>
      </div>

      {/* Per-table totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.tables.map((t) => {
          const selected = tableFilter === t.tableId;
          return (
            <button
              key={t.tableId}
              type="button"
              aria-pressed={selected}
              onClick={() => setTableFilter(selected ? null : t.tableId)}
              className={cn(
                'flex min-h-[6.5rem] flex-col justify-between rounded-xl border p-3.5 text-left',
                'transition-all duration-150 active:scale-[0.98] touch-manipulation',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                selected
                  ? 'border-accent ring-2 ring-accent bg-accent/5'
                  : 'border-border bg-bg hover:border-border-strong',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold tracking-tight">{t.label}</span>
                {t.area && (
                  <span className="truncate text-[10px] text-muted">{t.area}</span>
                )}
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  {formatRupees(t.totalBilledPaise)}
                </p>
                <p className="text-[11px] text-muted tabular-nums">
                  {t.sessionCount} {t.sessionCount === 1 ? 'session' : 'sessions'}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Sessions drill-down */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {tableFilter
              ? `${data.tables.find((t) => t.tableId === tableFilter)?.label ?? 'Table'} sessions`
              : 'All sessions'}
          </p>
          {tableFilter && (
            <button
              type="button"
              onClick={() => setTableFilter(null)}
              className="text-xs font-medium text-accent hover:opacity-80 transition-opacity"
            >
              Show all
            </button>
          )}
        </div>

        <div className="space-y-2">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: TableHistorySession }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-3 p-3.5 text-left',
          'transition-colors hover:bg-subtle/60 touch-manipulation',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg',
        )}
      >
        <span className="inline-flex shrink-0 items-center rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
          {session.tableLabel}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {session.guestName?.trim() || 'Guest'}
            {session.partySize ? (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] font-normal text-muted">
                <Users className="size-3" aria-hidden /> {session.partySize}
              </span>
            ) : null}
          </p>
          <p className="truncate text-[11px] text-muted">{formatWhen(session.closedAt)}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">
              {formatRupees(session.totalPaise)}
            </p>
            <div className="mt-0.5 flex items-center justify-end gap-1">
              {session.paymentMethods.map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-border bg-subtle px-1.5 py-px text-[10px] font-medium text-muted"
                >
                  {PAY_LABEL[m]}
                </span>
              ))}
            </div>
          </div>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted transition-transform duration-150',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-subtle/30 p-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <Receipt className="size-3" aria-hidden />
            Ordered · {session.orderCount} {session.orderCount === 1 ? 'order' : 'orders'}
          </div>
          <ul className="mt-2 space-y-1">
            {session.items.map((item) => (
              <li
                key={item.name}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="text-fg">
                  <span className="tabular-nums text-muted">{item.quantity}×</span> {item.name}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between text-muted">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatRupees(session.subtotalPaise)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>GST</dt>
              <dd className="tabular-nums">{formatRupees(session.taxPaise)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatRupees(session.totalPaise)}</dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[6.5rem] animate-pulse rounded-xl border border-border bg-subtle"
          />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl border border-border bg-subtle"
          />
        ))}
      </div>
    </div>
  );
}
