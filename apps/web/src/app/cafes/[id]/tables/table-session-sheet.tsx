'use client';

import type {
  OrderWithItems,
  PaymentMethod,
  TableSessionDetail,
  TableSessionDetailResponse,
} from '@sangam/types';
import {
  Banknote,
  CreditCard,
  Plus,
  Smartphone,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { Sheet } from './sheet';
import { authedFetch, formatRupees } from './tables-tool';

interface Props {
  cafeId: string;
  sessionId: string;
  tableLabel: string;
  onClose: () => void;
  onChanged: () => void;
}

// UPI first, default UPI — matches India-cafe reality.
const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string; Icon: typeof Smartphone }> = [
  { value: 'upi', label: 'UPI', Icon: Smartphone },
  { value: 'cash', label: 'Cash', Icon: Banknote },
  { value: 'card', label: 'Card', Icon: CreditCard },
];

export function TableSessionSheet({
  cafeId,
  sessionId,
  tableLabel,
  onClose,
  onChanged,
}: Props) {
  const [detail, setDetail] = useState<TableSessionDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [settling, setSettling] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch<TableSessionDetailResponse>(
          `/cafes/${cafeId}/table-sessions/${sessionId}`,
        );
        if (!cancelled) setDetail(data.session);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load tab');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cafeId, sessionId]);

  async function handleSettle() {
    setSettling(true);
    try {
      await authedFetch<TableSessionDetailResponse>(
        `/cafes/${cafeId}/table-sessions/${sessionId}/settle`,
        { method: 'POST', body: JSON.stringify({ paymentMethod: method }) },
      );
      toast.success(`Table ${tableLabel} settled · ${method.toUpperCase()}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to settle table');
      setSettling(false);
    }
  }

  async function handleClose() {
    setClosing(true);
    try {
      await authedFetch(`/cafes/${cafeId}/table-sessions/${sessionId}/close`, {
        method: 'POST',
      });
      toast.success(`Table ${tableLabel} closed`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to close table');
      setClosing(false);
    }
  }

  const guest = detail?.session.guestName?.trim();
  const busy = settling || closing;

  return (
    <Sheet
      title={`Table ${tableLabel}`}
      subtitle={
        detail
          ? [guest || 'Guest', detail.session.partySize ? `Party of ${detail.session.partySize}` : null]
              .filter(Boolean)
              .join(' · ')
          : 'Running tab'
      }
      onClose={onClose}
      footer={
        detail ? (
          <div className="space-y-3">
            {/* Payment method — UPI first, default UPI */}
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMethod(value)}
                  disabled={busy}
                  aria-pressed={method === value}
                  className={cn(
                    'flex h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    method === value
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted hover:border-border-strong hover:text-fg',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            <Button
              type="button"
              size="lg"
              className="w-full"
              loading={settling}
              disabled={closing}
              onClick={handleSettle}
            >
              {settling
                ? 'Settling'
                : `Settle ${formatRupees(detail.totalPaise)} · ${method.toUpperCase()}`}
            </Button>

            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className="w-full text-center text-xs text-muted hover:text-danger transition-colors disabled:opacity-50"
            >
              {closing ? 'Closing…' : 'Close table without payment'}
            </button>
          </div>
        ) : null
      }
    >
      {loadError ? (
        <p className="py-8 text-center text-sm text-danger" role="alert">
          {loadError}
        </p>
      ) : !detail ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-16 rounded-lg bg-subtle animate-pulse" />
          <div className="h-16 rounded-lg bg-subtle animate-pulse" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Add items CTA */}
          <Link
            href={`/cafes/${cafeId}/orders/new?session=${sessionId}`}
            className={buttonClasses({ variant: 'secondary', size: 'md', className: 'w-full' })}
          >
            <Plus className="size-4" />
            Add items
          </Link>

          {/* Running tab — one block per order */}
          {detail.orders.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No orders yet — tap “Add items” to start the tab.
            </p>
          ) : (
            <div className="space-y-4">
              {detail.orders.map((order) => (
                <OrderBlock key={order.id} order={order} />
              ))}
            </div>
          )}

          {/* Combined totals */}
          <div className="space-y-1.5 border-t border-border pt-3">
            <TotalRow label="Subtotal" paise={detail.subtotalPaise} muted />
            <TotalRow label="GST" paise={detail.taxPaise} muted />
            <div className="flex items-baseline justify-between border-t border-border pt-2">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-lg font-semibold tabular-nums">
                {formatRupees(detail.totalPaise)}
              </span>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ─── Single order block within the tab ──────────────────────────────────────

function OrderBlock({ order }: { order: OrderWithItems }) {
  return (
    <div className="rounded-lg border border-border bg-subtle/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium text-muted">
          {order.orderNumber}
        </span>
        <span className="text-xs font-medium tabular-nums">
          {formatRupees(order.totalPaise)}
        </span>
      </div>
      <ul className="space-y-1">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              <span className="tabular-nums text-muted">{item.quantity}×</span>{' '}
              {item.itemNameSnapshot}
            </span>
            <span className="shrink-0 tabular-nums text-muted">
              {formatRupees(item.lineTotalPaise)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TotalRow({
  label,
  paise,
  muted,
}: {
  label: string;
  paise: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className={muted ? 'text-muted' : 'text-fg'}>{label}</span>
      <span
        className={cn('tabular-nums', muted ? 'text-muted' : 'font-medium text-fg')}
      >
        {formatRupees(paise)}
      </span>
    </div>
  );
}
