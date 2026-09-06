import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import type { CafeResponse, InventoryListResponse, MenuResponse } from '@sangam/types';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InventoryView } from './inventory-view';

export const metadata = { title: 'Inventory · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CafeInventoryPage({ params }: PageProps) {
  const { id } = await params;

  try {
    const [cafeRes, inventoryRes, menuRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<InventoryListResponse>(`/cafes/${id}/inventory`),
      serverFetch<MenuResponse>(`/cafes/${id}/menu`),
    ]);

    const categoryNames: Record<string, string> = {};
    for (const cat of menuRes.categories) categoryNames[cat.id] = cat.name;

    return (
      <div className="space-y-8">
        <div>
          <Link
            href={`/cafes/${id}`}
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
          >
            <ArrowLeft className="size-3" />
            Back to {cafeRes.cafe.name}
          </Link>
          <div className="mt-3 space-y-1">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Inventory</p>
            <h1 className="text-3xl font-semibold tracking-tight">Stock tracking</h1>
            <p className="text-sm text-muted">
              Set stock levels and low-stock alerts per item. Items with no stock set are untracked.
            </p>
          </div>
        </div>

        <InventoryView
          cafeId={id}
          initialItems={inventoryRes.items}
          categoryNames={categoryNames}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
