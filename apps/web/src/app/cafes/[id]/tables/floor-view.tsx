'use client';

import type {
  FloorResponse,
  TableLiveStatus,
  TableWithStatus,
} from '@sangam/types';
import { LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { OpenSessionSheet } from './open-session-sheet';
import { TableSessionSheet } from './table-session-sheet';
import { authedFetch, formatRupees, LIVE_STATUS } from './tables-tool';

interface Props {
  cafeId: string;
  initialFloor: FloorResponse;
}

// How a free-table tap routes versus an active-session tap.
type SheetState =
  | { kind: 'none' }
  | { kind: 'open'; table: TableWithStatus }
  | { kind: 'session'; sessionId: string; tableLabel: string };

const UNGROUPED = '__ungrouped__';

export function FloorView({ cafeId, initialFloor }: Props) {
  const [tables, setTables] = useState(initialFloor.tables);
  const [sheet, setSheet] = useState<SheetState>({ kind: 'none' });

  const refreshFloor = useCallback(async () => {
    try {
      const data = await authedFetch<FloorResponse>(`/cafes/${cafeId}/floor`);
      setTables(data.tables);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh floor');
    }
  }, [cafeId]);

  // Soft auto-refresh so the floor reflects new orders / kitchen status without a tap.
  useEffect(() => {
    const t = setInterval(refreshFloor, 20_000);
    return () => clearInterval(t);
  }, [refreshFloor]);

  // Tables grouped by area, preserving server sort within each group.
  const groups = useMemo(() => {
    const byArea = new Map<string, TableWithStatus[]>();
    for (const t of tables) {
      const key = t.area?.trim() || UNGROUPED;
      const list = byArea.get(key);
      if (list) list.push(t);
      else byArea.set(key, [t]);
    }
    return Array.from(byArea.entries());
  }, [tables]);

  function handleTap(table: TableWithStatus) {
    if (table.session && table.liveStatus !== 'free') {
      setSheet({
        kind: 'session',
        sessionId: table.session.id,
        tableLabel: table.label,
      });
    } else {
      setSheet({ kind: 'open', table });
    }
  }

  function closeSheet() {
    setSheet({ kind: 'none' });
  }

  if (tables.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed">
        <div className="mx-auto size-12 rounded-lg bg-subtle border border-border grid place-items-center">
          <LayoutGrid className="size-5 text-muted" />
        </div>
        <h3 className="mt-4 font-medium">No tables yet</h3>
        <p className="mt-1 text-sm text-muted">
          No tables yet — add tables in Edit layout.
        </p>
        <div className="mt-6">
          <Link
            href={`/cafes/${cafeId}/tables/layout`}
            className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:opacity-80 transition-opacity"
          >
            <LayoutGrid className="size-4" />
            Edit layout
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <Legend />

      {groups.map(([area, areaTables]) => (
        <section key={area} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {area === UNGROUPED ? 'Tables' : area}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {areaTables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                onTap={() => handleTap(table)}
              />
            ))}
          </div>
        </section>
      ))}

      {sheet.kind === 'open' && (
        <OpenSessionSheet
          cafeId={cafeId}
          table={sheet.table}
          onClose={closeSheet}
          onOpened={() => {
            closeSheet();
            void refreshFloor();
          }}
        />
      )}

      {sheet.kind === 'session' && (
        <TableSessionSheet
          cafeId={cafeId}
          sessionId={sheet.sessionId}
          tableLabel={sheet.tableLabel}
          onClose={closeSheet}
          onChanged={() => {
            closeSheet();
            void refreshFloor();
          }}
        />
      )}
    </div>
  );
}

// ─── Table card (the tappable floor tile) ───────────────────────────────────

function TableCard({
  table,
  onTap,
}: {
  table: TableWithStatus;
  onTap: () => void;
}) {
  const style = LIVE_STATUS[table.liveStatus];
  const { Icon } = style;
  const active = table.liveStatus !== 'free' && table.session;

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Table ${table.label} — ${style.label}`}
      className={cn(
        'group flex min-h-[6.5rem] flex-col justify-between rounded-xl border p-3.5 text-left',
        'transition-all duration-150 active:scale-[0.98] touch-manipulation',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        style.card,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-semibold tracking-tight">
          {table.label}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
            style.chip,
          )}
        >
          <Icon className="size-3" aria-hidden="true" />
          {style.label}
        </span>
      </div>

      {active && table.session ? (
        <div className="space-y-0.5">
          <p className="truncate text-xs font-medium">
            {table.session.guestName?.trim() || 'Guest'}
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold tabular-nums">
              {formatRupees(table.runningTotalPaise)}
            </span>
            <span className="text-[10px] text-muted tabular-nums">
              {table.orderCount} {table.orderCount === 1 ? 'order' : 'orders'}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">
          {table.seats} {table.seats === 1 ? 'seat' : 'seats'} · Tap to seat
        </p>
      )}
    </button>
  );
}

// ─── Legend (state key — color + icon + text) ───────────────────────────────

function Legend() {
  const order: TableLiveStatus[] = ['free', 'occupied', 'ready', 'billed'];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {order.map((status) => {
        const s = LIVE_STATUS[status];
        const { Icon } = s;
        return (
          <span
            key={status}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
              s.chip,
            )}
          >
            <Icon className="size-3" aria-hidden="true" />
            {s.label}
          </span>
        );
      })}
    </div>
  );
}
