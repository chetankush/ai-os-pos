'use client';

import type { MenuCategoryWithItems, MenuItem } from '@mehfil/types';
import { AnimatePresence, motion } from 'framer-motion';
import { Leaf, Plus, ScrollText, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FadeIn } from '@/components/ui/motion';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Props {
  cafeId: string;
  initialCategories: MenuCategoryWithItems[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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

export function MenuEditor({ cafeId, initialCategories }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [showAddCategory, setShowAddCategory] = useState(categories.length === 0);
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null);

  function addCategory(category: MenuCategoryWithItems) {
    setCategories((prev) => [...prev, { ...category, items: [] }]);
    setShowAddCategory(false);
  }

  function addItem(categoryId: string, item: MenuItem) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId ? { ...c, items: [...c.items, item] } : c,
      ),
    );
    setAddingItemFor(null);
  }

  function patchItem(itemId: string, patch: Partial<MenuItem>) {
    setCategories((prev) =>
      prev.map((c) => ({
        ...c,
        items: c.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
      })),
    );
  }

  function removeItem(itemId: string) {
    setCategories((prev) =>
      prev.map((c) => ({ ...c, items: c.items.filter((i) => i.id !== itemId) })),
    );
  }

  if (categories.length === 0 && !showAddCategory) {
    return (
      <Card className="p-12 text-center border-dashed">
        <div className="mx-auto size-12 rounded-lg bg-subtle border border-border grid place-items-center">
          <ScrollText className="size-5 text-muted" />
        </div>
        <h3 className="mt-4 font-medium">No menu items yet</h3>
        <p className="mt-1 text-sm text-muted">
          Create your first category, then add items to it.
        </p>
        <div className="mt-6">
          <Button onClick={() => setShowAddCategory(true)}>
            <Plus className="size-4" />
            Create first category
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {categories.map((cat) => (
          <motion.div
            key={cat.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div>
                  <CardTitle>{cat.name}</CardTitle>
                  <p className="text-xs text-muted mt-1">
                    {cat.items.length}{' '}
                    {cat.items.length === 1 ? 'item' : 'items'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setAddingItemFor((id) => (id === cat.id ? null : cat.id))
                  }
                >
                  <Plus className="size-3.5" />
                  Add item
                </Button>
              </CardHeader>
              <CardBody className="pt-0">
                <div className="divide-y divide-border">
                  <AnimatePresence initial={false}>
                    {cat.items.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        <ItemRow
                          cafeId={cafeId}
                          item={item}
                          onChange={(patch) => patchItem(item.id, patch)}
                          onDelete={() => removeItem(item.id)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <AnimatePresence>
                  {addingItemFor === cat.id && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="mt-4"
                    >
                      <AddItemForm
                        cafeId={cafeId}
                        categoryId={cat.id}
                        onDone={(item) => addItem(cat.id, item)}
                        onCancel={() => setAddingItemFor(null)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardBody>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {showAddCategory ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <AddCategoryForm
              cafeId={cafeId}
              onDone={addCategory}
              onCancel={() => setShowAddCategory(false)}
            />
          </motion.div>
        ) : (
          <FadeIn>
            <button
              type="button"
              onClick={() => setShowAddCategory(true)}
              className={cn(
                'w-full rounded-lg border border-dashed border-border-strong',
                'px-4 py-5 text-sm text-muted',
                'hover:border-fg hover:text-fg transition-colors',
                'flex items-center justify-center gap-2',
              )}
            >
              <Plus className="size-4" />
              New category
            </button>
          </FadeIn>
        )}
      </AnimatePresence>
    </div>
  );
}

function ItemRow({
  cafeId,
  item,
  onChange,
  onDelete,
}: {
  cafeId: string;
  item: MenuItem;
  onChange: (patch: Partial<MenuItem>) => void;
  onDelete: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function toggleAvailable(next: boolean) {
    onChange({ isAvailable: next });
    startTransition(async () => {
      try {
        await authedFetch(`/cafes/${cafeId}/menu/items/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isAvailable: next }),
        });
      } catch {
        // revert on error
        onChange({ isAvailable: !next });
      }
    });
  }

  function handleDelete() {
    if (!confirm(`Delete "${item.name}"?`)) return;
    startTransition(async () => {
      try {
        await authedFetch(`/cafes/${cafeId}/menu/items/${item.id}`, {
          method: 'DELETE',
        });
        onDelete();
      } catch {
        /* keep item; show toast in future */
      }
    });
  }

  return (
    <div className="flex items-center gap-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'size-3 rounded-sm border-2 flex items-center justify-center shrink-0',
              item.isVegetarian
                ? 'border-success'
                : 'border-danger',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                item.isVegetarian ? 'bg-success' : 'bg-danger',
              )}
            />
          </span>
          <p className="font-medium text-sm truncate">{item.name}</p>
          {item.isVegan && (
            <Leaf className="size-3 text-success" aria-label="Vegan" />
          )}
        </div>
        {item.description && (
          <p className="mt-0.5 text-xs text-muted truncate">{item.description}</p>
        )}
      </div>

      <div className="font-mono text-sm tabular-nums">
        ₹{(item.basePricePaise / 100).toFixed(0)}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={item.isAvailable}
        disabled={isPending}
        onClick={() => toggleAvailable(!item.isAvailable)}
        className={cn(
          'relative inline-flex h-5 w-9 rounded-full transition-colors',
          'focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2',
          item.isAvailable ? 'bg-accent' : 'bg-border-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-4 bg-bg rounded-full shadow-sm transition-transform',
            item.isAvailable ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>

      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        aria-label={`Delete ${item.name}`}
        className="text-muted hover:text-danger transition-colors p-1 rounded hover:bg-danger/5"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function AddCategoryForm({
  cafeId,
  onDone,
  onCancel,
}: {
  cafeId: string;
  onDone: (cat: MenuCategoryWithItems) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const data = await authedFetch(`/cafes/${cafeId}/menu/categories`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      onDone({ ...data.category, items: [] });
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <Field label="New category" htmlFor="cat-name">
          <Input
            id="cat-name"
            autoFocus
            placeholder="Beverages, Starters, Mains…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
        </Field>
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={buttonClasses({ variant: 'ghost', size: 'sm' })}
          >
            Cancel
          </button>
          <Button type="submit" size="sm" loading={submitting}>
            {submitting ? 'Creating' : 'Create category'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AddItemForm({
  cafeId,
  categoryId,
  onDone,
  onCancel,
}: {
  cafeId: string;
  categoryId: string;
  onDone: (item: MenuItem) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [priceRupees, setPriceRupees] = useState('');
  const [description, setDescription] = useState('');
  const [isVeg, setIsVeg] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const rupees = Number(priceRupees);
    if (!Number.isFinite(rupees) || rupees < 0) {
      setError('Enter a valid price in rupees');
      return;
    }

    setSubmitting(true);
    try {
      const data = await authedFetch(`/cafes/${cafeId}/menu/items`, {
        method: 'POST',
        body: JSON.stringify({
          categoryId,
          name: name.trim(),
          basePricePaise: Math.round(rupees * 100),
          description: description.trim() || undefined,
          isVegetarian: isVeg,
        }),
      });
      onDone(data.item);
      setName('');
      setPriceRupees('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-subtle/40 p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="Item name" htmlFor="item-name">
            <Input
              id="item-name"
              autoFocus
              placeholder="Cappuccino"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </Field>
          <Field label="Price (₹)" htmlFor="item-price">
            <Input
              id="item-price"
              type="number"
              min="0"
              step="1"
              placeholder="150"
              value={priceRupees}
              onChange={(e) => setPriceRupees(e.target.value)}
              required
            />
          </Field>
        </div>

        <Field label="Description" hint="Optional" htmlFor="item-desc">
          <Input
            id="item-desc"
            placeholder="Espresso with steamed milk and foam"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
          />
        </Field>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsVeg(true)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-md border transition-colors',
              isVeg
                ? 'border-success bg-success/10 text-success'
                : 'border-border text-muted hover:border-border-strong',
            )}
          >
            Veg
          </button>
          <button
            type="button"
            onClick={() => setIsVeg(false)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-md border transition-colors',
              !isVeg
                ? 'border-danger bg-danger/10 text-danger'
                : 'border-border text-muted hover:border-border-strong',
            )}
          >
            Non-veg
          </button>
        </div>

        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className={buttonClasses({ variant: 'ghost', size: 'sm' })}
          >
            Cancel
          </button>
          <Button type="submit" size="sm" loading={submitting}>
            {submitting ? 'Adding' : 'Add item'}
          </Button>
        </div>
      </form>
    </div>
  );
}
