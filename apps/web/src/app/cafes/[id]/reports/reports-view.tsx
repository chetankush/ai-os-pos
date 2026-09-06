'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type {
  CategorySalesRow,
  DayEndReport,
  DayEndReportResponse,
  HourSalesRow,
  ItemSalesRow,
  PaymentMethod,
  SalesGroupBy,
  SalesReportResponse,
  SalesRow,
} from '@sangam/types';
import { BarChart3, Download, Inbox } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { authedFetch, formatRupees } from '../tables/tables-tool';

interface Props {
  cafeId: string;
}

/** Today's date as an IST YYYY-MM-DD (matches the server's business-day clock). */
function todayIstDate(): string {
  const IST_OFFSET_MS = 330 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  online: 'Online',
};

const SOURCE_LABELS: Record<'counter' | 'qr' | 'phone', string> = {
  counter: 'Counter',
  qr: 'QR / Self',
  phone: 'Phone',
};

const TABS: { key: SalesGroupBy; label: string }[] = [
  { key: 'item', label: 'By item' },
  { key: 'category', label: 'By category' },
  { key: 'hour', label: 'By hour' },
];

export function ReportsView({ cafeId }: Props) {
  const [date, setDate] = useState<string>(todayIstDate());
  const [groupBy, setGroupBy] = useState<SalesGroupBy>('item');

  const [report, setReport] = useState<DayEndReport | null>(null);
  const [sales, setSales] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dayEnd, salesRes] = await Promise.all([
        authedFetch<DayEndReportResponse>(`/cafes/${cafeId}/reports/day-end?date=${date}`),
        authedFetch<SalesReportResponse>(
          `/cafes/${cafeId}/reports/sales?from=${date}&to=${date}&groupBy=${groupBy}`,
        ),
      ]);
      setReport(dayEnd.report);
      setSales(salesRes.rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load reports';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [cafeId, date, groupBy]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasSales = report != null && report.orderCount > 0;

  function handleDownload() {
    if (!report) return;
    const csv = buildCsv(date, report, groupBy, sales);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sangam-report-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      {/* ─── Controls ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="space-y-1.5 text-sm">
          <span className="block text-xs font-medium uppercase tracking-wider text-muted">
            Business day
          </span>
          <input
            type="date"
            value={date}
            max={todayIstDate()}
            onChange={(e) => {
              // Ignore the transient empty value the spinbutton emits while
              // the user is mid-keystroke — falling back to today on every
              // empty event snapped the displayed date back as they typed.
              if (e.target.value) setDate(e.target.value);
            }}
            onBlur={(e) => {
              // If they cleared and walked away, restore to today.
              if (!e.target.value) setDate(todayIstDate());
            }}
            className={cn(
              'h-9 rounded-lg border border-border bg-bg px-3 text-sm text-fg',
              'outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            )}
          />
        </label>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleDownload}
          disabled={loading || !hasSales}
        >
          <Download className="size-3.5" />
          Download CSV
        </Button>
      </div>

      {loading ? (
        <ReportSkeleton />
      ) : error ? (
        <Card className="p-12 text-center border-dashed">
          <h3 className="font-medium">Couldn’t load reports</h3>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <div className="mt-6">
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : !hasSales ? (
        <EmptyState />
      ) : (
        report && (
          <>
            <DayEndSummary report={report} />
            <SalesBreakdown groupBy={groupBy} onGroupByChange={setGroupBy} rows={sales} />
          </>
        )
      )}
    </div>
  );
}

// ─── Day-end summary ──────────────────────────────────────────────────────────

function DayEndSummary({ report }: { report: DayEndReport }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Gross sales" value={formatRupees(report.grossSalesPaise)} />
        <Metric label="Net sales" value={formatRupees(report.netSalesPaise)} />
        <Metric label="Tax (GST)" value={formatRupees(report.taxPaise)} />
        <Metric
          label="Orders"
          value={String(report.orderCount)}
          hint={`${report.completedCount} completed`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            By payment mode
          </h3>
          <div className="mt-4">
            {report.byPaymentMethod.length === 0 ? (
              <p className="text-sm text-muted">No settled payments recorded.</p>
            ) : (
              <ul className="space-y-2.5">
                {report.byPaymentMethod.map((b) => (
                  <Row
                    key={b.method}
                    label={PAYMENT_LABELS[b.method]}
                    sub={`${b.count} ${b.count === 1 ? 'order' : 'orders'}`}
                    value={formatRupees(b.grossPaise)}
                  />
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">By source</h3>
          <div className="mt-4">
            <ul className="space-y-2.5">
              {report.bySource.map((b) => (
                <Row
                  key={b.source}
                  label={SOURCE_LABELS[b.source]}
                  sub={`${b.count} ${b.count === 1 ? 'order' : 'orders'}`}
                  value={formatRupees(b.grossPaise)}
                />
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {report.cancelledCount > 0 && (
        <Card className="p-4 border-dashed">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted">
              {report.cancelledCount}{' '}
              {report.cancelledCount === 1 ? 'cancellation' : 'cancellations'} (excluded from
              revenue)
            </span>
            <span className="font-medium tabular-nums text-muted">
              {formatRupees(report.cancelledValuePaise)}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

function Row({
  label,
  sub,
  value,
}: {
  label: string;
  sub?: string;
  value: string;
}) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-border pb-2.5 last:border-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-muted tabular-nums">{sub}</p>}
      </div>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </li>
  );
}

// ─── Sales breakdown (tabbed) ─────────────────────────────────────────────────

function SalesBreakdown({
  groupBy,
  onGroupByChange,
  rows,
}: {
  groupBy: SalesGroupBy;
  onGroupByChange: (g: SalesGroupBy) => void;
  rows: SalesRow[];
}) {
  const maxRevenue = useMemo(() => rows.reduce((m, r) => Math.max(m, r.revenuePaise), 0), [rows]);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Sales breakdown
        </h3>
        <div
          role="tablist"
          aria-label="Group sales by"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-subtle/50 p-0.5"
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={groupBy === tab.key}
              onClick={() => onGroupByChange(tab.key)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg',
                groupBy === tab.key ? 'bg-bg text-fg shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Nothing to show for this view.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const label = rowLabel(groupBy, r);
              const qtyLabel = rowQtyLabel(groupBy, r);
              const pct = maxRevenue > 0 ? Math.round((r.revenuePaise / maxRevenue) * 100) : 0;
              return (
                <li key={label} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatRupees(r.revenuePaise)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs text-muted tabular-nums">
                      {qtyLabel}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function rowLabel(groupBy: SalesGroupBy, r: SalesRow): string {
  if (groupBy === 'item') return (r as ItemSalesRow).name;
  if (groupBy === 'category') return (r as CategorySalesRow).category;
  return formatHour((r as HourSalesRow).hour);
}

function rowQtyLabel(groupBy: SalesGroupBy, r: SalesRow): string {
  if (groupBy === 'hour') {
    const c = (r as HourSalesRow).orderCount;
    return `${c} ${c === 1 ? 'order' : 'orders'}`;
  }
  const qty = (r as ItemSalesRow | CategorySalesRow).qty;
  return `${qty} sold`;
}

/** 0 → "12 AM", 13 → "1 PM". */
function formatHour(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

// ─── CSV export (client-side, from fetched JSON) ──────────────────────────────

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLine(cells: (string | number)[]): string {
  return cells.map(csvCell).join(',');
}

/** Rupees as a plain decimal for spreadsheets (paise / 100, 2 dp). */
function rupeesPlain(paise: number): string {
  return (paise / 100).toFixed(2);
}

function buildCsv(
  date: string,
  report: DayEndReport,
  groupBy: SalesGroupBy,
  rows: SalesRow[],
): string {
  const lines: string[] = [];

  lines.push(csvLine(['Sangam day-end report', date]));
  lines.push('');
  lines.push(csvLine(['Metric', 'Value (₹)']));
  lines.push(csvLine(['Gross sales', rupeesPlain(report.grossSalesPaise)]));
  lines.push(csvLine(['Net sales', rupeesPlain(report.netSalesPaise)]));
  lines.push(csvLine(['Tax (GST)', rupeesPlain(report.taxPaise)]));
  lines.push(csvLine(['Orders', report.orderCount]));
  lines.push(csvLine(['Completed', report.completedCount]));
  lines.push(csvLine(['Cancelled', report.cancelledCount]));
  lines.push(csvLine(['Cancelled value', rupeesPlain(report.cancelledValuePaise)]));

  lines.push('');
  lines.push(csvLine(['Payment mode', 'Orders', 'Gross (₹)']));
  for (const b of report.byPaymentMethod) {
    lines.push(csvLine([PAYMENT_LABELS[b.method], b.count, rupeesPlain(b.grossPaise)]));
  }

  lines.push('');
  lines.push(csvLine(['Source', 'Orders', 'Gross (₹)']));
  for (const b of report.bySource) {
    lines.push(csvLine([SOURCE_LABELS[b.source], b.count, rupeesPlain(b.grossPaise)]));
  }

  lines.push('');
  if (groupBy === 'hour') {
    lines.push(csvLine(['Hour', 'Orders', 'Revenue (₹)']));
    for (const r of rows as HourSalesRow[]) {
      lines.push(csvLine([formatHour(r.hour), r.orderCount, rupeesPlain(r.revenuePaise)]));
    }
  } else {
    const head = groupBy === 'item' ? 'Item' : 'Category';
    lines.push(csvLine([head, 'Qty', 'Revenue (₹)']));
    for (const r of rows as (ItemSalesRow | CategorySalesRow)[]) {
      const name = 'name' in r ? r.name : r.category;
      lines.push(csvLine([name, r.qty, rupeesPlain(r.revenuePaise)]));
    }
  }

  return lines.join('\n');
}

// ─── Skeleton + empty states ──────────────────────────────────────────────────

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-5">
            <div className="h-3 w-2/3 animate-pulse rounded-md bg-subtle" />
            <div className="mt-3 h-7 w-1/2 animate-pulse rounded-md bg-subtle" />
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <div className="h-3 w-28 animate-pulse rounded-md bg-subtle" />
        <div className="mt-6 space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="h-4 w-1/3 animate-pulse rounded-md bg-subtle" />
              <div className="h-4 w-16 animate-pulse rounded-md bg-subtle" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="p-12 text-center border-dashed">
      <div className="mx-auto grid size-12 place-items-center rounded-lg border border-border bg-subtle">
        <Inbox className="size-5 text-muted" />
      </div>
      <h3 className="mt-4 font-medium">No sales for this day</h3>
      <p className="mt-1 text-sm text-muted">
        Pick another date or check back once orders start coming in.
      </p>
      <div className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted">
        <BarChart3 className="size-3.5" />
        Reports update as orders complete.
      </div>
    </Card>
  );
}
