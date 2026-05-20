import type { CafeResponse, MenuResponse } from '@sangam/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import { WaiterChat } from './waiter-chat';

export const metadata = { title: 'AI Waiter · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AiWaiterPage({ params }: PageProps) {
  const { id } = await params;

  try {
    const [cafeRes, menuRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<MenuResponse>(`/cafes/${id}/menu`),
    ]);
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
              AI Waiter
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {cafe.name}
            </h1>
            <p className="text-sm text-muted">
              Chat with your menu-aware AI waiter — try the prompts your
              customers would ask.
            </p>
          </div>
        </div>

        <WaiterChat cafeId={id} menu={menuRes.categories} />
      </div>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
