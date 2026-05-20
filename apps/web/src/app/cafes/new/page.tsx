'use client';

import type { CreateCafeRequest } from '@cafespace/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ApiError, createCafe } from '@/lib/api';

const INITIAL: CreateCafeRequest = {
  name: '',
  addressLine1: '',
  city: '',
  state: '',
  pincode: '',
};

export default function NewCafePage() {
  const { getAccessToken } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState<CreateCafeRequest>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CreateCafeRequest>(key: K, value: CreateCafeRequest[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const token = getAccessToken();
    if (!token) {
      setError('Not signed in. Refresh and try again.');
      return;
    }

    setSubmitting(true);
    try {
      const { cafe } = await createCafe(token, form);
      router.replace(`/cafes/${cafe.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create cafe');
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    'w-full rounded-md border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm';

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/cafes" className="text-sm opacity-60 hover:opacity-100">
          ← Back to cafes
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Create a cafe</h1>
        <p className="text-sm opacity-60 mt-1">
          You can update any of these later. Pincode and AC flag affect GST rates.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Cafe name</span>
          <input
            required
            maxLength={120}
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            className={`${inputCls} mt-1`}
            placeholder="The Cozy Brew"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Address line 1</span>
          <input
            required
            maxLength={200}
            value={form.addressLine1}
            onChange={(event) => update('addressLine1', event.target.value)}
            className={`${inputCls} mt-1`}
            placeholder="Plot 1, Sector 15"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Address line 2 (optional)</span>
          <input
            maxLength={200}
            value={form.addressLine2 ?? ''}
            onChange={(event) =>
              update('addressLine2', event.target.value || undefined)
            }
            className={`${inputCls} mt-1`}
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">City</span>
            <input
              required
              maxLength={80}
              value={form.city}
              onChange={(event) => update('city', event.target.value)}
              className={`${inputCls} mt-1`}
              placeholder="Noida"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">State</span>
            <input
              required
              maxLength={80}
              value={form.state}
              onChange={(event) => update('state', event.target.value)}
              className={`${inputCls} mt-1`}
              placeholder="UP"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Pincode</span>
          <input
            required
            pattern="\d{6}"
            maxLength={6}
            value={form.pincode}
            onChange={(event) => update('pincode', event.target.value)}
            className={`${inputCls} mt-1`}
            placeholder="201301"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">GSTIN (optional)</span>
          <input
            maxLength={15}
            value={form.gstin ?? ''}
            onChange={(event) => update('gstin', event.target.value || undefined)}
            className={`${inputCls} mt-1`}
            placeholder="22AAAAA0000A1Z5"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">FSSAI license (optional)</span>
          <input
            maxLength={14}
            value={form.fssai ?? ''}
            onChange={(event) => update('fssai', event.target.value || undefined)}
            className={`${inputCls} mt-1`}
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isAirConditioned ?? false}
            onChange={(event) => update('isAirConditioned', event.target.checked)}
          />
          <span className="text-sm">Air-conditioned (affects GST slab)</span>
        </label>

        {error && (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create cafe'}
          </button>
          <Link
            href="/cafes"
            className="rounded-md border border-black/15 dark:border-white/15 px-4 py-2 text-sm"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
