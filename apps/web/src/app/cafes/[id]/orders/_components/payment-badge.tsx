import type { PaymentMethod, PaymentStatus } from '@sangam/types';
import { CheckCircle, Circle, Clock, RotateCcw, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Payment-status badge for orders.
 *
 * Color is never the only signal: every state pairs a semantic color with a
 * text label and an icon, so it reads in greyscale and for color-blind users.
 * Used on the orders list rows and in the order detail header.
 */
const PAYMENT_STYLES: Record<PaymentStatus, string> = {
  paid:
    'bg-emerald-100 text-emerald-900 border-emerald-200 ' +
    'dark:bg-emerald-900/30 dark:text-emerald-100 dark:border-emerald-800',
  pending:
    'bg-amber-100 text-amber-900 border-amber-200 ' +
    'dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-800',
  failed:
    'bg-red-100 text-red-900 border-red-200 ' +
    'dark:bg-red-900/30 dark:text-red-100 dark:border-red-800',
  refunded:
    'bg-blue-100 text-blue-900 border-blue-200 ' +
    'dark:bg-blue-900/30 dark:text-blue-100 dark:border-blue-800',
  unpaid:
    'bg-zinc-100 text-zinc-700 border-zinc-200 ' +
    'dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  paid: 'Paid',
  pending: 'Payment pending',
  failed: 'Payment failed',
  refunded: 'Refunded',
  unpaid: 'Unpaid',
};

const PAYMENT_ICONS: Record<PaymentStatus, LucideIcon> = {
  paid: CheckCircle,
  pending: Clock,
  failed: XCircle,
  refunded: RotateCcw,
  unpaid: Circle,
};

interface PaymentBadgeProps {
  status: PaymentStatus;
  /** When paid, appended to the label as "Paid · online" / "Paid · cash". */
  method?: PaymentMethod | null;
  className?: string;
}

export function PaymentBadge({ status, method, className }: PaymentBadgeProps) {
  const Icon = PAYMENT_ICONS[status];
  const label =
    status === 'paid' && method
      ? `${PAYMENT_LABELS[status]} · ${method}`
      : PAYMENT_LABELS[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border',
        PAYMENT_STYLES[status],
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}
