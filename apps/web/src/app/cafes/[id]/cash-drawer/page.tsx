import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import type { CafeResponse, CashDrawerResponse } from '@sangam/types';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CashDrawerPanel } from './cash-drawer-panel';

export const metadata = { title: 'Cash drawer · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CashDrawerPage({ params }: PageProps) {
  const { id } = await params;

  let cafeRes: CafeResponse;
  let drawerRes: CashDrawerResponse;
  try {
    [cafeRes, drawerRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<CashDrawerResponse>(`/cafes/${id}/cash-drawer/current`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const cafe = cafeRes.cafe;

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <Link
          href={`/cafes/${cafe.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to dashboard
        </Link>
        <div className="mt-3 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted font-medium">Cash drawer</p>
          <h1 className="text-3xl font-semibold tracking-tight">{cafe.name}</h1>
          <p className="text-sm text-muted">
            Open a shift with a starting float, then close it with the counted cash to see the
            variance.
          </p>
        </div>
      </div>

      <CashDrawerPanel cafeId={cafe.id} initialSession={drawerRes.session} />
    </div>
  );
}
