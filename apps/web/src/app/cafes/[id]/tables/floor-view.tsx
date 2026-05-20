'use client';

import type {
  FloorResponse,
  TableLiveStatus,
  TableWithStatus,
} from '@sangam/types';
import { LayoutGrid, Users } from 'lucide-react';
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

// Logical floor-plan space — must match the layout editor so saved x/y line up.
const CANVAS_W = 1000;
const CANVAS_H = 640;
const CHIP = 88;

type ViewMode = 'room' | 'grid';

export function FloorView({ cafeId, initialFloor }: Props) {
  const [tables, setTables] = useState(initialFloor.tables);
  const [sheet, setSheet] = useState<SheetState>({ kind: 'none' });
  const [view, setView] = useState<ViewMode>('room');

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend />
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === 'room' ? (
        <RoomCanvas tables={tables} onTap={handleTap} />
      ) : (
        <div className="space-y-8">
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
        </div>
      )}

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

// ─── Room / Grid view toggle ────────────────────────────────────────────────

function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Floor view"
      className="inline-flex rounded-lg border border-border bg-subtle p-0.5"
    >
      {(['room', 'grid'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          className={cn(
            'min-h-8 rounded-md px-3 text-xs font-medium transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg',
            view === v ? 'bg-bg text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {v === 'room' ? 'Room' : 'Grid'}
        </button>
      ))}
    </div>
  );
}

// ─── Room view (spatial floor plan, live status) ─────────────────────────────

function RoomCanvas({
  tables,
  onTap,
}: {
  tables: TableWithStatus[];
  onTap: (table: TableWithStatus) => void;
}) {
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-border bg-subtle/40',
        // faint plan grid so positions read as a room, not a void
        '[background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)]',
        '[background-size:40px_40px] [background-position:-1px_-1px]',
      )}
      style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
    >
      {tables.map((table) => (
        <RoomChip key={table.id} table={table} onTap={() => onTap(table)} />
      ))}
    </div>
  );
}

function RoomChip({
  table,
  onTap,
}: {
  table: TableWithStatus;
  onTap: () => void;
}) {
  const style = LIVE_STATUS[table.liveStatus];
  const { Icon } = style;
  const active = table.liveStatus !== 'free' && table.session;
  const isRound = table.shape === 'round';

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Table ${table.label} — ${style.label}`}
      className={cn(
        'absolute flex flex-col items-center justify-center gap-0.5 border p-1 text-center',
        'transition-all duration-150 active:scale-[0.97] touch-manipulation',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        isRound ? 'rounded-full' : 'rounded-xl',
        style.card,
      )}
      style={{
        left: `${(table.x / CANVAS_W) * 100}%`,
        top: `${(table.y / CANVAS_H) * 100}%`,
        width: `${(CHIP / CANVAS_W) * 100}%`,
        height: `${(CHIP / CANVAS_H) * 100}%`,
      }}
    >
      <span
        className={cn(
          'absolute right-1 top-1 grid size-4 place-items-center rounded-full border',
          style.chip,
        )}
      >
        <Icon className="size-2.5" aria-hidden="true" />
      </span>

      <span className="text-sm font-semibold leading-none">{table.label}</span>
      {active && table.session ? (
        <span className="text-[11px] font-semibold tabular-nums leading-none">
          {formatRupees(table.runningTotalPaise)}
        </span>
      ) : (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted leading-none">
          <Users className="size-2.5" aria-hidden="true" />
          {table.seats}
        </span>
      )}
    </button>
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
