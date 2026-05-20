import type { CafeResponse, MenuResponse } from '@sangam/types';
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
}

export default async function NewOrderPage({ params }: PageProps) {
  const { id } = await params;

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
      />
    </div>
  );
}
