'use client';

import type {
  Cafe,
  CreateOrderRequest,
  MenuCategoryWithItems,
  MenuItem,
  OrderResponse,
} from '@sangam/types';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Props {
  cafeId: string;
  cafe: Cafe;
  categories: MenuCategoryWithItems[];
}

interface CartLine {
  menuItem: MenuItem;
  quantity: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PHONE_RE = /^\+?\d{7,15}$/;
const MAX_QTY = 99;
const ALL = '__all__';

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

function formatRupees(paise: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(
    Math.round(paise / 100),
  )}`;
}

export function OrderBuilder({ cafeId, cafe, categories }: Props) {
  const router = useRouter();
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map());
  const [tableLabel, setTableLabel] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // ─── Cart mutations ──────────────────────────────────────────────────────────

  function addItem(item: MenuItem) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(item.id);
      if (existing) {
        if (existing.quantity >= MAX_QTY) return prev;
        next.set(item.id, { ...existing, quantity: existing.quantity + 1 });
      } else {
        next.set(item.id, { menuItem: item, quantity: 1 });
      }
      return next;
    });
    setError(null);
  }

  function setQuantity(itemId: string, qty: number) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (!existing) return prev;
      if (qty <= 0) next.delete(itemId);
      else next.set(itemId, { ...existing, quantity: Math.min(MAX_QTY, qty) });
      return next;
    });
  }

  function removeItem(itemId: string) {
    setCart((prev) => {
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
  }

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const cartLines = useMemo(() => Array.from(cart.values()), [cart]);
  const itemCount = useMemo(
    () => cartLines.reduce((s, l) => s + l.quantity, 0),
    [cartLines],
  );
  const subtotalPaise = useMemo(
    () => cartLines.reduce((s, l) => s + l.menuItem.basePricePaise * l.quantity, 0),
    [cartLines],
  );
  const gstRateBp = cafe.isAirConditioned ? 1800 : 500;
  const taxPaise = Math.round((subtotalPaise * gstRateBp) / 10000);
  const totalPaise = subtotalPaise + taxPaise;

  // Available categories that actually have available items.
  const liveCategories = useMemo(
    () =>
      categories
        .map((c) => ({ ...c, items: c.items.filter((i) => i.isAvailable) }))
        .filter((c) => c.items.length > 0),
    [categories],
  );

  // Flat, filtered item list for the dense pad (search + active category).
  const visibleCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return liveCategories
      .filter((c) => activeCat === ALL || c.id === activeCat)
      .map((c) => ({
        ...c,
        items: c.items.filter((i) => q === '' || i.name.toLowerCase().includes(q)),
      }))
      .filter((c) => c.items.length > 0);
  }, [liveCategories, activeCat, search]);

  const hasMenu = liveCategories.length > 0;

  // ─── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setError(null);
    if (cartLines.length === 0) {
      setError('Add at least one item');
      return;
    }
    const trimmedPhone = customerPhone.trim();
    if (trimmedPhone && !PHONE_RE.test(trimmedPhone)) {
      setError('Enter a valid phone number');
      return;
    }

    const body: CreateOrderRequest = {
      source: 'counter',
      items: cartLines.map((l) => ({ menuItemId: l.menuItem.id, quantity: l.quantity })),
      ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
      ...(trimmedPhone ? { customerPhone: trimmedPhone } : {}),
      ...(tableLabel.trim() ? { tableLabel: tableLabel.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    setSubmitting(true);
    try {
      const data = (await authedFetch(`/cafes/${cafeId}/orders`, {
        method: 'POST',
        body: JSON.stringify(body),
      })) as OrderResponse;
      toast.success(`Order ${data.order.orderNumber} placed`);
      router.push(`/cafes/${cafeId}/orders/${data.order.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create order');
      setSubmitting(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const cartProps = {
    cartLines,
    itemCount,
    subtotalPaise,
    taxPaise,
    totalPaise,
    gstRateBp,
    tableLabel,
    setTableLabel,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    notes,
    setNotes,
    error,
    submitting,
    onInc: (id: string) => {
      const l = cart.get(id);
      if (l) setQuantity(id, l.quantity + 1);
    },
    onDec: (id: string) => {
      const l = cart.get(id);
      if (l) setQuantity(id, l.quantity - 1);
    },
    onRemove: removeItem,
    onSubmit: handleSubmit,
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-5">
        {/* ─── Fast item pad ─────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="size-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="pl-9"
              aria-label="Search menu items"
            />
          </div>

          {/* Category chips — tap to jump/filter */}
          {hasMenu && (
            <div className="sticky top-14 z-20 -mx-1 flex gap-2 overflow-x-auto bg-bg/95 px-1 py-2 backdrop-blur">
              <Chip active={activeCat === ALL} onClick={() => setActiveCat(ALL)}>
                All
              </Chip>
              {liveCategories.map((c) => (
                <Chip
                  key={c.id}
                  active={activeCat === c.id}
                  onClick={() => setActiveCat(c.id)}
                >
                  {c.name}
                </Chip>
              ))}
            </div>
          )}

          {/* Item tiles */}
          {!hasMenu ? (
            <Card className="p-12 text-center border-dashed">
              <p className="text-sm text-muted">
                No available items. Add items in the menu editor first.
              </p>
            </Card>
          ) : visibleCategories.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <p className="text-sm text-muted">No items match “{search}”.</p>
            </Card>
          ) : (
            <div className="space-y-5">
              {visibleCategories.map((cat) => (
                <section key={cat.id} className="space-y-2">
                  {activeCat === ALL && (
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                      {cat.name}
                    </h2>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {cat.items.map((item) => (
                      <ItemTile
                        key={item.id}
                        item={item}
                        qty={cart.get(item.id)?.quantity ?? 0}
                        onAdd={() => addItem(item)}
                        onDec={() => {
                          const l = cart.get(item.id);
                          if (l) setQuantity(item.id, l.quantity - 1);
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* ─── Cart (desktop, sticky) ────────────────────────────────────── */}
        <div className="lg:col-span-2 hidden lg:block">
          <div className="lg:sticky lg:top-20">
            <CartPanel {...cartProps} />
          </div>
        </div>
      </div>

      {/* ─── Mobile floating cart pill ───────────────────────────────────── */}
      {itemCount > 0 && (
        <button
          type="button"
          onClick={() => setMobileCartOpen(true)}
          className={cn(
            'lg:hidden fixed bottom-4 inset-x-4 z-40 h-14 rounded-full',
            'flex items-center justify-between px-5',
            'bg-accent text-accent-fg shadow-lg shadow-black/15',
            'active:scale-[0.99] transition-transform',
          )}
        >
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            <ShoppingBag className="size-4" />
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {formatRupees(totalPaise)} · Review
          </span>
        </button>
      )}

      {/* ─── Mobile cart drawer ──────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileCartOpen && (
          <motion.div
            className="lg:hidden fixed inset-0 z-50 flex items-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Close cart"
              onClick={() => setMobileCartOpen(false)}
              className="absolute inset-0 bg-black/40"
            />
            <motion.div
              className="relative w-full max-h-[88vh] overflow-y-auto rounded-t-2xl border-t border-border bg-bg"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg p-4">
                <h2 className="text-base font-semibold tracking-tight">
                  Cart ({itemCount})
                </h2>
                <button
                  type="button"
                  onClick={() => setMobileCartOpen(false)}
                  aria-label="Close"
                  className="grid size-9 place-items-center rounded-md text-muted hover:bg-subtle hover:text-fg"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="p-4">
                <CartPanel {...cartProps} embedded />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Category chip ─────────────────────────────────────────────────────────────

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        active
          ? 'border-fg bg-accent text-accent-fg'
          : 'border-border text-muted hover:border-border-strong hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

// ─── Item tile (the fast tap target) ────────────────────────────────────────────

function ItemTile({
  item,
  qty,
  onAdd,
  onDec,
}: {
  item: MenuItem;
  qty: number;
  onAdd: () => void;
  onDec: () => void;
}) {
  const dietLabel = item.isVegetarian ? 'Vegetarian' : 'Non-vegetarian';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onAdd}
        className={cn(
          'flex h-24 w-full flex-col justify-between rounded-xl border bg-bg p-3 text-left',
          'transition-all duration-100 touch-manipulation active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          qty > 0
            ? 'border-fg ring-1 ring-fg'
            : 'border-border hover:border-border-strong hover:bg-subtle/50',
        )}
      >
        <div className="flex items-start gap-1.5">
          <span
            role="img"
            aria-label={dietLabel}
            className={cn(
              'mt-0.5 size-3 shrink-0 rounded-sm border-2',
              item.isVegetarian ? 'border-success' : 'border-danger',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'block size-full scale-50 rounded-full',
                item.isVegetarian ? 'bg-success' : 'bg-danger',
              )}
            />
          </span>
          <span className="line-clamp-2 text-sm font-medium leading-tight">
            {item.name}
          </span>
        </div>
        <span className="font-mono text-sm tabular-nums">
          {formatRupees(item.basePricePaise)}
        </span>
      </button>

      {/* In-tile quantity controls — adjust without opening the cart */}
      {qty > 0 && (
        <button
          type="button"
          onClick={onDec}
          aria-label={`Remove one ${item.name}`}
          className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-lg border border-border bg-bg text-fg shadow-sm hover:bg-subtle"
        >
          <Minus className="size-3.5" />
        </button>
      )}
      {qty > 0 && (
        <span
          aria-label={`${qty} in cart`}
          className="absolute -right-1.5 -top-1.5 grid min-w-6 place-items-center rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold tabular-nums text-accent-fg shadow"
        >
          {qty}
        </span>
      )}
    </div>
  );
}

// ─── Cart panel ──────────────────────────────────────────────────────────────

interface CartPanelProps {
  cartLines: CartLine[];
  itemCount: number;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  gstRateBp: number;
  tableLabel: string;
  setTableLabel: (v: string) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  customerPhone: string;
  setCustomerPhone: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  error: string | null;
  submitting: boolean;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onRemove: (id: string) => void;
  onSubmit: () => void;
  embedded?: boolean;
}

function CartPanel(props: CartPanelProps) {
  const {
    cartLines,
    itemCount,
    subtotalPaise,
    taxPaise,
    totalPaise,
    gstRateBp,
    tableLabel,
    setTableLabel,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    notes,
    setNotes,
    error,
    submitting,
    onInc,
    onDec,
    onRemove,
    onSubmit,
    embedded,
  } = props;
  const [showDetails, setShowDetails] = useState(false);

  const body = (
    <>
      {error && (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
        >
          {error}
        </div>
      )}

      {cartLines.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          Tap items to build the order
        </p>
      ) : (
        <ul className="divide-y divide-border">
          <AnimatePresence initial={false}>
            {cartLines.map((line) => (
              <motion.li
                key={line.menuItem.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.menuItem.name}</p>
                    <p className="text-[11px] tabular-nums text-muted">
                      {formatRupees(line.menuItem.basePricePaise * line.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onDec(line.menuItem.id)}
                      aria-label={`Decrease ${line.menuItem.name}`}
                      className="grid size-9 place-items-center rounded-md border border-border bg-bg hover:bg-subtle"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="min-w-6 text-center text-sm font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onInc(line.menuItem.id)}
                      aria-label={`Increase ${line.menuItem.name}`}
                      className="grid size-9 place-items-center rounded-md border border-border bg-bg hover:bg-subtle"
                    >
                      <Plus className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(line.menuItem.id)}
                      aria-label={`Remove ${line.menuItem.name}`}
                      className="ml-0.5 grid size-9 place-items-center rounded-md text-muted hover:bg-danger/5 hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Totals */}
      <div className="space-y-1.5 border-t border-border pt-3">
        <Row label="Subtotal" value={formatRupees(subtotalPaise)} muted />
        <Row
          label={`GST (${(gstRateBp / 100).toFixed(0)}%)`}
          value={formatRupees(taxPaise)}
          muted
        />
        <div className="flex items-baseline justify-between border-t border-border pt-2">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatRupees(totalPaise)}
          </span>
        </div>
      </div>

      {/* Optional details — collapsed by default to keep the flow fast */}
      <button
        type="button"
        onClick={() => setShowDetails((s) => !s)}
        className="text-xs text-muted hover:text-fg transition-colors"
      >
        {showDetails ? 'Hide' : 'Add'} table / customer details
      </button>
      {showDetails && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Table" htmlFor="o-table">
              <Input
                id="o-table"
                value={tableLabel}
                onChange={(e) => setTableLabel(e.target.value)}
                placeholder="T1"
                maxLength={20}
              />
            </Field>
            <Field label="Customer" htmlFor="o-name">
              <Input
                id="o-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in"
                maxLength={120}
              />
            </Field>
          </div>
          <Field label="Phone" htmlFor="o-phone">
            <Input
              id="o-phone"
              type="tel"
              inputMode="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="98765 43210"
              maxLength={20}
            />
          </Field>
          <Field label="Order notes" htmlFor="o-notes">
            <Input
              id="o-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Extra spicy, no onion…"
              maxLength={500}
            />
          </Field>
        </div>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full"
        loading={submitting}
        disabled={cartLines.length === 0}
        onClick={onSubmit}
      >
        {submitting
          ? 'Placing order'
          : cartLines.length === 0
            ? 'Add items to continue'
            : `Place order · ${formatRupees(totalPaise)}`}
      </Button>
    </>
  );

  if (embedded) return <div className="space-y-4">{body}</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Cart{' '}
          <span className="font-normal text-muted">
            ({itemCount} {itemCount === 1 ? 'item' : 'items'})
          </span>
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4 pt-0">{body}</CardBody>
    </Card>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className={muted ? 'text-muted' : 'text-fg'}>{label}</span>
      <span className={cn('tabular-nums', muted ? 'text-muted' : 'font-medium text-fg')}>
        {value}
      </span>
    </div>
  );
}
