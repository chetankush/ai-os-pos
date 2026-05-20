import type { OrderStatus } from '@sangam/types';
import { cn } from '@/lib/cn';

/**
 * Shared status color mapping for orders.
 * Used across orders list, order detail, and dashboard for consistency.
 */
const STATUS_STYLES: Record<OrderStatus, string> = {
  pending:
    'bg-amber-100 text-amber-900 border-amber-200 ' +
    'dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-800',
  preparing:
    'bg-blue-100 text-blue-900 border-blue-200 ' +
    'dark:bg-blue-900/30 dark:text-blue-100 dark:border-blue-800',
  ready:
    'bg-emerald-100 text-emerald-900 border-emerald-200 ' +
    'dark:bg-emerald-900/30 dark:text-emerald-100 dark:border-emerald-800',
  completed:
    'bg-zinc-100 text-zinc-700 border-zinc-200 ' +
    'dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
  cancelled:
    'bg-red-100 text-red-900 border-red-200 ' +
    'dark:bg-red-900/30 dark:text-red-100 dark:border-red-800',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

interface StatusPillProps {
  status: OrderStatus;
  className?: string;
}

export function StatusPill({ status, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border',
        STATUS_STYLES[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
