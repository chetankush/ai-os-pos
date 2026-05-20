import type { OrderItem, OrderResponse, OrderStatus } from '@sangam/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { FadeIn } from '@/components/ui/motion';
import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import { cn } from '@/lib/cn';
import { OrderActions } from './order-actions';

export const metadata = { title: 'Order · Sangam' };

interface PageProps {
  params: Promise<{ id: string; orderId: string }>;
}

const SOURCE_LABEL: Record<string, string> = {
  counter: 'Counter',
  qr: 'QR',
  phone: 'Phone',
};

export default async function OrderDetailPage({ params }: PageProps) {
  const { id, orderId } = await params;

  let data: OrderResponse;
  try {
    data = await serverFetch<OrderResponse>(`/cafes/${id}/orders/${orderId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const order = data.order;
  const sourceLabel = SOURCE_LABEL[order.source] ?? order.source;
  const customerLabel = order.customerName?.trim() || 'Walk-in';
  const gstRatePct = (order.gstRateBp / 100).toFixed(order.gstRateBp % 100 === 0 ? 0 : 2);

  const hasExtraInfo =
    Boolean(order.customerName) ||
    Boolean(order.customerPhone) ||
    Boolean(order.tableLabel) ||
    Boolean(order.notes);

  return (
    <div className="space-y-8">
      <FadeIn>
        <Link
          href={`/cafes/${id}/orders`}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to orders
        </Link>
      </FadeIn>

      <FadeIn delay={0.05}>
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              Order
            </p>
            <h1 className="text-3xl font-semibold tracking-tight font-mono">
              {order.orderNumber}
            </h1>
            <p className="text-sm text-muted">
              {formatRelative(order.createdAt)} · {sourceLabel} · {customerLabel}
            </p>
          </div>
          <StatusPill status={order.status} />
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Items</CardTitle>
              </CardHeader>
              <CardBody className="pt-0">
                {order.items.length === 0 ? (
                  <p className="text-sm text-muted py-6 text-center">
                    No items on this order.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        <ItemRow item={item} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {hasExtraInfo && (
              <Card>
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardBody className="pt-0">
                  <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                    {order.customerName && (
                      <InfoRow label="Customer">{order.customerName}</InfoRow>
                    )}
                    {order.customerPhone && (
                      <InfoRow label="Phone">
                        <a
                          href={`tel:${order.customerPhone}`}
                          className="hover:text-fg transition-colors"
                        >
                          {order.customerPhone}
                        </a>
                      </InfoRow>
                    )}
                    {order.tableLabel && (
                      <InfoRow label="Table">{order.tableLabel}</InfoRow>
                    )}
                    {order.notes && (
                      <InfoRow label="Notes" full>
                        {order.notes}
                      </InfoRow>
                    )}
                  </dl>
                </CardBody>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Bill summary</CardTitle>
              </CardHeader>
              <CardBody className="pt-0 space-y-3">
                <SummaryRow label="Subtotal" value={formatRupees(order.subtotalPaise)} />
                <SummaryRow
                  label={`Tax (GST ${gstRatePct}%)`}
                  value={formatRupees(order.taxPaise)}
                />
                <div className="border-t-2 border-border-strong pt-3 flex items-baseline justify-between">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-2xl font-semibold tabular-nums">
                    {formatRupees(order.totalPaise)}
                  </span>
                </div>
                {order.paidAt && (
                  <p className="text-[11px] text-muted pt-1">
                    Paid at{' '}
                    {new Date(order.paidAt).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                )}
              </CardBody>
            </Card>

            <Card className="p-4">
              <OrderActions
                cafeId={id}
                orderId={orderId}
                initialStatus={order.status}
              />
            </Card>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}

function ItemRow({ item }: { item: OrderItem }) {
  return (
    <div className="flex items-start gap-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm">{item.itemNameSnapshot}</p>
          <span className="text-[11px] text-muted px-1.5 py-0.5 rounded border border-border bg-subtle tabular-nums">
            × {item.quantity}
          </span>
        </div>
        {item.notes && (
          <p className="mt-1 text-xs text-muted">{item.notes}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-medium tabular-nums">
          {formatRupees(item.lineTotalPaise)}
        </div>
        <div className="text-[11px] text-muted tabular-nums">
          {formatRupees(item.unitPricePaise)} × {item.quantity}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function InfoRow({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn('space-y-1', full && 'sm:col-span-2')}>
      <dt className="text-[11px] uppercase tracking-wider text-muted font-medium">
        {label}
      </dt>
      <dd className="text-sm leading-relaxed">{children}</dd>
    </div>
  );
}

// ─── Status pill (shared color mapping) ─────────────────────────────────────

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending:
    'bg-amber-100 text-amber-900 border-amber-200 ' +
    'dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-800',
  preparing:
    'bg-blue-100 text-blue-900 border-blue-200 ' +
    'dark:bg-blue-900/30 dark:text-blue-100 dark:border-blue-800',
  ready:
    'bg-emerald-100 text-emerald-900 border-emerald-200 ' +
    'dark:bg-emerald-900/30 dark:text-emerald-100 dark:border-emerald-800',
  completed:
    'bg-zinc-100 text-zinc-700 border-zinc-200 ' +
    'dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
  cancelled:
    'bg-red-100 text-red-900 border-red-200 ' +
    'dark:bg-red-900/30 dark:text-red-100 dark:border-red-800',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border',
        STATUS_STYLES[status],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatRupees(paise: number): string {
  const rupees = paise / 100;
  if (Number.isInteger(rupees)) {
    return `₹${rupees.toLocaleString('en-IN')}`;
  }
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const RTF = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' });

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((then - now) / 1000);
  const abs = Math.abs(diffSec);

  if (abs < 60) return RTF.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return RTF.format(diffMin, 'minute');
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return RTF.format(diffHr, 'hour');
  const diffDay = Math.round(diffHr / 24);
  return RTF.format(diffDay, 'day');
}
