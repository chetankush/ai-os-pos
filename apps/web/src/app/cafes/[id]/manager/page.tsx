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

    // The conversation is the page here, so it takes the viewport rather than
    // sitting in a fixed-height card below a tall masthead — a data-heavy answer
    // (yesterday's sales, item breakdowns) was previously squeezed into 640px
    // while the screen had room to spare.
    //
    // 7rem matches the sidebar's own height offset in cafe-shell, so the chat
    // and the nav end on the same line; the mobile value adds the shell's
    // mobile menu bar. min-h keeps it usable on a short laptop window.
    return (
      <div className="flex h-[calc(100dvh-10.75rem)] min-h-[26rem] flex-col gap-3 lg:h-[calc(100dvh-7rem)]">
        <Link
          href={`/cafes/${id}`}
          className="inline-flex w-fit shrink-0 items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="size-3" />
          Back to {cafe.name}
        </Link>

        <ManagerChat cafeId={id} cafeName={cafe.name} />
      </div>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
