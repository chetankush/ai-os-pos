import type { PublicMenuResponse } from '@sangam/types';
import { UtensilsCrossed } from 'lucide-react';
import type { Metadata } from 'next';
import { DinerOrder } from './diner-order';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  title: 'Order · Sangam',
  robots: { index: false },
};

async function getCafe(slug: string): Promise<PublicMenuResponse | null> {
  try {
    const res = await fetch(
      `${API_URL}/public/cafes/${encodeURIComponent(slug)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    return (await res.json()) as PublicMenuResponse;
  } catch {
    return null;
  }
}

export default async function MenuPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const tableRaw = sp.table;
  const table =
    typeof tableRaw === 'string'
      ? tableRaw
      : Array.isArray(tableRaw)
        ? tableRaw[0]
        : undefined;

  const data = await getCafe(slug);

  if (!data) return <MenuNotFound />;

  return (
    <DinerOrder
      slug={slug}
      table={table?.trim() || undefined}
      cafe={data.cafe}
      categories={data.categories}
    />
  );
}

function MenuNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center">
      <div className="max-w-sm space-y-4">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-border bg-subtle">
          <UtensilsCrossed className="size-6 text-muted" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Menu not found</h1>
        <p className="text-sm text-muted">
          We couldn&apos;t find this menu. Double-check the QR code or ask a
          member of staff for help.
        </p>
      </div>
    </main>
  );
}
