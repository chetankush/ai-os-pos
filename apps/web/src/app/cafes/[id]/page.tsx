import type {
  CafeResponse,
  Order,
  OrderStatsResponse,
  OrdersListResponse,
} from '@mehfil/types';
import type { OrderStatus } from '@mehfil/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';
import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import { cn } from '@/lib/cn';

export const metadata = { title: 'Dashboard · Mehfil' };

interface PageProps {
  params: Promise<{ id: string }>;
}

// ─── Shared status styles (must match orders pages) ─────────────────────────

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-900 border-amber-200',
  preparing: 'bg-blue-100 text-blue-900 border-blue-200',
  ready: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  completed: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  cancelled: 'bg-red-100 text-red-900 border-red-200',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default async function CafeDashboardPage({ params }: PageProps) {
  const { id } = await params;

  let cafeRes: CafeResponse;
  let ordersRes: OrdersListResponse;
  let statsRes: OrderStatsResponse;
  try {
    [cafeRes, ordersRes, statsRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<OrdersListResponse>(`/cafes/${id}/orders`),
      serverFetch<OrderStatsResponse>(`/cafes/${id}/orders/stats`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const cafe = cafeRes.cafe;
  const orders = ordersRes.orders;
  const stats = statsRes;

  const inProgress =
    (stats.byStatus.pending ?? 0) +
    (stats.byStatus.preparing ?? 0) +
    (stats.byStatus.ready ?? 0);
  const pendingCount = stats.byStatus.pending ?? 0;
  const completedCount = stats.byStatus.completed ?? 0;
  const cancelledCount = stats.byStatus.cancelled ?? 0;

  const recentOrders = orders.slice(0, 10);

  return (
    <div className="space-y-8">
      <FadeIn>
        <Link
          href="/cafes"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to cafes
        </Link>
      </FadeIn>

      {/* Header */}
      <FadeIn delay={0.05}>
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <p className="text-sm text-muted font-mono">
              mehfil.in/{cafe.slug}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {cafe.name}
            </h1>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-border bg-subtle text-fg whitespace-nowrap">
            {cafe.isAirConditioned ? '18% GST · AC' : '5% GST · Non-AC'}
          </span>
        </div>
      </FadeIn>

      {/* Stats grid */}
      <Stagger className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Today's revenue"
          value={formatRupees(stats.todayRevenuePaise)}
          subtitle="From completed orders"
        />
        <StatCard
          label="Today's orders"
          value={stats.todayCount.toString()}
          subtitle={`${completedCount} completed · ${cancelledCount} cancelled`}
        />
        <StatCard
          label="In progress"
          value={inProgress.toString()}
          subtitle="Across kitchen"
        />
        <StatCard
          label="Pending"
          value={pendingCount.toString()}
          subtitle="Awaiting confirmation"
        />
      </Stagger>

      {/* Action shortcuts */}
      <FadeIn delay={0.1}>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/cafes/${cafe.id}/orders/new`}
            className={buttonClasses({ variant: 'primary' })}
          >
            New order
          </Link>
          <Link
            href={`/cafes/${cafe.id}/menu`}
            className={buttonClasses({ variant: 'secondary' })}
          >
            Manage menu
          </Link>
          <Link
            href={`/cafes/${cafe.id}/orders`}
            className={buttonClasses({ variant: 'secondary' })}
          >
            View all orders
          </Link>
        </div>
      </FadeIn>

      {/* Recent orders */}
      <FadeIn delay={0.15}>
        <Card>
          <CardHeader className="flex items-center justify-between gap-4">
            <CardTitle>Recent orders</CardTitle>
            <Link
              href={`/cafes/${cafe.id}/orders`}
              className="text-xs text-muted hover:text-fg transition-colors inline-flex items-center gap-1"
            >
              View all
              <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardBody>
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted py-6 text-center">
                No orders yet — start with &quot;New order&quot; above
              </p>
            ) : (
              <ul className="divide-y divide-border -mx-2">
                {recentOrders.map((order) => (
                  <li key={order.id}>
                    <OrderRow cafeId={cafe.id} order={order} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </FadeIn>

      {/* Cafe info */}
      <FadeIn delay={0.2}>
        <Card>
          <CardHeader className="flex items-center justify-between gap-4">
            <CardTitle>Cafe info</CardTitle>
            <span className="text-[10px] uppercase tracking-wider text-muted font-medium px-2 py-0.5 rounded-full border border-border">
              Edit · soon
            </span>
          </CardHeader>
          <CardBody>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <Row label="Address">
                {cafe.addressLine1}
                {cafe.addressLine2 ? `, ${cafe.addressLine2}` : ''},{' '}
                <span className="text-muted">
                  {cafe.city}, {cafe.state} {cafe.pincode}
                </span>
              </Row>

              {cafe.gstin ? <Row label="GSTIN">{cafe.gstin}</Row> : null}
              {cafe.fssai ? <Row label="FSSAI">{cafe.fssai}</Row> : null}

              <Row label="Created">
                {new Date(cafe.createdAt).toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </Row>
            </dl>
          </CardBody>
        </Card>
      </FadeIn>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <StaggerItem>
      <Card className="p-5 h-full">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted font-medium">
            {label}
          </p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
      </Card>
    </StaggerItem>
  );
}

function OrderRow({ cafeId, order }: { cafeId: string; order: Order }) {
  return (
    <Link
      href={`/cafes/${cafeId}/orders/${order.id}`}
      className="group flex items-center gap-4 px-2 py-3 rounded-md hover:bg-subtle transition-colors"
    >
      <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
        <span className="font-mono text-sm font-medium">
          {order.orderNumber}
        </span>
        <span className="text-xs text-muted">·</span>
        <span className="text-xs text-muted tabular-nums">
          {formatTime(order.createdAt)}
        </span>
        <span className="text-xs text-muted">·</span>
        <StatusBadge status={order.status} />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold tabular-nums">
          {formatRupees(order.totalPaise)}
        </span>
        <ChevronRight className="size-4 text-muted opacity-60 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border',
        STATUS_STYLES[status],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] uppercase tracking-wider text-muted font-medium">
        {label}
      </dt>
      <dd className="text-sm leading-relaxed">{children}</dd>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const RUPEE_FORMATTER = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

function formatRupees(paise: number): string {
  const rupees = Math.round(paise / 100);
  return `₹${RUPEE_FORMATTER.format(rupees)}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
