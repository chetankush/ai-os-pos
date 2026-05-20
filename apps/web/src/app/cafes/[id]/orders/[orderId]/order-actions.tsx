'use client';

import type { OrderResponse, OrderStatus, PaymentMethod } from '@sangam/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  ChefHat,
  CreditCard,
  PackageCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';

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

const PAYMENT_OPTIONS: {
  method: PaymentMethod;
  label: string;
  icon: React.ReactNode;
}[] = [
  { method: 'cash', label: 'Cash', icon: <Banknote className="size-4" /> },
  { method: 'upi', label: 'UPI', icon: <Smartphone className="size-4" /> },
  { method: 'card', label: 'Card', icon: <CreditCard className="size-4" /> },
];

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'cash',
  upi: 'UPI',
  card: 'card',
  online: 'online',
};

async function patchStatus(
  cafeId: string,
  orderId: string,
  status: OrderStatus,
  paymentMethod?: PaymentMethod,
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
      body: JSON.stringify(
        paymentMethod ? { status, paymentMethod } : { status },
      ),
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [payingOpen, setPayingOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  async function transition(
    next: OrderStatus,
    kind: 'next' | 'cancel',
    method?: PaymentMethod,
  ) {
    setError(null);
    setPending(kind);
    try {
      const data = await patchStatus(cafeId, orderId, next, method);
      setStatus(data.order.status);
      if (next === 'cancelled') {
        toast.success('Order cancelled');
      } else if (next === 'completed' && method) {
        toast.success(`Order completed · paid by ${PAYMENT_LABELS[method]}`);
      } else {
        toast.success(`Order marked ${next}`);
      }
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update order';
      setError(message);
      toast.error(message);
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
  const needsPayment = nextAction.status === 'completed';

  function handleNext() {
    if (needsPayment) {
      setError(null);
      setPayingOpen(true);
      return;
    }
    transition(nextAction.status, 'next');
  }

  if (needsPayment && payingOpen) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted">How was this paid?</p>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_OPTIONS.map((opt) => {
            const selected = paymentMethod === opt.method;
            return (
              <button
                key={opt.method}
                type="button"
                onClick={() => setPaymentMethod(opt.method)}
                disabled={pending !== null}
                aria-pressed={selected}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3',
                  'text-xs font-medium transition-all duration-150 outline-none',
                  'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:ring-fg',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  selected
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-bg text-fg hover:bg-subtle hover:border-border-strong',
                )}
              >
                {opt.icon}
                {opt.label}
              </button>
            );
          })}
        </div>

        <Button
          type="button"
          onClick={() => transition('completed', 'next', paymentMethod)}
          loading={pending === 'next'}
          disabled={pending !== null}
          className="w-full"
        >
          {pending === 'next' ? null : <CheckCircle2 className="size-4" />}
          Complete · {PAYMENT_LABELS[paymentMethod]}
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => setPayingOpen(false)}
          disabled={pending !== null}
          className="w-full"
        >
          Back
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
        onClick={() => setConfirmOpen(true)}
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

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Cancel this order?"
        description="This cannot be undone. The order will be marked cancelled."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        destructive
        onConfirm={() => transition('cancelled', 'cancel')}
      />
    </div>
  );
}
