'use client';

import type { MenuCategoryWithItems, MenuItem } from '@sangam/types';
import { AnimatePresence, motion } from 'framer-motion';
import { Flame, Leaf, Pencil, Plus, ScrollText, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ImageUpload } from '@/components/ui/image-upload';
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

const SPICE_LEVELS = ['None', 'Mild', 'Medium', 'Hot'] as const;

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  function toggleAvailable(next: boolean) {
    onChange({ isAvailable: next });
    startTransition(async () => {
      try {
        await authedFetch(`/cafes/${cafeId}/menu/items/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isAvailable: next }),
        });
        toast.success(
          next ? `${item.name} is now available` : `${item.name} marked unavailable`,
        );
      } catch (err) {
        onChange({ isAvailable: !next }); // revert
        toast.error(err instanceof Error ? err.message : 'Failed to update item');
      }
    });
  }

  function doDelete() {
    startTransition(async () => {
      try {
        await authedFetch(`/cafes/${cafeId}/menu/items/${item.id}`, {
          method: 'DELETE',
        });
        toast.success(`Deleted ${item.name}`);
        onDelete();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete item');
      }
    });
  }

  const dietLabel = item.isVegetarian ? 'Vegetarian' : 'Non-vegetarian';

  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            className="size-10 shrink-0 rounded-lg object-cover border border-border"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              role="img"
              aria-label={dietLabel}
              title={dietLabel}
              className={cn(
                'size-3.5 rounded-sm border-2 flex items-center justify-center shrink-0',
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
            <p className="font-medium text-sm truncate">{item.name}</p>
            {item.isVegan && (
              <span className="inline-flex items-center gap-1 text-success">
                <Leaf className="size-3" aria-hidden />
                <span className="text-[10px] font-medium uppercase tracking-wide">Vegan</span>
              </span>
            )}
            {item.spiceLevel > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-danger"
                title={`Spice: ${SPICE_LEVELS[item.spiceLevel] ?? ''}`}
                aria-label={`Spice level ${SPICE_LEVELS[item.spiceLevel] ?? item.spiceLevel}`}
              >
                {Array.from({ length: item.spiceLevel }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative icons
                  <Flame key={i} className="size-3" aria-hidden />
                ))}
              </span>
            )}
          </div>
          {item.description && (
            <p className="mt-0.5 text-xs text-muted truncate">{item.description}</p>
          )}
        </div>

        <div className="font-mono text-sm tabular-nums">
          ₹{(item.basePricePaise / 100).toFixed(0)}
        </div>

        {/* Availability toggle — 44px tap area around a compact visual switch */}
        <button
          type="button"
          role="switch"
          aria-checked={item.isAvailable}
          aria-label={`${item.name} availability`}
          disabled={isPending}
          onClick={() => toggleAvailable(!item.isAvailable)}
          className="relative grid place-items-center size-11 shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2"
        >
          <span
            className={cn(
              'relative block h-6 w-10 rounded-full transition-colors',
              item.isAvailable ? 'bg-accent' : 'bg-border-strong',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 size-5 bg-bg rounded-full shadow-sm transition-transform',
                item.isAvailable ? 'translate-x-4' : 'translate-x-0',
              )}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          disabled={isPending}
          aria-label={`Edit ${item.name}`}
          aria-expanded={editing}
          className={cn(
            'grid place-items-center size-11 shrink-0 rounded-md transition-colors',
            editing ? 'text-fg bg-subtle' : 'text-muted hover:text-fg hover:bg-subtle',
          )}
        >
          <Pencil className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          aria-label={`Delete ${item.name}`}
          className="grid place-items-center size-11 shrink-0 -mr-2 rounded-md text-muted hover:text-danger hover:bg-danger/5 transition-colors"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3">
              <EditItemForm
                cafeId={cafeId}
                item={item}
                onSaved={(patch) => {
                  onChange(patch);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${item.name}?`}
        description="This removes the item from your menu. Past orders keep their record."
        confirmLabel="Delete"
        destructive
        onConfirm={doDelete}
      />
    </div>
  );
}

function EditItemForm({
  cafeId,
  item,
  onSaved,
  onCancel,
}: {
  cafeId: string;
  item: MenuItem;
  onSaved: (patch: Partial<MenuItem>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [priceRupees, setPriceRupees] = useState(
    (item.basePricePaise / 100).toString(),
  );
  const [description, setDescription] = useState(item.description ?? '');
  const [isVeg, setIsVeg] = useState(item.isVegetarian);
  const [isVegan, setIsVegan] = useState(item.isVegan);
  const [containsEgg, setContainsEgg] = useState(item.containsEgg);
  const [spiceLevel, setSpiceLevel] = useState(item.spiceLevel);
  const [imageUrl, setImageUrl] = useState<string | null>(item.imageUrl);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter an item name');
      return;
    }

    const rupees = Number(priceRupees);
    if (!Number.isFinite(rupees) || rupees < 0) {
      setError('Enter a valid price in rupees');
      return;
    }

    const patch: Partial<MenuItem> = {
      name: trimmedName,
      basePricePaise: Math.round(rupees * 100),
      description: description.trim() || null,
      isVegetarian: isVeg,
      isVegan,
      containsEgg,
      spiceLevel,
      imageUrl,
    };

    setSubmitting(true);
    try {
      const data = await authedFetch(`/cafes/${cafeId}/menu/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      onSaved(data?.item ?? patch);
      toast.success(`Updated ${trimmedName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-subtle/40 p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="Item name" htmlFor={`edit-name-${item.id}`}>
            <Input
              id={`edit-name-${item.id}`}
              autoFocus
              placeholder="Cappuccino"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </Field>
          <Field label="Price (₹)" htmlFor={`edit-price-${item.id}`}>
            <Input
              id={`edit-price-${item.id}`}
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

        <Field label="Description" hint="Optional" htmlFor={`edit-desc-${item.id}`}>
          <Input
            id={`edit-desc-${item.id}`}
            placeholder="Espresso with steamed milk and foam"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
          />
        </Field>

        <Field label="Photo" hint="Optional">
          <ImageUpload value={imageUrl} onChange={setImageUrl} shape="wide" />
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

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isVegan}
              onChange={(e) => setIsVegan(e.target.checked)}
              className="size-4 rounded border-border accent-success"
            />
            Vegan
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={containsEgg}
              onChange={(e) => setContainsEgg(e.target.checked)}
              className="size-4 rounded border-border accent-accent"
            />
            Contains egg
          </label>
        </div>

        <div>
          <p className="text-xs font-medium text-muted mb-1.5">Spice level</p>
          <div className="flex items-center gap-1.5">
            {SPICE_LEVELS.map((label, level) => (
              <button
                key={label}
                type="button"
                onClick={() => setSpiceLevel(level)}
                aria-pressed={spiceLevel === level}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md border transition-colors',
                  spiceLevel === level
                    ? 'border-danger bg-danger/10 text-danger'
                    : 'border-border text-muted hover:border-border-strong',
                )}
              >
                {label}
              </button>
            ))}
          </div>
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
            {submitting ? 'Saving' : 'Save changes'}
          </Button>
        </div>
      </form>
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
      toast.success(`Category "${name.trim()}" added`);
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
      toast.success(`Added ${name.trim()}`);
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
