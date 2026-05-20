'use client';

import type {
  CreateTableRequest,
  RestaurantTable,
  TableShape,
  UpdateTableRequest,
} from '@sangam/types';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LayoutGrid,
  Plus,
  Printer,
  QrCode,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Props {
  cafeId: string;
  slug: string;
  cafeName: string;
  initialTables: RestaurantTable[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Canvas geometry. Tables store absolute (x,y) of their top-left corner; we clamp
// so a chip is never dragged off the canvas regardless of its size.
const CANVAS_W = 1000;
const CANVAS_H = 640;
const CHIP = 88; // chip is a square box; round vs square only changes the radius.
const DRAG_THRESHOLD = 6; // px of movement before a drag actually begins (vs a tap).
const NUDGE = 8; // px moved per arrow-nudge / arrow-key press.

async function authedFetch(path: string, init: RequestInit = {}) {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export function LayoutEditor({ cafeId, slug, cafeName, initialTables }: Props) {
  const [tables, setTables] = useState<RestaurantTable[]>(
    [...initialTables].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(initialTables.length === 0);
  const [origin, setOrigin] = useState<string | null>(null);

  // origin is computed on mount only, so SSR and first client render match.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const selected = useMemo(
    () => tables.find((t) => t.id === selectedId) ?? null,
    [tables, selectedId],
  );

  const patchLocal = useCallback((id: string, patch: Partial<RestaurantTable>) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const removeLocal = useCallback((id: string) => {
    setTables((prev) => prev.filter((t) => t.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  function addLocal(table: RestaurantTable) {
    setTables((prev) => [...prev, table]);
    setSelectedId(table.id);
    setShowAdd(false);
  }

  // Persist a position change to the API; reverts local state on failure.
  const savePosition = useCallback(
    async (id: string, x: number, y: number, prevX: number, prevY: number) => {
      try {
        await authedFetch(`/cafes/${cafeId}/tables/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ x, y } satisfies UpdateTableRequest),
        });
      } catch (err) {
        patchLocal(id, { x: prevX, y: prevY });
        toast.error(err instanceof Error ? err.message : 'Could not save position');
      }
    },
    [cafeId, patchLocal],
  );

  function urlFor(label: string): string {
    return `${origin ?? ''}/m/${slug}?table=${encodeURIComponent(label)}`;
  }

  return (
    <div className="space-y-8">
      {/* Print-only reset so the QR sheet sits on white paper. */}
      <style>{`@media print { body { background: #fff; } }`}</style>

      {/* ─── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted">
          Place tables where they physically sit. Drag to arrange on desktop, or
          tap a table to edit on any device.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {tables.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => window.print()}
            >
              <Printer className="size-4" />
              Print QR codes
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => setShowAdd((v) => !v)}
            aria-expanded={showAdd}
          >
            <Plus className="size-4" />
            Add table
          </Button>
        </div>
      </div>

      {showAdd && (
        <AddTableForm
          cafeId={cafeId}
          sortOrder={tables.length}
          onDone={addLocal}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {tables.length === 0 ? (
        <EmptyState onAdd={() => setShowAdd(true)} />
      ) : (
        <>
          {/* ── Desktop: free-drag canvas ─────────────────────────────────── */}
          <div className="hidden md:block print:hidden">
            <FloorCanvas
              tables={tables}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDragLive={(id, x, y) => patchLocal(id, { x, y })}
              onDragEnd={savePosition}
            />
          </div>

          {/* ── Mobile: tap-to-edit list with arrow-nudge positioning ─────── */}
          <div className="md:hidden print:hidden space-y-3">
            {tables.map((t) => (
              <TableListRow
                key={t.id}
                table={t}
                selected={t.id === selectedId}
                onSelect={() => setSelectedId((cur) => (cur === t.id ? null : t.id))}
                onNudge={(dx, dy) => {
                  const nx = clamp(t.x + dx, 0, CANVAS_W - CHIP);
                  const ny = clamp(t.y + dy, 0, CANVAS_H - CHIP);
                  patchLocal(t.id, { x: nx, y: ny });
                  void savePosition(t.id, nx, ny, t.x, t.y);
                }}
              />
            ))}
          </div>
        </>
      )}

      {/* ─── Edit panel for the selected table ────────────────────────────── */}
      {selected && (
        <EditTablePanel
          key={selected.id}
          cafeId={cafeId}
          table={selected}
          origin={origin}
          url={urlFor(selected.label)}
          onSaved={(patch) => patchLocal(selected.id, patch)}
          onDeleted={() => removeLocal(selected.id)}
          onClose={() => setSelectedId(null)}
          onNudge={(dx, dy) => {
            const nx = clamp(selected.x + dx, 0, CANVAS_W - CHIP);
            const ny = clamp(selected.y + dy, 0, CANVAS_H - CHIP);
            patchLocal(selected.id, { x: nx, y: ny });
            void savePosition(selected.id, nx, ny, selected.x, selected.y);
          }}
        />
      )}

      {/* ─── Print-only QR grid ───────────────────────────────────────────── */}
      <div className="hidden print:grid print:grid-cols-3 print:gap-4">
        {tables.map((t) => (
          <div
            key={t.id}
            className="flex flex-col items-center gap-2 text-center break-inside-avoid p-4"
          >
            <p className="text-xs uppercase tracking-wider text-muted font-medium">
              {cafeName}
            </p>
            <p className="text-lg font-semibold tracking-tight">{t.label}</p>
            <div className="rounded-lg bg-white p-2">
              {origin ? (
                <QRCodeCanvas value={urlFor(t.label)} size={150} marginSize={2} />
              ) : null}
            </div>
            <p className="text-[11px] text-muted">Scan to order</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Empty state ──────────────────────────────────────────────────────────── */

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card className="p-12 text-center border-dashed print:hidden">
      <div className="mx-auto size-12 rounded-lg bg-subtle border border-border grid place-items-center">
        <LayoutGrid className="size-5 text-muted" />
      </div>
      <h3 className="mt-4 font-medium">No tables yet</h3>
      <p className="mt-1 text-sm text-muted">Add your first table.</p>
      <div className="mt-6">
        <Button onClick={onAdd}>
          <Plus className="size-4" />
          Add table
        </Button>
      </div>
    </Card>
  );
}

/* ─── Drag canvas (desktop) ────────────────────────────────────────────────── */

function FloorCanvas({
  tables,
  selectedId,
  onSelect,
  onDragLive,
  onDragEnd,
}: {
  tables: RestaurantTable[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDragLive: (id: string, x: number, y: number) => void;
  onDragEnd: (
    id: string,
    x: number,
    y: number,
    prevX: number,
    prevY: number,
  ) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  // Mutable drag session — kept in a ref so pointermove doesn't re-render per frame.
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    scale: number;
    moved: boolean;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function onPointerDown(e: ReactPointerEvent, t: RestaurantTable) {
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // scale = rendered px / logical px, so pointer deltas map to canvas coords.
    const scale = canvas.clientWidth / CANVAS_W || 1;
    drag.current = {
      id: t.id,
      startX: e.clientX,
      startY: e.clientY,
      originX: t.x,
      originY: t.y,
      scale,
      moved: false,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dxPx = e.clientX - d.startX;
    const dyPx = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dxPx, dyPx) < DRAG_THRESHOLD) return; // threshold
    if (!d.moved) {
      d.moved = true;
      setDraggingId(d.id);
    }
    const nx = clamp(d.originX + dxPx / d.scale, 0, CANVAS_W - CHIP);
    const ny = clamp(d.originY + dyPx / d.scale, 0, CANVAS_H - CHIP);
    onDragLive(d.id, nx, ny);
  }

  function endDrag(e: ReactPointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (!d.moved) {
      onSelect(d.id); // a tap (no movement) just selects.
    } else {
      setDraggingId(null);
      const moving = tables.find((t) => t.id === d.id);
      if (moving) onDragEnd(d.id, moving.x, moving.y, d.originX, d.originY);
    }
  }

  return (
    <div
      ref={canvasRef}
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-border',
        'bg-subtle/40 select-none touch-none',
        // subtle grid so positions read as a plan, not a void
        '[background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)]',
        '[background-size:40px_40px] [background-position:-1px_-1px]',
      )}
      style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
    >
      {tables.map((t) => (
        <TableChip
          key={t.id}
          table={t}
          selected={t.id === selectedId}
          dragging={t.id === draggingId}
          onPointerDown={(e) => onPointerDown(e, t)}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(e) => {
            // Keyboard alternative to drag — arrow keys nudge by NUDGE px.
            const map: Record<string, [number, number]> = {
              ArrowUp: [0, -NUDGE],
              ArrowDown: [0, NUDGE],
              ArrowLeft: [-NUDGE, 0],
              ArrowRight: [NUDGE, 0],
            };
            const delta = map[e.key];
            if (!delta) return;
            e.preventDefault();
            const nx = clamp(t.x + delta[0], 0, CANVAS_W - CHIP);
            const ny = clamp(t.y + delta[1], 0, CANVAS_H - CHIP);
            onDragLive(t.id, nx, ny);
            onDragEnd(t.id, nx, ny, t.x, t.y);
          }}
          onFocus={() => onSelect(t.id)}
        />
      ))}
    </div>
  );
}

function TableChip({
  table,
  selected,
  dragging,
  ...handlers
}: {
  table: RestaurantTable;
  selected: boolean;
  dragging: boolean;
} & {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
}) {
  const isRound = table.shape === 'round';
  return (
    <button
      type="button"
      aria-label={`${table.label}${table.area ? `, ${table.area}` : ''}, ${table.seats} seats. Drag or use arrow keys to move.`}
      aria-pressed={selected}
      className={cn(
        'absolute grid place-items-center text-center',
        'border bg-bg shadow-sm transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        isRound ? 'rounded-full' : 'rounded-lg',
        dragging
          ? 'cursor-grabbing scale-105 shadow-lg z-20 border-accent'
          : 'cursor-grab z-10 hover:border-border-strong',
        selected && !dragging
          ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-bg'
          : 'border-border',
      )}
      style={{
        // transform-only positioning keeps drags off the layout/reflow path.
        width: CHIP,
        height: CHIP,
        transform: `translate(${table.x}px, ${table.y}px)`,
        left: 0,
        top: 0,
        // disable transform-transition while dragging for 1:1 finger tracking
        transitionProperty: dragging ? 'box-shadow' : undefined,
      }}
      {...handlers}
    >
      <span className="px-1 max-w-full truncate text-sm font-semibold leading-tight">
        {table.label}
      </span>
      <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-muted tabular-nums">
        <Users className="size-3" aria-hidden />
        {table.seats}
      </span>
    </button>
  );
}

/* ─── Mobile list row ──────────────────────────────────────────────────────── */

function TableListRow({
  table,
  selected,
  onSelect,
  onNudge,
}: {
  table: RestaurantTable;
  selected: boolean;
  onSelect: () => void;
  onNudge: (dx: number, dy: number) => void;
}) {
  const isRound = table.shape === 'round';
  return (
    <Card
      className={cn(
        'p-3 transition-all',
        selected && 'ring-2 ring-accent ring-offset-2 ring-offset-bg border-accent',
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`Edit ${table.label}`}
          className="flex flex-1 items-center gap-3 min-h-11 text-left rounded-lg -m-1 p-1 active:bg-subtle"
        >
          <span
            aria-hidden
            className={cn(
              'grid place-items-center size-11 shrink-0 border border-border-strong bg-subtle text-xs font-semibold',
              isRound ? 'rounded-full' : 'rounded-lg',
            )}
          >
            {table.seats}
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-sm truncate">{table.label}</span>
            <span className="block text-xs text-muted truncate">
              {table.area || 'No area'} · {isRound ? 'Round' : 'Square'}
            </span>
          </span>
        </button>

        {/* Arrow-nudge: precise positioning without a drag canvas on phones. */}
        <div className="shrink-0 grid grid-cols-3 grid-rows-2 gap-0.5">
          <span />
          <NudgeBtn label="Move up" onClick={() => onNudge(0, -NUDGE)}>
            <ChevronUp className="size-4" />
          </NudgeBtn>
          <span />
          <NudgeBtn label="Move left" onClick={() => onNudge(-NUDGE, 0)}>
            <ChevronLeft className="size-4" />
          </NudgeBtn>
          <NudgeBtn label="Move down" onClick={() => onNudge(0, NUDGE)}>
            <ChevronDown className="size-4" />
          </NudgeBtn>
          <NudgeBtn label="Move right" onClick={() => onNudge(NUDGE, 0)}>
            <ChevronRight className="size-4" />
          </NudgeBtn>
        </div>
      </div>
    </Card>
  );
}

function NudgeBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid place-items-center size-9 rounded-md text-muted hover:text-fg hover:bg-subtle active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
    >
      {children}
    </button>
  );
}

/* ─── Add table ────────────────────────────────────────────────────────────── */

function AddTableForm({
  cafeId,
  sortOrder,
  onDone,
  onCancel,
}: {
  cafeId: string;
  sortOrder: number;
  onDone: (table: RestaurantTable) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState('');
  const [area, setArea] = useState('');
  const [shape, setShape] = useState<TableShape>('round');
  const [seats, setSeats] = useState('4');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Enter a table label');
      return;
    }
    const seatCount = Number(seats);
    if (!Number.isInteger(seatCount) || seatCount < 1) {
      setError('Enter a valid number of seats');
      return;
    }

    setSubmitting(true);
    try {
      // Stagger new tables so they don't stack exactly on top of each other.
      const offset = (sortOrder % 6) * 24;
      const body: CreateTableRequest = {
        label: trimmed,
        area: area.trim() || undefined,
        shape,
        seats: seatCount,
        x: 24 + offset,
        y: 24 + offset,
        sortOrder,
      };
      const data = await authedFetch(`/cafes/${cafeId}/tables`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onDone(data.table as RestaurantTable);
      toast.success(`Added ${trimmed}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add table');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="print:hidden">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="grid sm:grid-cols-[1fr_1fr_120px] gap-3">
          <Field label="Label" htmlFor="add-label">
            <Input
              id="add-label"
              autoFocus
              placeholder="T1, Patio 2…"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              maxLength={40}
            />
          </Field>
          <Field label="Area" hint="e.g. Main Hall, Near Window" htmlFor="add-area">
            <Input
              id="add-area"
              placeholder="Main Hall"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              maxLength={60}
            />
          </Field>
          <Field label="Seats" htmlFor="add-seats">
            <Input
              id="add-seats"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              required
            />
          </Field>
        </div>

        <ShapePicker value={shape} onChange={setShape} idPrefix="add" />

        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={buttonClasses({ variant: 'ghost', size: 'sm' })}
          >
            Cancel
          </button>
          <Button type="submit" size="sm" loading={submitting}>
            {submitting ? 'Adding' : 'Add table'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ─── Edit / delete / QR panel ─────────────────────────────────────────────── */

function EditTablePanel({
  cafeId,
  table,
  origin,
  url,
  onSaved,
  onDeleted,
  onClose,
  onNudge,
}: {
  cafeId: string;
  table: RestaurantTable;
  origin: string | null;
  url: string;
  onSaved: (patch: Partial<RestaurantTable>) => void;
  onDeleted: () => void;
  onClose: () => void;
  onNudge: (dx: number, dy: number) => void;
}) {
  const [label, setLabel] = useState(table.label);
  const [area, setArea] = useState(table.area ?? '');
  const [shape, setShape] = useState<TableShape>(table.shape);
  const [seats, setSeats] = useState(String(table.seats));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showQr, setShowQr] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Enter a table label');
      return;
    }
    const seatCount = Number(seats);
    if (!Number.isInteger(seatCount) || seatCount < 1) {
      setError('Enter a valid number of seats');
      return;
    }

    const patch: UpdateTableRequest = {
      label: trimmed,
      area: area.trim() || null,
      shape,
      seats: seatCount,
    };
    setSubmitting(true);
    try {
      const data = await authedFetch(`/cafes/${cafeId}/tables/${table.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      onSaved((data?.table as Partial<RestaurantTable>) ?? patch);
      toast.success(`Updated ${trimmed}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update table');
    } finally {
      setSubmitting(false);
    }
  }

  function doDelete() {
    setDeleting(true);
    void (async () => {
      try {
        await authedFetch(`/cafes/${cafeId}/tables/${table.id}`, {
          method: 'DELETE',
        });
        toast.success(`Deleted ${table.label}`);
        onDeleted();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete table');
        setDeleting(false);
      }
    })();
  }

  return (
    <Card className="print:hidden">
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">
            Edit table
            <span className="ml-2 font-normal text-muted">{table.label}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="grid place-items-center size-9 -m-1 rounded-md text-muted hover:text-fg hover:bg-subtle transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid sm:grid-cols-[1fr_1fr_120px] gap-3">
            <Field label="Label" htmlFor="edit-label">
              <Input
                id="edit-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                maxLength={40}
              />
            </Field>
            <Field label="Area" htmlFor="edit-area">
              <Input
                id="edit-area"
                placeholder="Main Hall"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                maxLength={60}
              />
            </Field>
            <Field label="Seats" htmlFor="edit-seats">
              <Input
                id="edit-seats"
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                required
              />
            </Field>
          </div>

          <ShapePicker value={shape} onChange={setShape} idPrefix="edit" />

          {error && (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowQr((v) => !v)}
                aria-expanded={showQr}
                className={buttonClasses({ variant: 'secondary', size: 'sm' })}
              >
                <QrCode className="size-4" />
                {showQr ? 'Hide QR' : 'Show QR'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={deleting}
                className={buttonClasses({ variant: 'ghost', size: 'sm' })}
              >
                <Trash2 className="size-4 text-danger" />
                <span className="text-danger">Delete</span>
              </button>
            </div>
            <Button type="submit" size="sm" loading={submitting}>
              {submitting ? 'Saving' : 'Save changes'}
            </Button>
          </div>
        </form>

        {/* Nudge controls double as a keyboard/touch alternative to dragging. */}
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <span className="text-xs text-muted">Position</span>
          <div className="grid grid-cols-3 grid-rows-2 gap-0.5">
            <span />
            <NudgeBtn label="Move up" onClick={() => onNudge(0, -NUDGE)}>
              <ChevronUp className="size-4" />
            </NudgeBtn>
            <span />
            <NudgeBtn label="Move left" onClick={() => onNudge(-NUDGE, 0)}>
              <ChevronLeft className="size-4" />
            </NudgeBtn>
            <NudgeBtn label="Move down" onClick={() => onNudge(0, NUDGE)}>
              <ChevronDown className="size-4" />
            </NudgeBtn>
            <NudgeBtn label="Move right" onClick={() => onNudge(NUDGE, 0)}>
              <ChevronRight className="size-4" />
            </NudgeBtn>
          </div>
          <span className="text-xs text-muted tabular-nums">
            x {Math.round(table.x)} · y {Math.round(table.y)}
          </span>
        </div>

        {showQr && (
          <div className="flex flex-col items-center gap-2 border-t border-border pt-4 text-center">
            <div className="rounded-lg bg-white p-2">
              {origin ? (
                <QRCodeCanvas value={url} size={160} marginSize={2} />
              ) : (
                <div className="size-[160px]" aria-hidden />
              )}
            </div>
            <p className="text-xs text-muted break-all max-w-xs">{url}</p>
            <button
              type="button"
              onClick={() => window.print()}
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              <Printer className="size-4" />
              Print all QR codes
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${table.label}?`}
        description="This removes the table from your floor plan. Past orders keep their record."
        confirmLabel="Delete"
        destructive
        onConfirm={doDelete}
      />
    </Card>
  );
}

/* ─── Shared shape picker ──────────────────────────────────────────────────── */

function ShapePicker({
  value,
  onChange,
  idPrefix,
}: {
  value: TableShape;
  onChange: (shape: TableShape) => void;
  idPrefix: string;
}) {
  const options: { shape: TableShape; label: string }[] = [
    { shape: 'round', label: 'Round' },
    { shape: 'square', label: 'Square' },
  ];
  return (
    <div>
      <p className="text-sm font-medium text-fg/90 tracking-wider mb-1.5">Shape</p>
      <div className="flex items-center gap-2" role="radiogroup" aria-label="Table shape">
        {options.map(({ shape, label }) => {
          const active = value === shape;
          return (
            <button
              key={shape}
              id={`${idPrefix}-shape-${shape}`}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(shape)}
              className={cn(
                'inline-flex items-center gap-2 h-11 px-3.5 rounded-lg border text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-muted hover:border-border-strong',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'size-4 border-2',
                  shape === 'round' ? 'rounded-full' : 'rounded-sm',
                  active ? 'border-accent' : 'border-current',
                )}
              />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
