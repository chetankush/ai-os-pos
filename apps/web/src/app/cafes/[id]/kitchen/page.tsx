import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import type { CafeResponse, KitchenTicketsResponse } from '@sangam/types';
import { notFound } from 'next/navigation';
import { KitchenBoard } from './kitchen-board';

export const metadata = { title: 'Kitchen · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function KitchenPage({ params }: PageProps) {
  const { id } = await params;

  // Server-render the first paint; the board only *refreshes* on the client.
  let cafeRes: CafeResponse;
  let ticketsRes: KitchenTicketsResponse;
  try {
    [cafeRes, ticketsRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<KitchenTicketsResponse>(`/cafes/${id}/kitchen/tickets`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <KitchenBoard cafeId={id} cafeName={cafeRes.cafe.name} initialTickets={ticketsRes.tickets} />
  );
}
