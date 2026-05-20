'use client';

import type {
  CreatePaymentResponse,
  MenuCategoryWithItems,
  MenuItem,
  PublicCafe,
  PublicOrder,
  PublicOrderResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from '@sangam/types';
import {
  Check,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/cn';
import {
  addDinerOrder,
  type DinerOrderRecord,
  getDinerOrders,
  updateDinerOrder,
} from '@/lib/diner-orders';
import { loadRazorpay } from '@/lib/razorpay';
import { AiWidget } from './ai-widget';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PHONE_RE = /^\+?\d{7,15}$/;
const MAX_QTY = 99;
const FALLBACK_THEME = '#111111';

interface Props {
  slug: string;
  table?: string;
  cafe: PublicCafe;
  categories: MenuCategoryWithItems[];
}

/** What the confirmation screen should communicate. */
type ConfirmKind =
  | 'paid' // verified online payment ✓
  | 'counter' // no online pay, or diner chose pay-at-counter
  | 'choose' // tab mode: pay now or pay at counter
  | 'pending'; // prepaid order placed but not yet paid (modal dismissed / failed)

export function formatRupees(paise: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(
    Math.round(paise / 100),
  )}`;
}

export function DinerOrder({ slug, table, cafe, categories }: Props) {
  // cart: menuItemId -> quantity
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [placed, setPlaced] = useState<PublicOrder | null>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>('counter');
  // This device's own orders at this cafe (localStorage) — shown in the chatbot.
  const [history, setHistory] = useState<DinerOrderRecord[]>([]);
  useEffect(() => setHistory(getDinerOrders(slug)), [slug]);
  // Tracks the in-flight Razorpay round-trip (create + checkout + verify) so the
  // retry CTA can show a spinner without blocking the rest of the screen.
  const [paying, setPaying] = useState(false);

  // Flat lookup for AI suggestions + cart line rendering.
  const itemsById = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const cat of categories) {
      for (const item of cat.items) map.set(item.id, item);
    }
    return map;
  }, [categories]);

  const liveCategories = useMemo(
    () => categories.filter((c) => c.items.length > 0),
    [categories],
  );

  // Menu navigation: one active category at a time (left rail), plus a search
  // that spans all items. Matches the scan-friendly DropTheQ/Swiggy layout.
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [query, setQuery] = useState('');
  const activeId = activeCategoryId || liveCategories[0]?.id || '';
  const trimmedQuery = query.trim().toLowerCase();

  const activeCategory = useMemo(
    () => liveCategories.find((c) => c.id === activeId) ?? liveCategories[0],
    [liveCategories, activeId],
  );

  const visibleItems = useMemo(() => {
    if (trimmedQuery) {
      return liveCategories
        .flatMap((c) => c.items)
        .filter(
          (i) =>
            i.name.toLowerCase().includes(trimmedQuery) ||
            (i.description?.toLowerCase().includes(trimmedQuery) ?? false),
        );
    }
    return activeCategory?.items ?? [];
  }, [trimmedQuery, liveCategories, activeCategory]);

  const inc = useCallback((id: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      const qty = next.get(id) ?? 0;
      if (qty >= MAX_QTY) return prev;
      next.set(id, qty + 1);
      return next;
    });
    setError(null);
  }, []);

  const dec = useCallback((id: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      const qty = next.get(id) ?? 0;
      if (qty <= 1) next.delete(id);
      else next.set(id, qty - 1);
      return next;
    });
  }, []);

  const cartLines = useMemo(
    () =>
      Array.from(cart.entries())
        .map(([id, quantity]) => {
          const item = itemsById.get(id);
          return item ? { item, quantity } : null;
        })
        .filter((l): l is { item: MenuItem; quantity: number } => l !== null),
    [cart, itemsById],
  );

  const itemCount = useMemo(
    () => cartLines.reduce((s, l) => s + l.quantity, 0),
    [cartLines],
  );
  const subtotalPaise = useMemo(
    () => cartLines.reduce((s, l) => s + l.item.basePricePaise * l.quantity, 0),
    [cartLines],
  );

  const onlinePay = cafe.onlinePaymentEnabled;
  const prepaid = onlinePay && cafe.prepaidRequired;

  /**
   * Drive Razorpay Checkout end-to-end for an already-placed order:
   *   create provider order → open Checkout → verify the signed result.
   * On every failure path we keep the order alive and surface a Retry, never
   * dropping the diner into a dead end.
   */
  const startPayment = useCallback(
    async (order: PublicOrder) => {
      setPaying(true);
      try {
        const createRes = await fetch(
          `${API_URL}/public/cafes/${encodeURIComponent(slug)}/orders/${
            order.id
          }/payment`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            // Empty JSON object — Fastify rejects a JSON content-type with an
            // empty body (FST_ERR_CTP_EMPTY_JSON_BODY). This endpoint takes no
            // input; the order is identified by the URL.
            body: '{}',
          },
        );
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => null);
          throw new Error(
            err?.error?.message ?? `Could not start payment (${createRes.status})`,
          );
        }
        const payment = (await createRes.json()) as CreatePaymentResponse;

        await loadRazorpay();
        if (!window.Razorpay) throw new Error('Payment window is unavailable.');

        const phone = customerPhone.trim();
        const name = customerName.trim();

        const verify = async (resp: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          setPaying(true);
          try {
            const body: VerifyPaymentRequest = {
              razorpayPaymentId: resp.razorpay_payment_id,
              razorpayOrderId: resp.razorpay_order_id,
              razorpaySignature: resp.razorpay_signature,
            };
            const verifyRes = await fetch(
              `${API_URL}/public/cafes/${encodeURIComponent(slug)}/orders/${
                order.id
              }/payment/verify`,
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
              },
            );
            if (!verifyRes.ok) {
              const err = await verifyRes.json().catch(() => null);
              throw new Error(
                err?.error?.message ??
                  `We couldn't confirm your payment (${verifyRes.status})`,
              );
            }
            const data = (await verifyRes.json()) as VerifyPaymentResponse;
            setPlaced(data.order);
            setConfirmKind('paid');
            setHistory(updateDinerOrder(slug, data.order.id, { paymentStatus: 'paid' }));
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : 'Payment could not be confirmed.',
            );
            // Keep the order; offer Retry from the pending screen.
            setConfirmKind('pending');
          } finally {
            setPaying(false);
          }
        };

        const rzp = new window.Razorpay({
          key: payment.keyId,
          order_id: payment.providerOrderId,
          amount: payment.amountPaise,
          currency: payment.currency,
          name: cafe.name,
          description: `Order ${order.orderNumber}`,
          prefill: {
            ...(phone ? { contact: phone } : {}),
            ...(name ? { name } : {}),
          },
          theme: { color: cafe.primaryColor ?? FALLBACK_THEME },
          handler: (resp) => {
            void verify(resp);
          },
          modal: {
            ondismiss: () => {
              // Diner closed Checkout without paying — order still exists.
              setPaying(false);
              setConfirmKind('pending');
            },
          },
        });

        rzp.open();
        // open() is fire-and-forget; the modal owns the flow from here. Drop the
        // top-level spinner so the screen behind Checkout isn't stuck disabled.
        setPaying(false);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Could not start payment.',
        );
        setConfirmKind('pending');
        setPaying(false);
      }
    },
    [slug, cafe.name, cafe.primaryColor, customerPhone, customerName],
  );

  async function placeOrder() {
    setError(null);
    if (cartLines.length === 0) {
      setError('Add at least one item.');
      return;
    }
    const phone = customerPhone.trim();
    if (phone && !PHONE_RE.test(phone)) {
      setError('Enter a valid phone number.');
      return;
    }

    // Snapshot the item names now — the cart is cleared on success.
    const orderedItems = cartLines.map((l) => ({
      name: l.item.name,
      quantity: l.quantity,
    }));

    const body = {
      ...(table ? { tableLabel: table } : {}),
      ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
      ...(phone ? { customerPhone: phone } : {}),
      items: cartLines.map((l) => ({
        menuItemId: l.item.id,
        quantity: l.quantity,
      })),
    };

    setSubmitting(true);
    try {
      const res = await fetch(
        `${API_URL}/public/cafes/${encodeURIComponent(slug)}/orders`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(
          err?.error?.message ?? `Could not place order (${res.status})`,
        );
      }
      const data = (await res.json()) as PublicOrderResponse;
      const order = data.order;
      setPlaced(order);
      setCartOpen(false);
      setCart(new Map());
      setHistory(
        addDinerOrder(slug, {
          id: order.id,
          orderNumber: order.orderNumber,
          totalPaise: order.totalPaise,
          items: orderedItems,
          tableLabel: order.tableLabel ?? table ?? null,
          status: order.status,
          paymentStatus: order.paymentStatus,
          placedAt: new Date().toISOString(),
        }),
      );

      if (prepaid) {
        // Prepaid: payment is mandatory, so jump straight into Checkout. The
        // confirmation only flips to "Paid" once verify succeeds.
        setConfirmKind('pending');
        void startPayment(order);
      } else if (onlinePay) {
        // Tab: let the diner choose pay-now vs pay-at-counter.
        setConfirmKind('choose');
      } else {
        // No online payment configured — counter is the only path.
        setConfirmKind('counter');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place order.');
    } finally {
      setSubmitting(false);
    }
  }

  if (placed) {
    return (
      <Confirmation
        cafeName={cafe.name}
        order={placed}
        table={table}
        kind={confirmKind}
        paying={paying}
        onPay={() => void startPayment(placed)}
        onPayAtCounter={() => setConfirmKind('counter')}
        onAnother={() => {
          setPlaced(null);
          setConfirmKind('counter');
        }}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-bg pb-28">
      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          {cafe.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cafe.logoUrl}
              alt=""
              className="size-10 shrink-0 rounded-lg border border-border object-cover"
            />
          ) : (
            <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-subtle text-sm font-semibold">
              {cafe.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight">
              {cafe.name}
            </h1>
            {cafe.city && (
              <p className="truncate text-xs text-muted">{cafe.city}</p>
            )}
          </div>
          {table && (
            <span className="shrink-0 rounded-full border border-border bg-subtle px-3 py-1 text-xs font-medium">
              Table {table}
            </span>
          )}
          <ThemeToggle className="shrink-0" />
        </div>
      </header>

      {/* ─── Menu (category rail + search + card grid) ────────────────────── */}
      {liveCategories.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          No items are available right now.
        </p>
      ) : (
        <div className="mx-auto flex max-w-3xl">
          <CategoryRail
            categories={liveCategories}
            activeId={trimmedQuery ? '' : activeId}
            onSelect={(id) => {
              setQuery('');
              setActiveCategoryId(id);
            }}
          />

          <div className="min-w-0 flex-1 px-3 py-4 sm:px-4">
            {/* Search */}
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search items"
                aria-label="Search the menu"
                className={cn(
                  'h-11 w-full rounded-xl border border-border bg-bg pl-9 pr-9 text-base',
                  'placeholder:text-muted focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg focus:ring-offset-2 focus:ring-offset-bg',
                )}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-subtle hover:text-fg"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <h2 className="mb-3 text-sm font-semibold tracking-tight">
              {trimmedQuery
                ? `Results for “${query.trim()}”`
                : (activeCategory?.name ?? 'Menu')}
            </h2>

            {visibleItems.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">
                No items match your search.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {visibleItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    qty={cart.get(item.id) ?? 0}
                    onAdd={() => inc(item.id)}
                    onDec={() => dec(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── AI waiter ────────────────────────────────────────────────────── */}
      <AiWidget
        slug={slug}
        cafeName={cafe.name}
        itemsById={itemsById}
        cartHidden={cartOpen}
        onAdd={inc}
        itemCount={itemCount}
        subtotalPaise={subtotalPaise}
        onViewCart={() => setCartOpen(true)}
        orders={history}
      />

      {/* ─── Sticky cart bar ──────────────────────────────────────────────── */}
      {itemCount > 0 && !cartOpen && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className={cn(
            'fixed inset-x-4 bottom-4 z-40 mx-auto flex h-14 max-w-2xl items-center justify-between rounded-full px-5',
            'bg-accent text-accent-fg shadow-lg shadow-black/15',
            'transition-transform active:scale-[0.99] touch-manipulation',
          )}
        >
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            <ShoppingBag className="size-4" />
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {formatRupees(subtotalPaise)} · View order
          </span>
        </button>
      )}

      {/* ─── Cart sheet ───────────────────────────────────────────────────── */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end">
          <button
            type="button"
            aria-label="Close order"
            onClick={() => setCartOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="relative mx-auto flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border-t border-border bg-bg">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-base font-semibold tracking-tight">
                Your order ({itemCount})
              </h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                aria-label="Close"
                className="grid size-11 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg touch-manipulation"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
                >
                  {error}
                </div>
              )}

              {cartLines.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                  Your order is empty.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {cartLines.map((line) => (
                    <li
                      key={line.item.id}
                      className="flex items-center gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <DietMark item={line.item} />
                          {line.item.name}
                        </p>
                        <p className="text-xs tabular-nums text-muted">
                          {formatRupees(line.item.basePricePaise)} each
                        </p>
                      </div>
                      <Stepper
                        qty={line.quantity}
                        onAdd={() => inc(line.item.id)}
                        onDec={() => dec(line.item.id)}
                        label={line.item.name}
                      />
                      <span className="w-16 text-right text-sm font-semibold tabular-nums">
                        {formatRupees(line.item.basePricePaise * line.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-3 border-t border-border pt-4">
                <Field label="Phone (for order updates)" htmlFor="d-phone">
                  <Input
                    id="d-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="98765 43210"
                    maxLength={20}
                  />
                </Field>
                <Field label="Name (optional)" htmlFor="d-name">
                  <Input
                    id="d-name"
                    autoComplete="name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Your name"
                    maxLength={120}
                  />
                </Field>
              </div>
            </div>

            <div className="border-t border-border p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-sm text-muted">Subtotal</span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatRupees(subtotalPaise)}
                </span>
              </div>
              <Button
                type="button"
                size="lg"
                className="w-full"
                loading={submitting}
                disabled={cartLines.length === 0}
                onClick={placeOrder}
              >
                {submitting
                  ? 'Placing order'
                  : prepaid
                    ? `Place order · pay ${formatRupees(subtotalPaise)}`
                    : 'Place order'}
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted">
                {prepaid
                  ? 'Pay securely on your phone to confirm.'
                  : 'Taxes are calculated at checkout.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ─── Category rail (left, sticky) ──────────────────────────────────────────────

function CategoryRail({
  categories,
  activeId,
  onSelect,
}: {
  categories: MenuCategoryWithItems[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Menu categories"
      className="sticky top-16 z-20 max-h-[calc(100dvh-4rem)] w-[78px] shrink-0 self-start overflow-y-auto border-r border-border bg-bg py-2"
    >
      <ul className="space-y-1 px-1.5">
        {categories.map((cat) => {
          const active = cat.id === activeId;
          const thumb = cat.items.find((i) => i.imageUrl)?.imageUrl;
          return (
            <li key={cat.id}>
              <button
                type="button"
                onClick={() => onSelect(cat.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-center transition-colors touch-manipulation',
                  active
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted hover:bg-subtle hover:text-fg',
                )}
              >
                <span
                  className={cn(
                    'relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border',
                    active ? 'border-accent' : 'border-border',
                  )}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : (
                    <UtensilsCrossed className="size-4" />
                  )}
                </span>
                <span className="line-clamp-2 text-[11px] font-medium leading-tight">
                  {cat.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ─── Item card (image-forward, 2-col grid) ─────────────────────────────────────

function ItemCard({
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
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-bg">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-subtle">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted">
            <UtensilsCrossed className="size-6" />
          </div>
        )}
        <span className="absolute right-1.5 top-1.5 grid place-items-center rounded bg-bg/90 p-0.5 shadow-sm">
          <DietMark item={item} />
        </span>
        {qty > 0 && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold tabular-nums text-accent-fg shadow-sm">
            {qty} in cart
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <p className="line-clamp-2 text-sm font-medium leading-tight">
          {item.name}
        </p>
        {item.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted">
            {item.description}
          </p>
        )}
        <p className="mt-1.5 text-sm font-semibold tabular-nums">
          {formatRupees(item.basePricePaise)}
        </p>

        <div className="mt-2.5">
          {qty > 0 ? (
            <div className="flex h-10 items-center justify-between rounded-lg border border-accent">
              <button
                type="button"
                onClick={onDec}
                aria-label={`Remove one ${item.name}`}
                className="grid h-full w-10 place-items-center rounded-l-lg text-accent active:scale-95 touch-manipulation"
              >
                <Minus className="size-4" />
              </button>
              <span className="min-w-6 text-center text-sm font-semibold tabular-nums text-accent">
                {qty}
              </span>
              <button
                type="button"
                onClick={onAdd}
                aria-label={`Add one ${item.name}`}
                className="grid h-full w-10 place-items-center rounded-r-lg text-accent active:scale-95 touch-manipulation"
              >
                <Plus className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              aria-label={`Add ${item.name}`}
              className={cn(
                'inline-flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-border bg-bg text-sm font-semibold',
                'transition-colors hover:border-accent hover:text-accent active:scale-[0.98] touch-manipulation',
              )}
            >
              <Plus className="size-4" />
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Quantity stepper (44px targets) ───────────────────────────────────────────

function Stepper({
  qty,
  onAdd,
  onDec,
  label,
}: {
  qty: number;
  onAdd: () => void;
  onDec: () => void;
  label: string;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-bg">
      <button
        type="button"
        onClick={onDec}
        aria-label={`Remove one ${label}`}
        className="grid size-11 place-items-center rounded-l-lg text-fg hover:bg-subtle active:scale-95 touch-manipulation"
      >
        <Minus className="size-4" />
      </button>
      <span className="min-w-7 text-center text-sm font-semibold tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add one ${label}`}
        className="grid size-11 place-items-center rounded-r-lg text-fg hover:bg-subtle active:scale-95 touch-manipulation"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

// ─── Veg / non-veg mark ────────────────────────────────────────────────────────

export function DietMark({ item }: { item: MenuItem }) {
  const veg = item.isVegetarian && !item.containsEgg;
  const label = item.isVegan
    ? 'Vegan'
    : veg
      ? 'Vegetarian'
      : item.containsEgg && item.isVegetarian
        ? 'Contains egg'
        : 'Non-vegetarian';
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid size-3.5 shrink-0 place-items-center rounded-sm border-2',
        veg ? 'border-success' : 'border-danger',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          veg ? 'bg-success' : 'bg-danger',
        )}
      />
    </span>
  );
}

// ─── Confirmation ──────────────────────────────────────────────────────────────

function Confirmation({
  cafeName,
  order,
  table,
  kind,
  paying,
  onPay,
  onPayAtCounter,
  onAnother,
}: {
  cafeName: string;
  order: PublicOrder;
  table?: string;
  kind: ConfirmKind;
  paying: boolean;
  onPay: () => void;
  onPayAtCounter: () => void;
  onAnother: () => void;
}) {
  const tableLabel = order.tableLabel ?? table;
  const tableLine = tableLabel
    ? `We'll bring it to Table ${tableLabel}.`
    : `Thanks for ordering from ${cafeName}.`;

  // ─── Visual + copy per state ──────────────────────────────────────────────
  let icon = <CheckCircle2 className="size-8 text-success" />;
  let iconWrap = 'bg-success/10';
  let heading = `Order ${order.orderNumber} placed!`;
  let body = tableLine;

  if (kind === 'paid') {
    icon = <Check className="size-8 text-success" />;
    heading = 'Paid';
    body = tableLine;
  } else if (kind === 'pending') {
    icon = <Loader2 className="size-8 text-fg" />;
    iconWrap = 'bg-subtle';
    heading = 'Payment needed';
    body = 'Pay now to confirm your order — it’s held for you.';
  } else if (kind === 'choose') {
    heading = `Order ${order.orderNumber} placed!`;
    body = 'Pay now on your phone, or settle up at the counter.';
  } else {
    // counter
    body = `${tableLine} Pay at the counter when you're done.`;
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6">
      <div className="w-full max-w-sm space-y-5 text-center">
        <div
          className={cn(
            'mx-auto grid size-16 place-items-center rounded-2xl',
            iconWrap,
          )}
        >
          {/* spin only on the pending state; reduced-motion handled in globals */}
          {kind === 'pending' ? (
            <span className="motion-safe:animate-spin">{icon}</span>
          ) : (
            icon
          )}
        </div>

        <div className="space-y-1.5">
          <h1
            className="flex items-center justify-center gap-2 text-xl font-semibold tracking-tight"
            aria-live="polite"
          >
            {kind === 'paid' && <Check className="size-5 text-success" />}
            {heading}
          </h1>
          <p className="text-sm text-muted">{body}</p>
        </div>

        <div className="rounded-xl border border-border bg-subtle/40 p-4">
          <p className="text-xs uppercase tracking-wider text-muted">
            {kind === 'paid' ? 'Paid' : 'Total'}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatRupees(order.totalPaise)}
          </p>
        </div>

        {/* ─── Actions per state ───────────────────────────────────────── */}
        {kind === 'choose' && (
          <div className="space-y-2.5">
            <Button
              type="button"
              size="lg"
              className="w-full"
              loading={paying}
              onClick={onPay}
            >
              {paying ? 'Opening payment' : `Pay ${formatRupees(order.totalPaise)} now`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={paying}
              onClick={onPayAtCounter}
            >
              Pay at counter
            </Button>
          </div>
        )}

        {kind === 'pending' && (
          <div className="space-y-2.5">
            <Button
              type="button"
              size="lg"
              className="w-full"
              loading={paying}
              onClick={onPay}
            >
              {paying
                ? 'Opening payment'
                : `Pay ${formatRupees(order.totalPaise)}`}
            </Button>
            <p className="text-[11px] text-muted">
              Having trouble? Ask a staff member to help you pay.
            </p>
          </div>
        )}

        {(kind === 'paid' || kind === 'counter') && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={onAnother}
          >
            Order more
          </Button>
        )}
      </div>
    </main>
  );
}
