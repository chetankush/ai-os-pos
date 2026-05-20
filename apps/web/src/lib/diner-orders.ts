import type { OrderStatus, PaymentStatus } from '@sangam/types';

/**
 * A diner's own order, remembered on THIS device (per cafe) so they can see
 * what they ordered without logging in — the zero-friction pattern me&u/Sunday
 * use. The server still owns the source of truth; we refresh live status from
 * it by order id when the diner opens "Your orders".
 */
export interface DinerOrderRecord {
  id: string;
  orderNumber: string;
  totalPaise: number;
  items: { name: string; quantity: number }[];
  tableLabel: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  placedAt: string; // ISO
}

const KEY = (slug: string) => `sangam:diner-orders:${slug}`;
const MAX = 25;

export function getDinerOrders(slug: string): DinerOrderRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DinerOrderRecord[]) : [];
  } catch {
    return [];
  }
}

export function addDinerOrder(slug: string, order: DinerOrderRecord): DinerOrderRecord[] {
  if (typeof window === 'undefined') return [];
  const next = [order, ...getDinerOrders(slug).filter((o) => o.id !== order.id)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY(slug), JSON.stringify(next));
  } catch {
    // storage full / disabled — non-fatal, the order still exists server-side.
  }
  return next;
}

export function updateDinerOrder(
  slug: string,
  id: string,
  patch: Partial<Pick<DinerOrderRecord, 'status' | 'paymentStatus'>>,
): DinerOrderRecord[] {
  if (typeof window === 'undefined') return [];
  const next = getDinerOrders(slug).map((o) => (o.id === id ? { ...o, ...patch } : o));
  try {
    window.localStorage.setItem(KEY(slug), JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}
