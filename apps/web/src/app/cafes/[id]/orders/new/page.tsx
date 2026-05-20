import type {
  CafeResponse,
  MenuResponse,
  TableSessionDetailResponse,
} from '@sangam/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { FadeIn } from '@/components/ui/motion';
import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import { OrderBuilder } from './order-builder';

export const metadata = { title: 'New order · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string }>;
}

export default async function NewOrderPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { session: sessionId } = await searchParams;

  let cafeRes: CafeResponse;
  let menuRes: MenuResponse;
  try {
    [cafeRes, menuRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<MenuResponse>(`/cafes/${id}/menu`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const cafe = cafeRes.cafe;

  // When adding to a table session, resolve the table label for the banner.
  // A bad/closed session id shouldn't break order creation — fall back silently.
  let sessionTableLabel: string | null = null;
  if (sessionId) {
    try {
      const detailRes = await serverFetch<TableSessionDetailResponse>(
        `/cafes/${id}/table-sessions/${sessionId}`,
      );
      sessionTableLabel = detailRes.session.table.label;
    } catch {
      sessionTableLabel = null;
    }
  }

  return (
    <div className="space-y-8">
      <FadeIn>
        <Link
          href={
            sessionId ? `/cafes/${id}/tables` : `/cafes/${id}/orders`
          }
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="size-3" />
          {sessionId ? 'Back to tables' : 'Back to orders'}
        </Link>
      </FadeIn>

      <FadeIn delay={0.05}>
        <div className="mt-3 space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            New order
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Create order
          </h1>
        </div>
      </FadeIn>

      <OrderBuilder
        cafeId={id}
        cafe={cafe}
        categories={menuRes.categories}
        sessionId={sessionId ?? null}
        sessionTableLabel={sessionTableLabel}
      />
    </div>
  );
}
