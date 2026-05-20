'use client';

import type { OrderResponse, OrderStatus } from '@mehfil/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, ChefHat, PackageCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Props {
  cafeId: string;
  orderId: string;
  initialStatus: OrderStatus;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const NEXT_LABEL: Record<
  Exclude<OrderStatus, 'completed' | 'cancelled'>,
  { status: OrderStatus; label: string; icon: React.ReactNode }
> = {
  pending: {
    status: 'preparing',
    label: 'Start preparing',
    icon: <ChefHat className="size-4" />,
  },
  preparing: {
    status: 'ready',
    label: 'Mark as ready',
    icon: <PackageCheck className="size-4" />,
  },
  ready: {
    status: 'completed',
    label: 'Mark as completed',
    icon: <CheckCircle2 className="size-4" />,
  },
};

const TERMINAL_MESSAGE: Record<'completed' | 'cancelled', string> = {
  completed: 'This order is completed.',
  cancelled: 'This order is cancelled.',
};

async function patchStatus(
  cafeId: string,
  orderId: string,
  status: OrderStatus,
): Promise<OrderResponse> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers();
  headers.set('content-type', 'application/json');
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);

  const res = await fetch(
    `${API_URL}/cafes/${cafeId}/orders/${orderId}/status`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status }),
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(
      body?.error?.message ?? `Request failed (${res.status})`,
    );
  }

  return (await res.json()) as OrderResponse;
}

export function OrderActions({ cafeId, orderId, initialStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [pending, setPending] = useState<null | 'next' | 'cancel'>(null);
  const [error, setError] = useState<string | null>(null);

  async function transition(next: OrderStatus, kind: 'next' | 'cancel') {
    setError(null);
    setPending(kind);
    try {
      const data = await patchStatus(cafeId, orderId, next);
      setStatus(data.order.status);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update order');
    } finally {
      setPending(null);
    }
  }

  if (status === 'completed' || status === 'cancelled') {
    return (
      <p className="text-xs text-muted text-center py-2">
        {TERMINAL_MESSAGE[status]}
      </p>
    );
  }

  const nextAction = NEXT_LABEL[status];

  function handleNext() {
    transition(nextAction.status, 'next');
  }

  function handleCancel() {
    if (!confirm('Cancel this order? This cannot be undone.')) return;
    transition('cancelled', 'cancel');
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={handleNext}
        loading={pending === 'next'}
        disabled={pending !== null}
        className="w-full"
      >
        {pending === 'next' ? null : nextAction.icon}
        {nextAction.label}
      </Button>

      <Button
        type="button"
        variant="ghost"
        onClick={handleCancel}
        loading={pending === 'cancel'}
        disabled={pending !== null}
        className="w-full text-danger hover:bg-danger/5 hover:text-danger"
      >
        {pending === 'cancel' ? null : <XCircle className="size-4" />}
        Cancel order
      </Button>

      {error && (
        <p
          className="text-xs text-danger px-3 py-2 rounded-md border border-danger/20 bg-danger/5"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
