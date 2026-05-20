import type { CafeResponse, MenuResponse } from '@mehfil/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import { MenuEditor } from './menu-editor';

export const metadata = { title: 'Menu · Mehfil' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CafeMenuPage({ params }: PageProps) {
  const { id } = await params;

  let cafe;
  try {
    const [cafeRes, menuRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<MenuResponse>(`/cafes/${id}/menu`),
    ]);
    cafe = cafeRes.cafe;
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
          <div className="mt-3 flex items-end justify-between">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Menu
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                {cafe.name}
              </h1>
            </div>
          </div>
        </div>

        <MenuEditor cafeId={id} initialCategories={menuRes.categories} />
      </div>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
