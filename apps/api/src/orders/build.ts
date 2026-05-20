import type { Cafe, GstMode, MenuCategoryWithItems } from '@sangam/types';
import type { NewOrderItem } from '../repositories/orders.js';

export type OrderBuildErrorCode = 'INVALID_ITEM' | 'ITEM_UNAVAILABLE';

export class OrderBuildError extends Error {
  constructor(
    public readonly code: OrderBuildErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OrderBuildError';
  }
}

export interface OrderLineInput {
  menuItemId: string;
  quantity: number;
  notes?: string;
}

export interface BuiltOrderTotals {
  items: NewOrderItem[];
  gstRateBp: number;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
}

/**
 * GST rate in basis points for a cafe's declared GST regime. Per India's
 * Sept-2025 GST reform the AC vs non-AC distinction no longer sets the slab —
 * the cafe's gstMode does.
 *   regular_5    → 500 bp  (5%)
 *   regular_18   → 1800 bp (18%)
 *   composition  → 0       (composition dealers must NOT charge GST on the bill;
 *                           they pay a flat % on turnover themselves)
 *   exempt       → 0       (exempt / unregistered)
 */
export function gstRateBpFor(gstMode: GstMode): number {
  switch (gstMode) {
    case 'regular_18':
      return 1800;
    case 'regular_5':
      return 500;
    case 'composition':
    case 'exempt':
      return 0;
  }
}

/**
 * Validates cart lines against the cafe's live menu, snapshots name + price at
 * order time, and computes GST + totals. Shared by the owner counter flow and
 * the public QR-ordering flow so the money math is identical.
 */
export function buildOrder(
  cafe: Pick<Cafe, 'gstMode'>,
  menu: MenuCategoryWithItems[],
  lines: OrderLineInput[],
): BuiltOrderTotals {
  const byId = new Map<string, { name: string; price: number; available: boolean }>();
  for (const cat of menu) {
    for (const item of cat.items) {
      byId.set(item.id, {
        name: item.name,
        price: item.basePricePaise,
        available: item.isAvailable,
      });
    }
  }

  const items: NewOrderItem[] = lines.map((line) => {
    const snap = byId.get(line.menuItemId);
    if (!snap) {
      throw new OrderBuildError('INVALID_ITEM', `Item ${line.menuItemId} is not on this menu`);
    }
    if (!snap.available) {
      throw new OrderBuildError('ITEM_UNAVAILABLE', `"${snap.name}" is currently unavailable`);
    }
    return {
      menuItemId: line.menuItemId,
      itemNameSnapshot: snap.name,
      unitPricePaise: snap.price,
      quantity: line.quantity,
      notes: line.notes ?? null,
    };
  });

  const gstRateBp = gstRateBpFor(cafe.gstMode);
  const subtotalPaise = items.reduce((s, it) => s + it.unitPricePaise * it.quantity, 0);
  const taxPaise = Math.round((subtotalPaise * gstRateBp) / 10000);
  const totalPaise = subtotalPaise + taxPaise;

  return { items, gstRateBp, subtotalPaise, taxPaise, totalPaise };
}

/**
 * Indian financial year label for a date — runs Apr 1 to Mar 31.
 * A date in May 2026 → '2026-27'; a date in Feb 2027 → '2026-27'.
 */
export function financialYear(date: Date): string {
  const year = date.getFullYear();
  // Months are 0-indexed: 0=Jan … 2=Mar, 3=Apr. Jan–Mar belong to the FY that
  // started the *previous* calendar April.
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  const endYY = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYY}`;
}

/**
 * Gapless, legal bill number from a financial year + sequence, e.g.
 * `INV/2026-27/000123`. The sequence is allocated atomically per (cafe, fy)
 * during order creation — see invoice_sequences.
 */
export function buildBillNumber(fy: string, seq: number): string {
  return `INV/${fy}/${String(seq).padStart(6, '0')}`;
}
