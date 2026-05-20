import type { CafeResponse } from '@sangam/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import { TablesTool } from './tables-tool';

export const metadata = { title: 'Tables & QR · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TablesPage({ params }: PageProps) {
  const { id } = await params;

  let cafeRes: CafeResponse;
  try {
    cafeRes = await serverFetch<CafeResponse>(`/cafes/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const cafe = cafeRes.cafe;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="print:hidden">
        <Link
          href={`/cafes/${cafe.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to dashboard
        </Link>
        <div className="mt-3 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted font-medium">
            Tables
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Tables &amp; QR codes
          </h1>
        </div>
      </div>
      <TablesTool cafeSlug={cafe.slug} cafeName={cafe.name} />
    </div>
  );
}
