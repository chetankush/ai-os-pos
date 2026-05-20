import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import type { CafeResponse, StaffListResponse } from '@sangam/types';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StaffManager } from './staff-manager';

export const metadata = { title: 'Staff · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StaffPage({ params }: PageProps) {
  const { id } = await params;

  let cafeRes: CafeResponse;
  let staffRes: StaffListResponse;
  try {
    [cafeRes, staffRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<StaffListResponse>(`/cafes/${id}/staff`),
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
          <p className="text-[11px] uppercase tracking-wider text-muted font-medium">Staff</p>
          <h1 className="text-3xl font-semibold tracking-tight">{cafe.name}</h1>
          <p className="text-sm text-muted">
            Add team members and set their role. PINs are stored securely and never shown again.
          </p>
        </div>
      </div>

      <StaffManager cafeId={cafe.id} initialStaff={staffRes.staff} />
    </div>
  );
}
