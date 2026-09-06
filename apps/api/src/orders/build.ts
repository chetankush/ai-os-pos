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

/**
 * Optional bill-level adjustments applied after the line subtotal. Discount is
 * pre-tax (reduces the taxable base); service charge + packaging are added to
 * the taxable base (GST applies on them — composite supply at the food rate).
 */
export interface BillAdjustments {
  /** A %/flat discount on the subtotal, with an optional reason for the audit trail. */
  discount?: { type: 'percent' | 'flat'; value: number; reason?: string };
  /** Service charge as basis points of the post-discount food value (e.g. 1000 = 10%). */
  serviceChargeBp?: number;
  /** Flat packaging charge in paise. */
  packagingChargePaise?: number;
  /** Round the final payable to the nearest rupee (stores the delta as roundOff). */
  roundOff?: boolean;
}

export interface BuiltOrderTotals {
  items: NewOrderItem[];
  gstRateBp: number;
  /** Gross line subtotal, before any discount. */
  subtotalPaise: number;
  /** Total discount applied (bill-level), in paise. */
  discountPaise: number;
  discountReason: string | null;
  serviceChargePaise: number;
  packagingChargePaise: number;
  taxPaise: number;
  /** Rounding delta (can be negative) applied to reach a whole-rupee total. */
  roundOffPaise: number;
  totalPaise: number;
}

const clampNonNeg = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

/**
 * Resolves bill-level adjustments into concrete paise amounts on a subtotal.
 * Pure + exported so the engine and any preview UI compute identically.
 */
export function computeBillAdjustments(
  subtotalPaise: number,
  gstRateBp: number,
  adj: BillAdjustments = {},
): {
  discountPaise: number;
  discountReason: string | null;
  serviceChargePaise: number;
  packagingChargePaise: number;
  taxPaise: number;
  roundOffPaise: number;
  totalPaise: number;
} {
  let discountPaise = 0;
  let discountReason: string | null = null;
  if (adj.discount && adj.discount.value > 0) {
    discountPaise =
      adj.discount.type === 'percent'
        ? clampNonNeg((subtotalPaise * Math.min(adj.discount.value, 100)) / 100)
        : clampNonNeg(adj.discount.value);
    discountPaise = Math.min(discountPaise, subtotalPaise); // never below zero food value
    discountReason = adj.discount.reason?.trim() || null;
  }

  const netFood = subtotalPaise - discountPaise;
  const serviceChargePaise = adj.serviceChargeBp
    ? clampNonNeg((netFood * adj.serviceChargeBp) / 10000)
    : 0;
  const packagingChargePaise = clampNonNeg(adj.packagingChargePaise ?? 0);

  const taxableBase = netFood + serviceChargePaise + packagingChargePaise;
  const taxPaise = Math.round((taxableBase * gstRateBp) / 10000);
  const preRound = taxableBase + taxPaise;
  const roundOffPaise = adj.roundOff ? Math.round(preRound / 100) * 100 - preRound : 0;
  const totalPaise = preRound + roundOffPaise;

  return {
    discountPaise,
    discountReason,
    serviceChargePaise,
    packagingChargePaise,
    taxPaise,
    roundOffPaise,
    totalPaise,
  };
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
  adjustments: BillAdjustments = {},
): BuiltOrderTotals {
  const byId = new Map<
    string,
    { name: string; price: number; available: boolean; hsn: string | null }
  >();
  for (const cat of menu) {
    for (const item of cat.items) {
      byId.set(item.id, {
        name: item.name,
        price: item.basePricePaise,
        available: item.isAvailable,
        hsn: item.hsnCode ?? null,
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
      hsnSnapshot: snap.hsn,
      unitPricePaise: snap.price,
      quantity: line.quantity,
      notes: line.notes ?? null,
    };
  });

  const gstRateBp = gstRateBpFor(cafe.gstMode);
  const subtotalPaise = items.reduce((s, it) => s + it.unitPricePaise * it.quantity, 0);
  const adj = computeBillAdjustments(subtotalPaise, gstRateBp, adjustments);

  return {
    items,
    gstRateBp,
    subtotalPaise,
    discountPaise: adj.discountPaise,
    discountReason: adj.discountReason,
    serviceChargePaise: adj.serviceChargePaise,
    packagingChargePaise: adj.packagingChargePaise,
    taxPaise: adj.taxPaise,
    roundOffPaise: adj.roundOffPaise,
    totalPaise: adj.totalPaise,
  };
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
