import type { CafeResponse, FloorResponse } from '@sangam/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, LayoutGrid } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import { FloorView } from './floor-view';

export const metadata = { title: 'Tables · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TablesPage({ params }: PageProps) {
  const { id } = await params;

  let cafeRes: CafeResponse;
  let floorRes: FloorResponse;
  try {
    [cafeRes, floorRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<FloorResponse>(`/cafes/${id}/floor`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const cafe = cafeRes.cafe;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <Link
          href={`/cafes/${cafe.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to dashboard
        </Link>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted font-medium">
              Tables
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {cafe.name}
            </h1>
          </div>
          <Link
            href={`/cafes/${cafe.id}/tables/layout`}
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            <LayoutGrid className="size-3.5" />
            Edit layout
          </Link>
        </div>
      </div>

      <FloorView cafeId={cafe.id} initialFloor={floorRes} />
    </div>
  );
}
