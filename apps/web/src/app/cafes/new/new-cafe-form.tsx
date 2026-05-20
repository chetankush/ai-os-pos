'use client';

import type { CreateCafeRequest } from '@mehfil/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ApiError, createCafe } from '@/lib/api';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const INITIAL: CreateCafeRequest = {
  name: '',
  addressLine1: '',
  city: '',
  state: '',
  pincode: '',
};

export function NewCafeForm() {
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

    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setError('Session expired. Please sign in again.');
      return;
    }

    setSubmitting(true);
    try {
      const { cafe } = await createCafe(session.access_token, form);
      router.push(`/cafes/${cafe.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create cafe');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Cafe details</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <Field label="Cafe name" htmlFor="name">
            <Input
              id="name"
              required
              maxLength={120}
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="The Cozy Brew"
            />
          </Field>

          <Field label="Address line 1" htmlFor="addr1">
            <Input
              id="addr1"
              required
              maxLength={200}
              value={form.addressLine1}
              onChange={(e) => update('addressLine1', e.target.value)}
              placeholder="Plot 1, Sector 15"
            />
          </Field>

          <Field label="Address line 2" hint="Optional" htmlFor="addr2">
            <Input
              id="addr2"
              maxLength={200}
              value={form.addressLine2 ?? ''}
              onChange={(e) => update('addressLine2', e.target.value || undefined)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="City" htmlFor="city">
              <Input
                id="city"
                required
                maxLength={80}
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
                placeholder="Noida"
              />
            </Field>
            <Field label="State" htmlFor="state">
              <Input
                id="state"
                required
                maxLength={80}
                value={form.state}
                onChange={(e) => update('state', e.target.value)}
                placeholder="UP"
              />
            </Field>
          </div>

          <Field label="Pincode" htmlFor="pincode">
            <Input
              id="pincode"
              required
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={form.pincode}
              onChange={(e) => update('pincode', e.target.value)}
              placeholder="201301"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="GSTIN" hint="Optional" htmlFor="gstin">
              <Input
                id="gstin"
                maxLength={15}
                value={form.gstin ?? ''}
                onChange={(e) => update('gstin', e.target.value || undefined)}
                placeholder="22AAAAA0000A1Z5"
              />
            </Field>
            <Field label="FSSAI license" hint="Optional" htmlFor="fssai">
              <Input
                id="fssai"
                maxLength={14}
                value={form.fssai ?? ''}
                onChange={(e) => update('fssai', e.target.value || undefined)}
              />
            </Field>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-subtle/40 cursor-pointer hover:border-border-strong transition-colors">
            <input
              type="checkbox"
              checked={form.isAirConditioned ?? false}
              onChange={(e) => update('isAirConditioned', e.target.checked)}
              className="mt-0.5 accent-fg"
            />
            <div className="space-y-0.5">
              <span className="text-sm font-medium">Air-conditioned</span>
              <p className="text-xs text-muted">
                Affects GST slab — 18% for AC, 5% for non-AC.
              </p>
            </div>
          </label>

          {error && (
            <p
              className="text-xs text-danger px-3 py-2 rounded-md border border-danger/20 bg-danger/5"
              role="alert"
            >
              {error}
            </p>
          )}
        </CardBody>
        <CardFooter className="flex justify-between gap-3">
          <Link href="/cafes" className={buttonClasses({ variant: 'ghost' })}>
            Cancel
          </Link>
          <Button type="submit" loading={submitting}>
            {submitting ? 'Creating' : 'Create cafe'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
