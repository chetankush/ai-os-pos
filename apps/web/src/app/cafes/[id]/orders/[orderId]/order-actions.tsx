'use client';

import type { OrderStatus, PaymentMethod, PaymentStatus } from '@sangam/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  ChefHat,
  CreditCard,
  PackageCheck,
  Plus,
  RotateCcw,
  Smartphone,
  Split,
  Trash2,
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
  /** Already settled online (Razorpay) — skip the "how was this paid?" picker. */
  alreadyPaid?: boolean;
  paymentStatus: PaymentStatus;
  totalPaise: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const NEXT_LABEL: Record<
  Exclude<OrderStatus, 'completed' | 'cancelled'>,
  { status: OrderStatus; label: string; icon: React.ReactNode }
> = {
  pending: { status: 'preparing', label: 'Start preparing', icon: <ChefHat className="size-4" /> },
  preparing: { status: 'ready', label: 'Mark as ready', icon: <PackageCheck className="size-4" /> },
  ready: { status: 'completed', label: 'Mark as completed', icon: <CheckCircle2 className="size-4" /> },
};

const TERMINAL_MESSAGE: Record<'completed' | 'cancelled', string> = {
  completed: 'This order is completed.',
  cancelled: 'This order is cancelled.',
};

// UPI first — it's the default at most Indian counters.
const PAYMENT_OPTIONS: { method: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { method: 'upi', label: 'UPI', icon: <Smartphone className="size-4" /> },
  { method: 'cash', label: 'Cash', icon: <Banknote className="size-4" /> },
  { method: 'card', label: 'Card', icon: <CreditCard className="size-4" /> },
];

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'cash',
  upi: 'UPI',
  card: 'card',
  online: 'online',
};

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

async function authedHeaders(): Promise<Record<string, string>> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    'content-type': 'application/json',
    ...(session ? { authorization: `Bearer ${session.access_token}` } : {}),
  };
}

async function postJson(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: await authedHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(data?.error?.message ?? `Request failed (${res.status})`);
  }
}

