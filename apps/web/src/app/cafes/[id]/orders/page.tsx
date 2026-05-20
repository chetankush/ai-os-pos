import type { CafeResponse, Order, OrdersListResponse } from '@sangam/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ChevronRight, Plus, Receipt } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';
import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import { PaymentBadge } from './_components/payment-badge';
import { StatusPill } from './_components/status-pill';

export const metadata = { title: 'Orders · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrdersPage({ params }: PageProps) {
  const { id } = await params;

  let cafeRes: CafeResponse;
  let ordersRes: OrdersListResponse;
  try {
    [cafeRes, ordersRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<OrdersListResponse>(`/cafes/${id}/orders`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const cafe = cafeRes.cafe;
  const orders = ordersRes.orders;

  return (
    <div className="space-y-8">
      <FadeIn>
        <Link
          href={`/cafes/${id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to {cafe.name}
        </Link>
      </FadeIn>

      <FadeIn delay={0.05}>
        <div className="mt-3 flex items-end justify-between gap-6">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              Orders
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {cafe.name}
            </h1>
          </div>
          <Link href={`/cafes/${id}/orders/new`} className={buttonClasses()}>
            <Plus className="size-4" />
            New order
          </Link>
        </div>
      </FadeIn>

      {orders.length === 0 ? (
        <EmptyState cafeId={id} />
      ) : (
        <Stagger className="space-y-2">
          {orders.map((order) => (
            <StaggerItem key={order.id}>
              <OrderRow cafeId={id} order={order} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}

function OrderRow({ cafeId, order }: { cafeId: string; order: Order }) {
  return (
    <Link href={`/cafes/${cafeId}/orders/${order.id}`} className="group block">
      <Card className="p-4 hover:border-border-strong transition-all hover:shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-sm font-medium tracking-tight">
                {order.orderNumber}
              </span>
              <StatusPill status={order.status} />
              <PaymentBadge
                status={order.paymentStatus}
                method={order.paymentMethod}
              />
              {order.tableLabel ? (
                <span className="text-[11px] text-muted px-1.5 py-0.5 rounded border border-border bg-subtle">
                  Table {order.tableLabel}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="truncate">
                {order.customerName ?? 'Walk-in'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatTime(order.createdAt)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums">
                {formatRupees(order.totalPaise)}
              </div>
            </div>
            <ChevronRight className="size-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

function EmptyState({ cafeId }: { cafeId: string }) {
  return (
    <Card className="p-12 text-center border-dashed">
      <div className="mx-auto size-12 rounded-lg bg-subtle border border-border grid place-items-center">
        <Receipt className="size-5 text-muted" />
      </div>
      <h3 className="mt-4 font-medium">No orders yet</h3>
      <p className="mt-1 text-sm text-muted">
        Take your first order to start tracking sales and KOTs here.
      </p>
      <div className="mt-6">
        <Link href={`/cafes/${cafeId}/orders/new`} className={buttonClasses()}>
          <Plus className="size-4" />
          Create first order
        </Link>
      </div>
    </Card>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatRupees(paise: number): string {
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}

const RTF = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' });

function formatTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = then - now;
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 60) return RTF.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return RTF.format(diffMin, 'minute');
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return RTF.format(diffHr, 'hour');
  const diffDay = Math.round(diffHr / 24);
  return RTF.format(diffDay, 'day');
}
