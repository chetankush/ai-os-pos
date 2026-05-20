import type { Cafe, MenuCategoryWithItems } from '@sangam/types';
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

/** 18% GST for AC cafes, 5% otherwise (Indian restaurant GST). */
export function gstRateBpFor(isAirConditioned: boolean): number {
  return isAirConditioned ? 1800 : 500;
}

/**
 * Validates cart lines against the cafe's live menu, snapshots name + price at
 * order time, and computes GST + totals. Shared by the owner counter flow and
 * the public QR-ordering flow so the money math is identical.
 */
export function buildOrder(
  cafe: Pick<Cafe, 'isAirConditioned'>,
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

  const gstRateBp = gstRateBpFor(cafe.isAirConditioned);
  const subtotalPaise = items.reduce((s, it) => s + it.unitPricePaise * it.quantity, 0);
  const taxPaise = Math.round((subtotalPaise * gstRateBp) / 10000);
  const totalPaise = subtotalPaise + taxPaise;

  return { items, gstRateBp, subtotalPaise, taxPaise, totalPaise };
}

/** Short, terse, unique-per-cafe order number, e.g. "S-A3B7F1". */
export function generateOrderNumber(): string {
  const r = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X');
  return `S-${r}`;
}
