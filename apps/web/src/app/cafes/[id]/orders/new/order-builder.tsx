'use client';

import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { cn } from '@/lib/cn';
import { type OrderSender, enqueue } from '@/lib/offline-queue';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useOfflineQueue } from '@/lib/use-offline-queue';
import type {
  Cafe,
  CreateOrderRequest,
  MenuCategoryWithItems,
  MenuItem,
  OrderResponse,
} from '@sangam/types';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Armchair,
  CloudOff,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface Props {
  cafeId: string;
  cafe: Cafe;
  categories: MenuCategoryWithItems[];
  /** When set, the order is attached to this open table session. */
  sessionId?: string | null;
  /** Table label for the "Adding to Table {label}" banner. */
  sessionTableLabel?: string | null;
}

interface CartLine {
  menuItem: MenuItem;
  quantity: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PHONE_RE = /^\+?\d{7,15}$/;
const MAX_QTY = 99;
const ALL = '__all__';

// Per-device, per-cafe auto-print-KOT preference. Default ON for new cafes.
const AUTOPRINT_KEY = (cafeId: string) => `sangam:kot-autoprint:${cafeId}`;

/**
 * Thrown when a request fails for a reason worth retrying offline — the fetch
 * itself rejected (no network) or the server returned a 5xx. 4xx (validation,
 * auth) are NOT network errors: those are surfaced to the cashier as-is so they
 * fix the input rather than silently queueing a bad order.
 */
class NetworkError extends Error {
  readonly isNetworkError = true;
}

async function authedFetch(path: string, init: RequestInit = {}) {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    // fetch rejects on DNS/connection failure — i.e. we're offline.
    throw new NetworkError('Network request failed');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error?.message ?? `Request failed (${res.status})`;
    // Treat server errors as retryable; client errors are the cashier's to fix.
    if (res.status >= 500) throw new NetworkError(message);
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

function isNetworkError(err: unknown): boolean {
  return err instanceof NetworkError;
}

/**
 * Shows the exact payable amount, paise included.
 *
 * This used to round to whole rupees for display, so a ₹241.50 order showed
 * "Place order · ₹242" at the counter while the printed bill said ₹241.50.
 * The cashier collected one number and the customer's invoice showed another,
 * and the 50 paise gap turned up later as cash-drawer variance. If a cafe wants
 * whole rupees it should switch on round-off, which adjusts the real total and
 * prints an explicit "Round off" line — not have the screen quietly disagree
 * with the paper.
 */
function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

interface BillBreakdown {
  discountPaise: number;
  serviceChargePaise: number;
  packagingChargePaise: number;
  taxPaise: number;
  roundOffPaise: number;
  totalPaise: number;
}

/**
 * Mirrors the server's computeBillAdjustments (apps/api/src/orders/build.ts) so
 * the cart total previews exactly what the server will charge. Keep in sync.
 */
function computeBill(
  subtotalPaise: number,
  gstRateBp: number,
  opts: {
    discount?: { type: 'percent' | 'flat'; valuePaiseOrPct: number };
    serviceChargeBp?: number;
    packagingChargePaise?: number;
    roundOff?: boolean;
  },
): BillBreakdown {
  const nn = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
  let discountPaise = 0;
  if (opts.discount && opts.discount.valuePaiseOrPct > 0) {
    discountPaise =
      opts.discount.type === 'percent'
        ? nn((subtotalPaise * Math.min(opts.discount.valuePaiseOrPct, 100)) / 100)
        : nn(opts.discount.valuePaiseOrPct);
    discountPaise = Math.min(discountPaise, subtotalPaise);
  }
  const netFood = subtotalPaise - discountPaise;
  const serviceChargePaise = opts.serviceChargeBp
    ? nn((netFood * opts.serviceChargeBp) / 10000)
    : 0;
  const packagingChargePaise = nn(opts.packagingChargePaise ?? 0);
  const taxableBase = netFood + serviceChargePaise + packagingChargePaise;
  const taxPaise = Math.round((taxableBase * gstRateBp) / 10000);
  const preRound = taxableBase + taxPaise;
  const roundOffPaise = opts.roundOff ? Math.round(preRound / 100) * 100 - preRound : 0;
  return {
    discountPaise,
    serviceChargePaise,
    packagingChargePaise,
    taxPaise,
    roundOffPaise,
    totalPaise: preRound + roundOffPaise,
  };
}

export function OrderBuilder({ cafeId, cafe, categories, sessionId, sessionTableLabel }: Props) {
  const router = useRouter();
  const inSession = Boolean(sessionId);
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map());
  const [tableLabel, setTableLabel] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bill adjustments (counter flow). Discount value is %, or ₹ when type==='flat'.
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [serviceChargePct, setServiceChargePct] = useState('');
  const [packagingRupees, setPackagingRupees] = useState('');
  const [roundOff, setRoundOff] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // ─── Offline resilience ────────────────────────────────────────────────────
  // Sender used by the queue to replay orders once connectivity is back. Per-
  // order success/failure is toasted so the cashier sees what synced.
  const sender = useCallback<OrderSender>(
    async (item) => {
      const data = (await authedFetch(`/cafes/${cafeId}/orders`, {
        method: 'POST',
        body: JSON.stringify(item.payload),
      })) as OrderResponse;
      toast.success(`Synced order ${data.order.orderNumber}`);
      router.refresh();
    },
    [cafeId, router],
  );
  const { online, pendingCount } = useOfflineQueue(cafeId, sender);

  // Auto-print KOT (per-device preference). Hydrated from localStorage after
  // mount to keep SSR/CSR markup identical; defaults to ON for new cafes.
  const [autoPrintKot, setAutoPrintKot] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(AUTOPRINT_KEY(cafeId));
      if (raw === 'false') setAutoPrintKot(false);
      else if (raw === 'true') setAutoPrintKot(true);
    } catch {
      // localStorage unavailable (private mode etc.); keep default.
    }
  }, [cafeId]);
  function toggleAutoPrintKot() {
    setAutoPrintKot((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(AUTOPRINT_KEY(cafeId), String(next));
      } catch {
        // Ignore — preference simply won't persist on this device.
      }
      return next;
    });
  }

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
  const itemCount = useMemo(() => cartLines.reduce((s, l) => s + l.quantity, 0), [cartLines]);
  const subtotalPaise = useMemo(
    () => cartLines.reduce((s, l) => s + l.menuItem.basePricePaise * l.quantity, 0),
    [cartLines],
  );
  // GST rate is driven by the cafe's declared mode (Sept-2025 reform), not AC.
  // Composition dealers and exempt cafes charge no GST on the bill.
  const gstRateBp = cafe.gstMode === 'regular_18' ? 1800 : cafe.gstMode === 'regular_5' ? 500 : 0;

  // Bill adjustments → resolved paise (previews exactly what the server charges).
  const discountInput = Number(discountValue) || 0;
  const serviceChargeBp = Math.round((Number(serviceChargePct) || 0) * 100);
  const packagingChargePaise = Math.round((Number(packagingRupees) || 0) * 100);
  const bill = useMemo(
    () =>
      computeBill(subtotalPaise, gstRateBp, {
        discount:
          discountInput > 0
            ? {
                type: discountType,
                valuePaiseOrPct:
                  discountType === 'flat' ? Math.round(discountInput * 100) : discountInput,
              }
            : undefined,
        serviceChargeBp: serviceChargeBp || undefined,
        packagingChargePaise: packagingChargePaise || undefined,
        roundOff,
      }),
    [
      subtotalPaise,
      gstRateBp,
      discountType,
      discountInput,
      serviceChargeBp,
      packagingChargePaise,
      roundOff,
    ],
  );
  const taxPaise = bill.taxPaise;
  const totalPaise = bill.totalPaise;

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
      ...(sessionId ? { tableSessionId: sessionId } : {}),
      ...(discountInput > 0
        ? {
            discount: {
              type: discountType,
              value: discountType === 'flat' ? Math.round(discountInput * 100) : discountInput,
              ...(discountReason.trim() ? { reason: discountReason.trim() } : {}),
            },
          }
        : {}),
      ...(serviceChargeBp > 0 ? { serviceChargeBp } : {}),
      ...(packagingChargePaise > 0 ? { packagingChargePaise } : {}),
      ...(roundOff ? { roundOff: true } : {}),
    };

    setSubmitting(true);
    try {
      const data = (await authedFetch(`/cafes/${cafeId}/orders`, {
        method: 'POST',
        body: JSON.stringify(body),
      })) as OrderResponse;
      toast.success(`Order ${data.order.orderNumber} placed`);

      // Fire the kitchen ticket immediately if the cashier opted in. Open the
      // order detail in a new tab with ?autoprint=kot — the print-views
      // component picks that up, prints, then self-closes. Done BEFORE the
      // router.push so the user-gesture allowance still covers window.open
      // (popup-blocker friendly).
      if (autoPrintKot && typeof window !== 'undefined') {
        try {
          window.open(
            `/cafes/${cafeId}/orders/${data.order.id}?autoprint=kot`,
            '_blank',
            'noopener,noreferrer',
          );
        } catch {
          // Popup blocked — order still placed; cashier can hit "Print KOT".
        }
      }

      // Adding to a table tab → return to the live floor; otherwise show the order.
      if (inSession) {
        router.push(`/cafes/${cafeId}/tables`);
      } else {
        router.push(`/cafes/${cafeId}/orders/${data.order.id}`);
      }
      router.refresh();
    } catch (err) {
      // Network/offline failure → save the order locally so the counter keeps
      // moving; it will replay automatically when connectivity returns.
      if (isNetworkError(err)) {
        enqueue(cafeId, body);
        toast.success("Saved offline — will sync when you're back online");
        resetForm();
        if (inSession) router.push(`/cafes/${cafeId}/tables`);
        setSubmitting(false);
        return;
      }
      // Validation / auth error — surface it so the cashier fixes the input.
      setError(err instanceof Error ? err.message : 'Failed to create order');
      setSubmitting(false);
    }
  }

  function resetForm() {
    setCart(new Map());
    setTableLabel('');
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setDiscountType('percent');
    setDiscountValue('');
    setDiscountReason('');
    setServiceChargePct('');
    setPackagingRupees('');
    setRoundOff(false);
    setMobileCartOpen(false);
    setError(null);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const cartProps = {
    cartLines,
    itemCount,
    subtotalPaise,
    taxPaise,
    totalPaise,
    gstRateBp,
    bill,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    discountReason,
    setDiscountReason,
    serviceChargePct,
    setServiceChargePct,
    packagingRupees,
    setPackagingRupees,
    roundOff,
    setRoundOff,
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

  const showOfflineBadge = !online || pendingCount > 0;

  return (
    <>
      {showOfflineBadge && <OfflineBadge online={online} pendingCount={pendingCount} />}

      {inSession && (
        <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
          <Armchair className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="text-fg">
            Adding to <span className="font-semibold">Table {sessionTableLabel ?? '—'}</span> tab
          </span>
        </div>
      )}

      {/* Auto-print KOT toggle — small, unobtrusive, sits above the grid.
          On = a kitchen ticket auto-prints to a new tab when the order is
          placed; off = cashier must hit Print KOT on the order page. */}
      <div className="mb-3 flex items-center justify-end">
        <button
          type="button"
          onClick={toggleAutoPrintKot}
          aria-pressed={autoPrintKot}
          title={
            autoPrintKot
              ? 'A kitchen ticket prints automatically when you place an order'
              : 'Click to auto-print a kitchen ticket on every new order'
          }
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            autoPrintKot
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-border text-muted hover:border-border-strong hover:text-fg',
          )}
        >
          <Printer className="size-3.5" aria-hidden="true" />
          Auto-print KOT: {autoPrintKot ? 'On' : 'Off'}
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-5">
        {/* ─── Fast item pad ─────────────────────────────────────────────── */}
        <div className="md:col-span-3 space-y-3">
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
                <Chip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>
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

        {/* ─── Cart (tablet+, sticky) — tablet (iPad) is a real cafe device,
            so the inline cart shows at md+ instead of waiting for lg+. ── */}
        <div className="md:col-span-2 hidden md:block">
          <div className="md:sticky md:top-20">
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
            'md:hidden fixed bottom-4 inset-x-4 z-40 h-14 rounded-full',
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
            className="md:hidden fixed inset-0 z-50 flex items-end"
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
                <h2 className="text-base font-semibold tracking-tight">Cart ({itemCount})</h2>
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

// ─── Offline / unsynced indicator ───────────────────────────────────────────────

function OfflineBadge({ online, pendingCount }: { online: boolean; pendingCount: number }) {
  // Offline → amber warning (transient, expected). Back online but still holding
  // unsynced orders → keep it visible so the cashier knows sync is in flight.
  const Icon = online ? CloudOff : WifiOff;
  const label = online
    ? `${pendingCount} unsynced`
    : pendingCount > 0
      ? `Offline · ${pendingCount} unsynced`
      : 'Offline';

  return (
    <div
      role="status"
      className={cn(
        // Sits above the mobile floating cart pill so the two never overlap.
        'fixed bottom-24 right-4 z-50 inline-flex items-center gap-2 rounded-full lg:bottom-4',
        'border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger shadow-sm backdrop-blur',
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="tabular-nums">{label}</span>
    </div>
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
        aria-label={`Add ${item.name}`}
        className={cn(
          'flex h-24 w-full flex-col justify-between rounded-xl border bg-bg p-3 text-left',
          'transition-all duration-100 touch-manipulation active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          qty > 0
            ? 'border-accent ring-1 ring-accent'
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
          <span className="line-clamp-2 text-sm font-medium leading-tight">{item.name}</span>
        </div>
        <span className="font-mono text-sm tabular-nums">{formatRupees(item.basePricePaise)}</span>
      </button>

      {/* Explicit add / quantity control so it's obvious how to add an item */}
      {qty === 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-2 right-2 grid size-8 place-items-center rounded-lg border border-border bg-bg text-accent shadow-sm"
        >
          <Plus className="size-4" />
        </span>
      ) : (
        <div className="absolute bottom-2 right-2 flex items-center rounded-lg border border-accent bg-bg shadow-sm">
          <button
            type="button"
            onClick={onDec}
            aria-label={`Remove one ${item.name}`}
            className="grid size-8 place-items-center rounded-l-lg text-accent hover:bg-subtle"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="min-w-5 text-center text-sm font-semibold tabular-nums text-accent">
            {qty}
          </span>
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Add one ${item.name}`}
            className="grid size-8 place-items-center rounded-r-lg text-accent hover:bg-subtle"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
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
  bill: BillBreakdown;
  discountType: 'percent' | 'flat';
  setDiscountType: (v: 'percent' | 'flat') => void;
  discountValue: string;
  setDiscountValue: (v: string) => void;
  discountReason: string;
  setDiscountReason: (v: string) => void;
  serviceChargePct: string;
  setServiceChargePct: (v: string) => void;
  packagingRupees: string;
  setPackagingRupees: (v: string) => void;
  roundOff: boolean;
  setRoundOff: (v: boolean) => void;
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
    bill,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    discountReason,
    setDiscountReason,
    serviceChargePct,
    setServiceChargePct,
    packagingRupees,
    setPackagingRupees,
    roundOff,
    setRoundOff,
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
  const [showAdjust, setShowAdjust] = useState(false);

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
        <p className="py-8 text-center text-sm text-muted">Tap items to build the order</p>
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
        {bill.discountPaise > 0 && (
          <Row label="Discount" value={`− ${formatRupees(bill.discountPaise)}`} muted />
        )}
        {bill.serviceChargePaise > 0 && (
          <Row label="Service charge" value={formatRupees(bill.serviceChargePaise)} muted />
        )}
        {bill.packagingChargePaise > 0 && (
          <Row label="Packaging" value={formatRupees(bill.packagingChargePaise)} muted />
        )}
        {gstRateBp > 0 && (
          <Row
            label={`GST (${(gstRateBp / 100).toFixed(0)}%)`}
            value={formatRupees(taxPaise)}
            muted
          />
        )}
        {bill.roundOffPaise !== 0 && (
          <Row
            label="Round off"
            value={`${bill.roundOffPaise > 0 ? '+ ' : '− '}${formatRupees(Math.abs(bill.roundOffPaise))}`}
            muted
          />
        )}
        <div className="flex items-baseline justify-between border-t border-border pt-2">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-lg font-semibold tabular-nums">{formatRupees(totalPaise)}</span>
        </div>
      </div>

      {/* Discount & charges — collapsed by default to keep the flow fast */}
      <button
        type="button"
        onClick={() => setShowAdjust((s) => !s)}
        className="text-xs text-muted hover:text-fg transition-colors"
      >
        {showAdjust ? 'Hide' : 'Add'} discount / charges
      </button>
      {showAdjust && (
        <div className="space-y-3 rounded-lg border border-border bg-subtle/30 p-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-medium text-muted">Discount</span>
              <div className="ml-auto inline-flex rounded-md border border-border bg-bg p-0.5">
                {(['percent', 'flat'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={discountType === t}
                    onClick={() => setDiscountType(t)}
                    className={cn(
                      'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                      discountType === t ? 'bg-accent/10 text-accent' : 'text-muted hover:text-fg',
                    )}
                  >
                    {t === 'percent' ? '%' : '₹'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === 'percent' ? '10' : '50'}
                aria-label="Discount amount"
              />
              <Input
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="Reason"
                maxLength={120}
                aria-label="Discount reason"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Service charge %" htmlFor="o-sc">
              <Input
                id="o-sc"
                type="number"
                inputMode="decimal"
                min={0}
                value={serviceChargePct}
                onChange={(e) => setServiceChargePct(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Packaging ₹" htmlFor="o-pkg">
              <Input
                id="o-pkg"
                type="number"
                inputMode="decimal"
                min={0}
                value={packagingRupees}
                onChange={(e) => setPackagingRupees(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={roundOff}
              onChange={(e) => setRoundOff(e.target.checked)}
              className="size-4 accent-accent"
            />
            Round off to nearest ₹
          </label>
        </div>
      )}

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
