import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import type { AuditLogListResponse, CafeResponse } from '@sangam/types';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AuditLogView } from './audit-log-view';

export const metadata = { title: 'Audit log · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AuditPage({ params }: PageProps) {
  const { id } = await params;

  let cafeRes: CafeResponse;
  let logsRes: AuditLogListResponse;
  try {
    [cafeRes, logsRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<AuditLogListResponse>(`/cafes/${id}/audit-logs`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const cafe = cafeRes.cafe;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <Link
          href={`/cafes/${cafe.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to dashboard
        </Link>
        <div className="mt-3 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted font-medium">Audit log</p>
          <h1 className="text-3xl font-semibold tracking-tight">{cafe.name}</h1>
          <p className="text-sm text-muted">
            An immutable, append-only record of sensitive actions — voids, refunds, discounts,
            settlements and staff changes.
          </p>
        </div>
      </div>

      <AuditLogView cafeId={cafe.id} initialLogs={logsRes.logs} />
    </div>
  );
}