async function patchStatus(
  cafeId: string,
  orderId: string,
  status: OrderStatus,
  paymentMethod?: PaymentMethod,
): Promise<void> {
  const res = await fetch(`${API_URL}/cafes/${cafeId}/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: await authedHeaders(),
    body: JSON.stringify(paymentMethod ? { status, paymentMethod } : { status }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(data?.error?.message ?? `Request failed (${res.status})`);
  }
}

type Pending = null | 'next' | 'cancel' | 'settle' | 'refund';

export function OrderActions({
  cafeId,
  orderId,
  initialStatus,
  alreadyPaid = false,
  paymentStatus,
  totalPaise,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [payStatus, setPayStatus] = useState<PaymentStatus>(paymentStatus);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Completion / payment
  const [payingOpen, setPayingOpen] = useState(false);
  const [payMode, setPayMode] = useState<'single' | 'split'>('single');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [splitRows, setSplitRows] = useState<{ method: PaymentMethod; amount: string }[]>([
    { method: 'upi', amount: '' },
    { method: 'cash', amount: '' },
  ]);

  // Refund
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('upi');
  const [refundAmount, setRefundAmount] = useState(String(totalPaise / 100));
  const [refundReason, setRefundReason] = useState('');

  async function transition(next: OrderStatus, kind: 'next' | 'cancel', method?: PaymentMethod) {
    setError(null);
    setPending(kind);
    try {
      await patchStatus(cafeId, orderId, next, method);
      setStatus(next);
      if (next === 'completed' && method) setPayStatus('paid');
      if (next === 'cancelled') toast.success('Order cancelled');
      else if (next === 'completed' && method)
        toast.success(`Order completed · paid by ${PAYMENT_LABELS[method]}`);
      else toast.success(`Order marked ${next}`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update order';
      setError(message);
      toast.error(message);
    } finally {
      setPending(null);
    }
  }

  const allocatedPaise = splitRows.reduce(
    (s, r) => s + Math.round((Number(r.amount) || 0) * 100),
    0,
  );
  const splitBalanced = allocatedPaise === totalPaise;

  async function settleSplit() {
    setError(null);
    setPending('settle');
    try {
      const payments = splitRows
        .filter((r) => Number(r.amount) > 0)
        .map((r) => ({ method: r.method, amountPaise: Math.round(Number(r.amount) * 100) }));
      await postJson(`/cafes/${cafeId}/orders/${orderId}/settle`, { payments });
      setStatus('completed');
      setPayStatus('paid');
      toast.success('Order settled · split payment');
      setPayingOpen(false);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to settle order';
      setError(message);
      toast.error(message);
    } finally {
      setPending(null);
    }
  }

  async function doRefund() {
    const amountPaise = Math.round((Number(refundAmount) || 0) * 100);
    if (amountPaise <= 0) {
      setError('Enter a refund amount');
      return;
    }
    setError(null);
    setPending('refund');
    try {
      await postJson(`/cafes/${cafeId}/orders/${orderId}/refund`, {
        method: refundMethod,
        amountPaise,
        ...(refundReason.trim() ? { reason: refundReason.trim() } : {}),
      });
      setPayStatus('refunded');
      toast.success(`Refunded ${rupees(amountPaise)}`);
      setRefundOpen(false);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refund order';
      setError(message);
      toast.error(message);
    } finally {
      setPending(null);
    }
  }

  // ─── Terminal: completed / cancelled (+ refund for paid orders) ──────────────
  if (status === 'completed' || status === 'cancelled') {
    const refundable = status === 'completed' && (payStatus === 'paid' || payStatus === 'refunded');
    return (
      <div className="space-y-3">
        <p className="text-center py-1 text-xs text-muted">
          {TERMINAL_MESSAGE[status]}
          {payStatus === 'refunded' && ' (refunded)'}
        </p>

        {refundable && !refundOpen && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setError(null);
              setRefundOpen(true);
            }}
            className="w-full text-danger hover:bg-danger/5 hover:text-danger"
          >
            <RotateCcw className="size-4" />
            Refund
          </Button>
        )}

        {refundable && refundOpen && (
          <div className="space-y-3 rounded-lg border border-border bg-subtle/30 p-3">
            <p className="text-xs font-medium text-muted">Refund — how was it returned?</p>
            <MethodPicker value={refundMethod} onChange={setRefundMethod} disabled={pending !== null} />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                Amount ₹
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg focus:ring-offset-2 focus:ring-offset-bg"
                />
              </label>
              <label className="text-xs text-muted">
                Reason
                <input
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  maxLength={200}
                  placeholder="optional"
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg focus:ring-offset-2 focus:ring-offset-bg"
                />
              </label>
            </div>
            <Button
              type="button"
              onClick={doRefund}
              loading={pending === 'refund'}
              disabled={pending !== null}
              className="w-full"
            >
              {pending !== 'refund' && <RotateCcw className="size-4" />}
              Refund {rupees(Math.round((Number(refundAmount) || 0) * 100))}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRefundOpen(false)}
              disabled={pending !== null}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        )}

        {error && <ErrorNote message={error} />}
      </div>
    );
  }

  const nextAction = NEXT_LABEL[status];
  // Only ask "how was this paid?" when completing an order that isn't already
  // settled online — QR/Razorpay orders are paid before they reach the counter.
  const needsPayment = nextAction.status === 'completed' && !alreadyPaid;

  function handleNext() {
    if (needsPayment) {
      setError(null);
      setPayingOpen(true);
      return;
    }
    transition(nextAction.status, 'next');
  }

  // ─── Payment / completion picker ─────────────────────────────────────────────
  if (needsPayment && payingOpen) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted">How was this paid?</p>
          <div className="inline-flex rounded-md border border-border bg-subtle p-0.5">
            {(['single', 'split'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={payMode === m}
                disabled={pending !== null}
                onClick={() => setPayMode(m)}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  payMode === m ? 'bg-bg text-fg shadow-sm' : 'text-muted hover:text-fg',
                )}
              >
                {m === 'split' && <Split className="size-3" />}
                {m === 'single' ? 'Single' : 'Split'}
              </button>
            ))}
          </div>
        </div>

        {payMode === 'single' ? (
          <>
            <MethodPicker
              value={paymentMethod}
              onChange={setPaymentMethod}
              disabled={pending !== null}
            />
            <Button
              type="button"
              onClick={() => transition('completed', 'next', paymentMethod)}
              loading={pending === 'next'}
              disabled={pending !== null}
              className="w-full"
            >
              {pending !== 'next' && <CheckCircle2 className="size-4" />}
              Complete · {PAYMENT_LABELS[paymentMethod]}
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              {splitRows.map((row, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: positional rows
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={row.method}
                    disabled={pending !== null}
                    onChange={(e) =>
                      setSplitRows((rows) =>
                        rows.map((r, j) =>
                          j === i ? { ...r, method: e.target.value as PaymentMethod } : r,
                        ),
                      )
                    }
                    className="h-10 rounded-lg border border-border bg-bg px-2 text-sm focus:border-fg focus:outline-none"
                  >
                    {PAYMENT_OPTIONS.map((o) => (
                      <option key={o.method} value={o.method}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={row.amount}
                    placeholder="₹0"
                    disabled={pending !== null}
                    onChange={(e) =>
                      setSplitRows((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)),
                      )
                    }
                    className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 text-sm tabular-nums focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg focus:ring-offset-2 focus:ring-offset-bg"
                  />
                  {splitRows.length > 2 && (
                    <button
                      type="button"
                      aria-label="Remove tender"
                      disabled={pending !== null}
                      onClick={() => setSplitRows((rows) => rows.filter((_, j) => j !== i))}
                      className="grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-danger/5 hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {splitRows.length < 4 && (
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() =>
                    setSplitRows((rows) => [...rows, { method: 'card', amount: '' }])
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:opacity-80"
                >
                  <Plus className="size-3.5" />
                  Add tender
                </button>
              )}
            </div>

            <div
              className={cn(
                'flex items-baseline justify-between rounded-md px-2 py-1 text-xs tabular-nums',
                splitBalanced ? 'text-success' : 'text-muted',
              )}
            >
              <span>Allocated {rupees(allocatedPaise)}</span>
              <span>{splitBalanced ? 'Balanced' : `Bill ${rupees(totalPaise)}`}</span>
            </div>

            <Button
              type="button"
              onClick={settleSplit}
              loading={pending === 'settle'}
              disabled={pending !== null || !splitBalanced}
              className="w-full"
            >
              {pending !== 'settle' && <CheckCircle2 className="size-4" />}
              Settle {rupees(totalPaise)}
            </Button>
          </>
        )}

        <Button
          type="button"
          variant="ghost"
          onClick={() => setPayingOpen(false)}
          disabled={pending !== null}
          className="w-full"
        >
          Back
        </Button>

        {error && <ErrorNote message={error} />}
      </div>
    );
  }

  // ─── Default: advance / cancel ───────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={handleNext}
        loading={pending === 'next'}
        disabled={pending !== null}
        className="w-full"
      >
        {pending !== 'next' && nextAction.icon}
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
        {pending !== 'cancel' && <XCircle className="size-4" />}
        Cancel order
      </Button>

      {error && <ErrorNote message={error} />}

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

function MethodPicker({
  value,
  onChange,
  disabled,
}: {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {PAYMENT_OPTIONS.map((opt) => {
        const selected = value === opt.method;
        return (
          <button
            key={opt.method}
            type="button"
            onClick={() => onChange(opt.method)}
            disabled={disabled}
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
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger"
      role="alert"
    >
      {message}
    </p>
  );
}
