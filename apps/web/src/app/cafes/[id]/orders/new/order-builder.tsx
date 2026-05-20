'use client';

import type {
  Cafe,
  CreateOrderRequest,
  MenuCategoryWithItems,
  MenuItem,
  OrderResponse,
} from '@mehfil/types';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
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
  notes?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PHONE_RE = /^\+?\d{7,15}$/;
const MAX_QTY = 99;

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

export function OrderBuilder({ cafeId, cafe, categories }: Props) {
  const router = useRouter();
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map());
  const [tableLabel, setTableLabel] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // ─── Cart mutations ────────────────────────────────────────────────────────

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
      if (qty <= 0) {
        next.delete(itemId);
      } else {
        next.set(itemId, {
          ...existing,
          quantity: Math.min(MAX_QTY, qty),
        });
      }
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

  // ─── Derived totals ────────────────────────────────────────────────────────

  const cartLines = useMemo(() => Array.from(cart.values()), [cart]);
  const itemCount = useMemo(
    () => cartLines.reduce((sum, l) => sum + l.quantity, 0),
    [cartLines],
  );
  const subtotalPaise = useMemo(
    () =>
      cartLines.reduce(
        (sum, l) => sum + l.menuItem.basePricePaise * l.quantity,
        0,
      ),
    [cartLines],
  );
  const gstRateBp = cafe.isAirConditioned ? 1800 : 500;
  const taxPaise = Math.round((subtotalPaise * gstRateBp) / 10000);
  const totalPaise = subtotalPaise + taxPaise;

  // ─── Filtered menu ─────────────────────────────────────────────────────────

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.isAvailable &&
            (q === '' || item.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, search]);

  // ─── Submit ────────────────────────────────────────────────────────────────

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
      items: cartLines.map((line) => ({
        menuItemId: line.menuItem.id,
        quantity: line.quantity,
        ...(line.notes ? { notes: line.notes } : {}),
      })),
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
      router.push(`/cafes/${cafeId}/orders/${data.order.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create order');
      setSubmitting(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const hasMenu = categories.some((c) =>
    c.items.some((i) => i.isAvailable),
  );

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Menu picker ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-5">
          <div className="relative">
            <Search className="size-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="pl-9"
              aria-label="Search menu items"
            />
          </div>

          {!hasMenu ? (
            <Card className="p-12 text-center border-dashed">
              <p className="text-sm text-muted">
                No available menu items. Add items in the menu editor first.
              </p>
            </Card>
          ) : filteredCategories.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <p className="text-sm text-muted">
                No items match &ldquo;{search}&rdquo;.
              </p>
            </Card>
          ) : (
            <div className="space-y-6">
              {filteredCategories.map((cat) => (
                <section key={cat.id} className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold tracking-tight">
                      {cat.name}
                    </h2>
                    <span className="text-[11px] text-muted">
                      {cat.items.length}{' '}
                      {cat.items.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {cat.items.map((item) => (
                      <MenuItemButton
                        key={item.id}
                        item={item}
                        inCartQty={cart.get(item.id)?.quantity ?? 0}
                        onAdd={() => addItem(item)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Cart panel (desktop) ─────────────────────────────────────────── */}
        <div className="lg:col-span-2 hidden lg:block">
          <div className="lg:sticky lg:top-24">
            <CartPanel
              cartLines={cartLines}
              itemCount={itemCount}
              subtotalPaise={subtotalPaise}
              taxPaise={taxPaise}
              totalPaise={totalPaise}
              gstRateBp={gstRateBp}
              tableLabel={tableLabel}
              setTableLabel={setTableLabel}
              customerName={customerName}
              setCustomerName={setCustomerName}
              customerPhone={customerPhone}
              setCustomerPhone={setCustomerPhone}
              notes={notes}
              setNotes={setNotes}
              error={error}
              submitting={submitting}
              onIncrement={(id) => {
                const line = cart.get(id);
                if (line) setQuantity(id, line.quantity + 1);
              }}
              onDecrement={(id) => {
                const line = cart.get(id);
                if (line) setQuantity(id, line.quantity - 1);
              }}
              onRemove={removeItem}
              onSubmit={handleSubmit}
            />
          </div>
        </div>

        {/* On mobile the cart lives only in the slide-up drawer (below),
            opened by the floating pill — no redundant inline copy. */}
      </div>

      {/* Mobile floating cart toggle ─────────────────────────────────────── */}
      {itemCount > 0 && (
        <button
          type="button"
          onClick={() => setMobileCartOpen(true)}
          className={cn(
            'lg:hidden fixed bottom-4 right-4 z-40',
            'inline-flex items-center gap-2 px-4 h-12 rounded-full',
            'bg-accent text-accent-fg shadow-lg shadow-black/10',
            'active:scale-[0.98] transition-transform',
          )}
        >
          <ShoppingBag className="size-4" />
          <span className="text-sm font-medium">
            {itemCount} {itemCount === 1 ? 'item' : 'items'} ·{' '}
            {formatRupees(totalPaise)}
          </span>
        </button>
      )}

      {/* Mobile cart drawer ─────────────────────────────────────────────── */}
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
              className="relative w-full max-h-[85vh] overflow-y-auto bg-bg rounded-t-xl border-t border-border"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-bg border-b border-border">
                <h2 className="text-base font-semibold tracking-tight">
                  Cart ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                </h2>
                <button
                  type="button"
                  onClick={() => setMobileCartOpen(false)}
                  aria-label="Close"
                  className="p-1.5 rounded-md hover:bg-subtle text-muted hover:text-fg transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="p-4">
                <CartPanel
                  embedded
                  cartLines={cartLines}
                  itemCount={itemCount}
                  subtotalPaise={subtotalPaise}
                  taxPaise={taxPaise}
                  totalPaise={totalPaise}
                  gstRateBp={gstRateBp}
                  tableLabel={tableLabel}
                  setTableLabel={setTableLabel}
                  customerName={customerName}
                  setCustomerName={setCustomerName}
                  customerPhone={customerPhone}
                  setCustomerPhone={setCustomerPhone}
                  notes={notes}
                  setNotes={setNotes}
                  error={error}
                  submitting={submitting}
                  onIncrement={(id) => {
                    const line = cart.get(id);
                    if (line) setQuantity(id, line.quantity + 1);
                  }}
                  onDecrement={(id) => {
                    const line = cart.get(id);
                    if (line) setQuantity(id, line.quantity - 1);
                  }}
                  onRemove={removeItem}
                  onSubmit={handleSubmit}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── MenuItemButton ──────────────────────────────────────────────────────────

function MenuItemButton({
  item,
  inCartQty,
  onAdd,
}: {
  item: MenuItem;
  inCartQty: number;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={!item.isAvailable}
      className={cn(
        'group relative text-left rounded-lg border border-border bg-bg',
        'px-3 py-3 transition-all duration-150',
        'hover:border-border-strong hover:bg-subtle/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2',
        'active:scale-[0.99]',
        !item.isAvailable && 'opacity-50 cursor-not-allowed',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          role="img"
          aria-label={item.isVegetarian ? 'Vegetarian' : 'Non-vegetarian'}
          title={item.isVegetarian ? 'Vegetarian' : 'Non-vegetarian'}
          className={cn(
            'mt-0.5 size-3.5 rounded-sm border-2 flex items-center justify-center shrink-0',
            item.isVegetarian ? 'border-success' : 'border-danger',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'size-1.5 rounded-full',
              item.isVegetarian ? 'bg-success' : 'bg-danger',
            )}
          />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.name}</p>
          {item.description && (
            <p className="mt-0.5 text-xs text-muted line-clamp-1">
              {item.description}
            </p>
          )}
          <p className="mt-1.5 font-mono text-xs tabular-nums text-fg">
            {formatRupees(item.basePricePaise)}
          </p>
        </div>
        {inCartQty > 0 && (
          <span
            className={cn(
              'shrink-0 inline-flex items-center justify-center',
              'min-w-5 h-5 px-1.5 rounded-full bg-accent text-accent-fg',
              'text-[11px] font-semibold tabular-nums',
            )}
            aria-label={`${inCartQty} in cart`}
          >
            {inCartQty}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── CartPanel ───────────────────────────────────────────────────────────────

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
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
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
    onIncrement,
    onDecrement,
    onRemove,
    onSubmit,
    embedded,
  } = props;

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
        <p className="text-sm text-muted py-6 text-center">
          Cart is empty — tap an item to add
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
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        role="img"
                        aria-label={
                          line.menuItem.isVegetarian
                            ? 'Vegetarian'
                            : 'Non-vegetarian'
                        }
                        className={cn(
                          'size-2.5 rounded-sm border-2 flex items-center justify-center shrink-0',
                          line.menuItem.isVegetarian
                            ? 'border-success'
                            : 'border-danger',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'size-1 rounded-full',
                            line.menuItem.isVegetarian
                              ? 'bg-success'
                              : 'bg-danger',
                          )}
                        />
                      </span>
                      <p className="text-sm font-medium truncate">
                        {line.menuItem.name}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted tabular-nums">
                      {formatRupees(line.menuItem.basePricePaise)} ×{' '}
                      {line.quantity} ={' '}
                      <span className="text-fg font-medium">
                        {formatRupees(
                          line.menuItem.basePricePaise * line.quantity,
                        )}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onDecrement(line.menuItem.id)}
                      disabled={line.quantity <= 1}
                      aria-label={`Decrease ${line.menuItem.name}`}
                      className={cn(
                        'size-11 grid place-items-center rounded-md border border-border bg-bg',
                        'text-fg hover:bg-subtle transition-colors',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                      )}
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="min-w-6 text-center text-sm font-medium tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onIncrement(line.menuItem.id)}
                      disabled={line.quantity >= MAX_QTY}
                      aria-label={`Increase ${line.menuItem.name}`}
                      className={cn(
                        'size-11 grid place-items-center rounded-md border border-border bg-bg',
                        'text-fg hover:bg-subtle transition-colors',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                      )}
                    >
                      <Plus className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(line.menuItem.id)}
                      aria-label={`Remove ${line.menuItem.name}`}
                      className="ml-1 size-9 grid place-items-center rounded-md text-muted hover:text-danger hover:bg-danger/5 transition-colors"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Totals */}
      <div className="space-y-1.5 pt-4 border-t border-border">
        <Row
          label="Subtotal"
          value={formatRupees(subtotalPaise)}
          muted
        />
        <Row
          label={`Tax (${(gstRateBp / 100).toFixed(0)}% GST)`}
          value={formatRupees(taxPaise)}
          muted
        />
        <div className="pt-2 border-t border-border flex items-baseline justify-between">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatRupees(totalPaise)}
          </span>
        </div>
      </div>

      {/* Customer / table */}
      <div className="space-y-3 pt-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Table" hint="Optional" htmlFor="o-table">
            <Input
              id="o-table"
              value={tableLabel}
              onChange={(e) => setTableLabel(e.target.value)}
              placeholder="T1"
              maxLength={20}
            />
          </Field>
          <Field label="Customer" hint="Optional" htmlFor="o-name">
            <Input
              id="o-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Walk-in"
              maxLength={120}
            />
          </Field>
        </div>
        <Field label="Phone" hint="Optional" htmlFor="o-phone">
          <Input
            id="o-phone"
            type="tel"
            inputMode="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="+91 98765 43210"
            maxLength={20}
          />
        </Field>
        <Field label="Order notes" hint="Optional" htmlFor="o-notes">
          <Input
            id="o-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Extra spicy, no onion, etc."
            maxLength={500}
          />
        </Field>
      </div>

      <Button
        type="button"
        size="lg"
        className="w-full"
        loading={submitting}
        disabled={cartLines.length === 0}
        onClick={onSubmit}
      >
        {submitting
          ? 'Creating order'
          : cartLines.length === 0
            ? 'Add items to continue'
            : `Place order · ${formatRupees(totalPaise)}`}
      </Button>
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{body}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Cart{' '}
          <span className="text-muted font-normal">
            ({itemCount} {itemCount === 1 ? 'item' : 'items'})
          </span>
        </CardTitle>
      </CardHeader>
      <CardBody className="pt-0 space-y-4">{body}</CardBody>
    </Card>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className={muted ? 'text-muted' : 'text-fg'}>{label}</span>
      <span
        className={cn(
          'tabular-nums',
          muted ? 'text-muted' : 'text-fg font-medium',
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatRupees(paise: number): string {
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}
