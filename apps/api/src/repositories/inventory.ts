import { type Database, schema } from '@sangam/db';
import type { InventoryItem } from '@sangam/types';
import { and, asc, eq, sql } from 'drizzle-orm';

export interface UpdateInventory {
  stockQty?: number | null;
  lowStockThreshold?: number | null;
}

/** A line to decrement when an order is placed. */
export interface OrderStockLine {
  menuItemId: string;
  quantity: number;
}

export interface InventoryRepository {
  /** Every menu item in the cafe with its stock state (untracked items included). */
  list(cafeId: string): Promise<InventoryItem[]>;
  /** Set stockQty and/or lowStockThreshold; null clears that field. Returns null if the menu item isn't in the cafe. */
  update(cafeId: string, menuItemId: string, patch: UpdateInventory): Promise<InventoryItem | null>;
  /** Increment stock by addQty (treats untracked/null as 0). Returns null if the menu item isn't in the cafe. */
  restock(cafeId: string, menuItemId: string, addQty: number): Promise<InventoryItem | null>;
  /**
   * Decrement tracked stock for the given order lines (only items that have a
   * tracked stock row are affected; untracked items are ignored). Intended to be
   * called from order creation — see the integration note in routes/orders.ts.
   */
  decrementForOrder(cafeId: string, lines: OrderStockLine[]): Promise<void>;
}

function deriveFlags(
  stockQty: number | null,
  lowStockThreshold: number | null,
): { isLow: boolean; isOut: boolean } {
  if (stockQty === null) return { isLow: false, isOut: false };
  const isOut = stockQty <= 0;
  const isLow = !isOut && lowStockThreshold !== null && stockQty <= lowStockThreshold;
  return { isLow, isOut };
}

export function createDrizzleInventoryRepo(db: Database): InventoryRepository {
  /** Re-read one item's inventory row joined to its menu item. */
  async function readItem(cafeId: string, menuItemId: string): Promise<InventoryItem | null> {
    const [row] = await selectItems(db, cafeId, eq(schema.menuItems.id, menuItemId));
    return row ?? null;
  }

  async function ensureStockRow(cafeId: string, menuItemId: string): Promise<boolean> {
    // Confirm the menu item belongs to the cafe before touching stock.
    const [item] = await db
      .select({ id: schema.menuItems.id })
      .from(schema.menuItems)
      .where(and(eq(schema.menuItems.id, menuItemId), eq(schema.menuItems.cafeId, cafeId)))
      .limit(1);
    if (!item) return false;

    await db
      .insert(schema.menuItemStock)
      .values({ cafeId, menuItemId })
      .onConflictDoNothing({ target: schema.menuItemStock.menuItemId });
    return true;
  }

  return {
    async list(cafeId) {
      return selectItems(db, cafeId, eq(schema.menuItems.cafeId, cafeId));
    },

    async update(cafeId, menuItemId, patch) {
      const exists = await ensureStockRow(cafeId, menuItemId);
      if (!exists) return null;

      const set: Record<string, unknown> = {};
      if ('stockQty' in patch) set.stockQty = patch.stockQty ?? null;
      if ('lowStockThreshold' in patch) set.lowStockThreshold = patch.lowStockThreshold ?? null;

      if (Object.keys(set).length > 0) {
        await db
          .update(schema.menuItemStock)
          .set(set)
          .where(eq(schema.menuItemStock.menuItemId, menuItemId));
      }
      return readItem(cafeId, menuItemId);
    },

    async restock(cafeId, menuItemId, addQty) {
      const exists = await ensureStockRow(cafeId, menuItemId);
      if (!exists) return null;

      // Treat an untracked (null) quantity as 0 so the first restock begins tracking.
      await db
        .update(schema.menuItemStock)
        .set({ stockQty: sql`coalesce(${schema.menuItemStock.stockQty}, 0) + ${addQty}` })
        .where(eq(schema.menuItemStock.menuItemId, menuItemId));
      return readItem(cafeId, menuItemId);
    },

    async decrementForOrder(cafeId, lines) {
      const tracked = lines.filter((l) => l.quantity > 0);
      if (tracked.length === 0) return;

      // Only decrement rows that exist AND are tracked (stockQty not null).
      for (const line of tracked) {
        await db
          .update(schema.menuItemStock)
          .set({ stockQty: sql`${schema.menuItemStock.stockQty} - ${line.quantity}` })
          .where(
            and(
              eq(schema.menuItemStock.cafeId, cafeId),
              eq(schema.menuItemStock.menuItemId, line.menuItemId),
              // Skip untracked items — they have a null quantity.
              sql`${schema.menuItemStock.stockQty} is not null`,
            ),
          );
      }
    },
  };
}

/** Select menu items joined to their (optional) stock rows, mapped to InventoryItem. */
async function selectItems(
  db: Database,
  cafeId: string,
  // biome-ignore lint/suspicious/noExplicitAny: drizzle filter expression type is internal
  where: any,
): Promise<InventoryItem[]> {
  const rows = await db
    .select({
      menuItemId: schema.menuItems.id,
      categoryId: schema.menuItems.categoryId,
      name: schema.menuItems.name,
      isAvailable: schema.menuItems.isAvailable,
      sortOrder: schema.menuItems.sortOrder,
      stockQty: schema.menuItemStock.stockQty,
      lowStockThreshold: schema.menuItemStock.lowStockThreshold,
    })
    .from(schema.menuItems)
    .leftJoin(schema.menuItemStock, eq(schema.menuItemStock.menuItemId, schema.menuItems.id))
    .where(and(eq(schema.menuItems.cafeId, cafeId), where))
    .orderBy(asc(schema.menuItems.sortOrder), asc(schema.menuItems.name));

  return rows.map((r) => {
    const stockQty = r.stockQty ?? null;
    const lowStockThreshold = r.lowStockThreshold ?? null;
    const { isLow, isOut } = deriveFlags(stockQty, lowStockThreshold);
    return {
      menuItemId: r.menuItemId,
      categoryId: r.categoryId,
      name: r.name,
      isAvailable: r.isAvailable,
      stockQty,
      lowStockThreshold,
      isLow,
      isOut,
    };
  });
}
