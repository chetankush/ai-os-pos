'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type {
  InventoryItem,
  InventoryItemResponse,
  RestockInventoryRequest,
  UpdateInventoryRequest,
} from '@sangam/types';
import { AlertTriangle, Plus, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function authedHeaders(): Promise<Headers> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);
  return headers;
}

async function mutate(
  url: string,
  method: 'PATCH' | 'POST',
  body: UpdateInventoryRequest | RestockInventoryRequest,
): Promise<InventoryItem> {
  const res = await fetch(url, {
    method,
    headers: await authedHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const parsed = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(parsed?.error?.message ?? `Request failed (${res.status})`);
  }
  return ((await res.json()) as InventoryItemResponse).item;
}

export function InventoryView({
  cafeId,
  initialItems,
  categoryNames,
}: {
  cafeId: string;
  initialItems: InventoryItem[];
  categoryNames: Record<string, string>;
}) {
  const [items, setItems] = useState(initialItems);

  function applyUpdate(updated: InventoryItem) {
    setItems((prev) => prev.map((it) => (it.menuItemId === updated.menuItemId ? updated : it)));
  }

  // Group by category, preserving the server's sort order within each group.
  const groups = useMemo(() => {
    const byCat = new Map<string, InventoryItem[]>();
    for (const it of items) {
      const list = byCat.get(it.categoryId) ?? [];
      list.push(it);
      byCat.set(it.categoryId, list);
    }
    return [...byCat.entries()]
      .map(([categoryId, catItems]) => ({
        categoryId,
        name: categoryNames[categoryId] ?? 'Uncategorized',
        items: catItems,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, categoryNames]);

  const lowCount = items.filter((it) => it.isLow).length;
  const outCount = items.filter((it) => it.isOut).length;

  return (
    <div className="space-y-6">
      {(lowCount > 0 || outCount > 0) && (
        <div className="flex flex-wrap gap-3 text-sm">
          {outCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 font-medium text-danger">
              <XCircle className="size-4" />
              {outCount} out of stock
            </span>
          )}
          {lowCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4" />
              {lowCount} running low
            </span>
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No menu items yet. Add items on the Menu page to track their stock.
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.categoryId} className="overflow-hidden">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold tracking-tight">{group.name}</h2>
            </div>
            <ul className="divide-y divide-border">
              {group.items.map((item) => (
                <InventoryRow
                  key={item.menuItemId}
                  cafeId={cafeId}
                  item={item}
                  onUpdate={applyUpdate}
                />
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}

function InventoryRow({
  cafeId,
  item,
  onUpdate,
}: {
  cafeId: string;
  item: InventoryItem;
  onUpdate: (item: InventoryItem) => void;
}) {
  const [stock, setStock] = useState(item.stockQty === null ? '' : String(item.stockQty));
  const [threshold, setThreshold] = useState(
    item.lowStockThreshold === null ? '' : String(item.lowStockThreshold),
  );
  const [restock, setRestock] = useState('');
  const [savingField, setSavingField] = useState<null | 'set' | 'restock'>(null);

  const base = `${API_URL}/cafes/${cafeId}/inventory/${item.menuItemId}`;

  const rowTone = item.isOut ? 'bg-danger/5' : item.isLow ? 'bg-amber-500/5' : '';

  async function saveLevels() {
    const stockQty = stock.trim() === '' ? null : Number(stock);
    const lowStockThreshold = threshold.trim() === '' ? null : Number(threshold);
    if (stockQty !== null && (!Number.isInteger(stockQty) || stockQty < 0)) {
      toast.error('Stock must be a whole number ≥ 0');
      return;
    }
    if (
      lowStockThreshold !== null &&
      (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0)
    ) {
      toast.error('Threshold must be a whole number ≥ 0');
      return;
    }
    setSavingField('set');
    try {
      const updated = await mutate(base, 'PATCH', { stockQty, lowStockThreshold });
      onUpdate(updated);
      toast.success(`Updated ${item.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSavingField(null);
    }
  }

  async function addStock() {
    const addQty = Number(restock);
    if (!Number.isInteger(addQty) || addQty < 1) {
      toast.error('Enter a whole number to add');
      return;
    }
    setSavingField('restock');
    try {
      const updated = await mutate(`${base}/restock`, 'POST', { addQty });
      onUpdate(updated);
      setStock(updated.stockQty === null ? '' : String(updated.stockQty));
      setRestock('');
      toast.success(`Added ${addQty} to ${item.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restock');
    } finally {
      setSavingField(null);
    }
  }

  return (
    <li className={cn('flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center', rowTone)}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="mt-0.5 text-xs text-muted">
          {item.stockQty === null ? (
            'Untracked'
          ) : (
            <span className="tabular-nums">{item.stockQty} in stock</span>
          )}
          {item.isOut && <span className="ml-2 font-medium text-danger">Out of stock</span>}
          {item.isLow && (
            <span className="ml-2 font-medium text-amber-600 dark:text-amber-400">Low stock</span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">Stock</span>
          <Input
            inputMode="numeric"
            value={stock}
            placeholder="—"
            onChange={(e) => setStock(e.target.value)}
            className="h-9 w-20 text-sm tabular-nums"
            aria-label={`Stock for ${item.name}`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">Low at</span>
          <Input
            inputMode="numeric"
            value={threshold}
            placeholder="—"
            onChange={(e) => setThreshold(e.target.value)}
            className="h-9 w-20 text-sm tabular-nums"
            aria-label={`Low-stock threshold for ${item.name}`}
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={savingField === 'set'}
          disabled={savingField !== null}
          onClick={saveLevels}
        >
          Save
        </Button>

        <span className="mx-1 hidden h-9 w-px self-end bg-border sm:block" />

        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">Add</span>
          <Input
            inputMode="numeric"
            value={restock}
            placeholder="0"
            onChange={(e) => setRestock(e.target.value)}
            className="h-9 w-20 text-sm tabular-nums"
            aria-label={`Restock amount for ${item.name}`}
          />
        </div>
        <Button
          size="sm"
          variant="primary"
          loading={savingField === 'restock'}
          disabled={savingField !== null || restock.trim() === ''}
          onClick={addStock}
        >
          <Plus className="size-4" />
          Restock
        </Button>
      </div>
    </li>
  );
}
