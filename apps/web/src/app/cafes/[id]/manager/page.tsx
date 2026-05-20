import type { CafeResponse } from '@sangam/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import { ManagerChat } from './manager-chat';

export const metadata = { title: 'AI Manager · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AiManagerPage({ params }: PageProps) {
  const { id } = await params;

  try {
    const cafeRes = await serverFetch<CafeResponse>(`/cafes/${id}`);
    const cafe = cafeRes.cafe;

    return (
      <div className="space-y-8">
        <div>
          <Link
            href={`/cafes/${id}`}
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
          >
            <ArrowLeft className="size-3" />
            Back to {cafe.name}
          </Link>
          <div className="mt-3 space-y-1">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              AI Manager
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {cafe.name}
            </h1>
            <p className="text-sm text-muted">
              Ask about your sales, stock, and orders — answered from your live
              data.
            </p>
          </div>
        </div>

        <ManagerChat cafeId={id} />
      </div>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
