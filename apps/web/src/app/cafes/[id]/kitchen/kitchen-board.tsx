'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { OrderStatus, OrderWithItems } from '@sangam/types';
import {
  CheckCircle2,
  ChefHat,
  Clock,
  PackageCheck,
  RefreshCw,
  UtensilsCrossed,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// How often to pull fresh tickets from the counter, and to re-tick the age
// timers. A kitchen cares about minutes, so 10s keeps the board live without
// hammering the API.
const REFRESH_MS = 10_000;

// Age thresholds (minutes) for visual triage — calm → amber → red.
const WARN_MIN = 10;
const LATE_MIN = 20;

// The kitchen owns pending → preparing → ready. Final completion + payment
// happens at the counter, which clears the ready ticket off the board.
const COLUMNS: {
  status: Extract<OrderStatus, 'pending' | 'preparing' | 'ready'>;
  title: string;
  bump: { next: OrderStatus; label: string; icon: React.ReactNode } | null;
}[] = [
  {
    status: 'pending',
    title: 'New',
    bump: { next: 'preparing', label: 'Start', icon: <ChefHat className="size-4" /> },
  },
  {
    status: 'preparing',
    title: 'Preparing',
    bump: { next: 'ready', label: 'Mark ready', icon: <PackageCheck className="size-4" /> },
  },
  {
    status: 'ready',
    title: 'Ready',
    bump: null,
  },
];

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

export function KitchenBoard({
  cafeId,
  cafeName,
  initialTickets,
}: {
  cafeId: string;
  cafeName: string;
  initialTickets: OrderWithItems[];
}) {
  const [tickets, setTickets] = useState<OrderWithItems[]>(initialTickets);
  // Starts at 0 so server and first client render agree (every age reads "now");
  // the mount effect immediately swaps in the real clock. Avoids a hydration
  // mismatch on the per-ticket age badges.
  const [now, setNow] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [bumping, setBumping] = useState<string | null>(null);
  // Guards against a slow refresh landing after a newer one / after unmount.
  const inFlight = useRef(false);

  const refresh = useCallback(
    async (manual = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (manual) setRefreshing(true);
      try {
        const res = await fetch(`${API_URL}/cafes/${cafeId}/kitchen/tickets`, {
          headers: await authedHeaders(),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
        const data = (await res.json()) as { tickets: OrderWithItems[] };
        setTickets(data.tickets);
      } catch {
        // Transient — the next tick will retry. Only surface manual failures.
        if (manual) toast.error('Could not refresh the board');
      } finally {
        inFlight.current = false;
        if (manual) setRefreshing(false);
      }
    },
    [cafeId],
  );

  // Live poll + clock tick on one interval. Initial data is server-rendered,
  // so this only *refreshes* — the first paint never waits on the client.
  useEffect(() => {
    setNow(Date.now()); // real clock the moment we're on the client
    const t = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  async function bump(ticket: OrderWithItems, next: OrderStatus) {
    setBumping(ticket.id);
    // Optimistic: move it immediately so the line feels responsive.
    setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, status: next } : t)));
    try {
      const res = await fetch(`${API_URL}/cafes/${cafeId}/orders/${ticket.id}/status`, {
        method: 'PATCH',
        headers: await authedHeaders(),
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(data?.error?.message ?? `Failed (${res.status})`);
      }
      toast.success(
        next === 'preparing' ? `${ticket.orderNumber} started` : `${ticket.orderNumber} ready`,
      );
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update ticket');
      void refresh(); // reconcile back to server truth
    } finally {
      setBumping(null);
    }
  }

  const active = COLUMNS.map((col) => ({
    ...col,
    items: tickets.filter((t) => t.status === col.status),
  }));
  const totalActive = tickets.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Kitchen</p>
          <h1 className="text-3xl font-semibold tracking-tight">{cafeName}</h1>
          <p className="text-sm text-muted">
            {totalActive === 0
              ? 'No active tickets'
              : `${totalActive} active ${totalActive === 1 ? 'ticket' : 'tickets'}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            Live
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => refresh(true)}
            loading={refreshing}
            disabled={refreshing}
          >
            {!refreshing && <RefreshCw className="size-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {totalActive === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {active.map((col) => (
            <section key={col.status} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">{col.title}</h2>
                <span className="text-xs tabular-nums text-muted">{col.items.length}</span>
              </div>
              <div className="space-y-3">
                {col.items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
                    Nothing here
                  </p>
                ) : (
                  col.items.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      now={now}
                      bump={col.bump}
                      busy={bumping === ticket.id}
                      onBump={(next) => bump(ticket, next)}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketCard({
  ticket,
  now,
  bump,
  busy,
  onBump,
}: {
  ticket: OrderWithItems;
  now: number;
  bump: { next: OrderStatus; label: string; icon: React.ReactNode } | null;
  busy: boolean;
  onBump: (next: OrderStatus) => void;
}) {
  const mins = Math.floor((now - new Date(ticket.createdAt).getTime()) / 60_000);
  const late = mins >= LATE_MIN;
  const warn = !late && mins >= WARN_MIN;

  return (
    <div
      className={cn(
        'rounded-xl border bg-bg p-4 shadow-sm transition-colors',
        // A left urgency bar via border color — calm border by default.
        late
          ? 'border-danger/40'
          : warn
            ? 'border-amber-400/60 dark:border-amber-600/60'
            : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-sm font-medium tracking-tight">{ticket.orderNumber}</span>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {ticket.tableLabel ? (
              <span className="rounded border border-border bg-subtle px-1.5 py-0.5 font-medium text-fg">
                Table {ticket.tableLabel}
              </span>
            ) : (
              <span className="capitalize">{ticket.source}</span>
            )}
            {ticket.customerName ? <span className="truncate">{ticket.customerName}</span> : null}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums',
            late
              ? 'border-danger/30 bg-danger/10 text-danger'
              : warn
                ? 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100'
                : 'border-border bg-subtle text-muted',
          )}
        >
          <Clock className="size-3" />
          {mins <= 0 ? 'now' : `${mins}m`}
        </span>
      </div>

      {/* Items — the part the kitchen actually reads. No prices on a KDS. */}
      <ul className="mt-3 space-y-1.5">
        {ticket.items.map((item) => (
          <li key={item.id} className="flex gap-2 text-sm">
            <span className="min-w-6 shrink-0 font-semibold tabular-nums text-accent">
              {item.quantity}×
            </span>
            <span className="min-w-0">
              <span className="font-medium">{item.itemNameSnapshot}</span>
              {item.notes ? (
                <span className="block text-xs italic text-muted">{item.notes}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {ticket.notes ? (
        <p className="mt-3 rounded-md border border-border bg-subtle px-2 py-1.5 text-xs italic text-muted">
          {ticket.notes}
        </p>
      ) : null}

      <div className="mt-4">
        {bump ? (
          <Button
            type="button"
            onClick={() => onBump(bump.next)}
            loading={busy}
            disabled={busy}
            className="w-full"
          >
            {!busy && bump.icon}
            {bump.label}
          </Button>
        ) : (
          <p className="flex items-center justify-center gap-1.5 py-1 text-xs font-medium text-success">
            <CheckCircle2 className="size-3.5" />
            Ready for pickup
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-lg border border-border bg-subtle">
        <UtensilsCrossed className="size-5 text-muted" />
      </div>
      <h3 className="mt-4 font-medium">The kitchen is clear</h3>
      <p className="mt-1 text-sm text-muted">
        New orders appear here automatically the moment they're placed.
      </p>
    </div>
  );
}
