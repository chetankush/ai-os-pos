import type { CafeResponse, TablesListResponse } from '@sangam/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import { LayoutEditor } from './layout-editor';

export const metadata = { title: 'Edit layout · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FloorPlanPage({ params }: PageProps) {
  const { id } = await params;

  let cafeRes: CafeResponse;
  let tablesRes: TablesListResponse;
  try {
    [cafeRes, tablesRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<TablesListResponse>(`/cafes/${id}/tables`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const cafe = cafeRes.cafe;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="print:hidden">
        <Link
          href={`/cafes/${cafe.id}/tables`}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to floor
        </Link>
        <div className="mt-3 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted font-medium">
            Floor plan
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Edit layout</h1>
        </div>
      </div>
      <LayoutEditor
        cafeId={cafe.id}
        slug={cafe.slug}
        cafeName={cafe.name}
        initialTables={tablesRes.tables}
      />
    </div>
  );
}
