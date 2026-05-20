'use client';

import type { CreateCafeRequest } from '@mehfil/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
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

// Subtle "*" marker for required fields. aria-hidden because requiredness is
// already conveyed via the input's required/aria-required attributes.
const RequiredMark = () => (
  <span className="text-danger" aria-hidden="true">
    {' '}
    *
  </span>
);

// Fields that can carry a validation error, in DOM/visual order so we can focus
// the first invalid one.
type ErrorField = 'name' | 'addressLine1' | 'city' | 'state' | 'pincode' | 'gstin';
const FIELD_ORDER: ErrorField[] = [
  'name',
  'addressLine1',
  'city',
  'state',
  'pincode',
  'gstin',
];

type FieldErrors = Partial<Record<ErrorField, string>>;

const PINCODE_RE = /^\d{6}$/;

function validate(form: CreateCafeRequest): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.name.trim()) errors.name = 'Enter the cafe name.';
  if (!form.addressLine1.trim()) errors.addressLine1 = 'Enter the street address.';
  if (!form.city.trim()) errors.city = 'Enter the city.';
  if (!form.state.trim()) errors.state = 'Enter the state.';

  if (!form.pincode.trim()) {
    errors.pincode = 'Enter the pincode.';
  } else if (!PINCODE_RE.test(form.pincode.trim())) {
    errors.pincode = 'Pincode must be exactly 6 digits.';
  }

  // GSTIN is optional, but if present it must be 15 characters.
  const gstin = form.gstin?.trim();
  if (gstin && gstin.length !== 15) {
    errors.gstin = 'GSTIN must be 15 characters.';
  }

  return errors;
}

export function NewCafeForm() {
  const router = useRouter();
  const [form, setForm] = useState<CreateCafeRequest>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  // Per-field validation errors render next to each input.
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Form-level error is reserved for server/network/session failures only.
  const [formError, setFormError] = useState<string | null>(null);

  // One ref per validatable field so we can focus the first invalid one.
  const refs: Record<ErrorField, React.RefObject<HTMLInputElement | null>> = {
    name: useRef<HTMLInputElement>(null),
    addressLine1: useRef<HTMLInputElement>(null),
    city: useRef<HTMLInputElement>(null),
    state: useRef<HTMLInputElement>(null),
    pincode: useRef<HTMLInputElement>(null),
    gstin: useRef<HTMLInputElement>(null),
  };

  function update<K extends keyof CreateCafeRequest>(key: K, value: CreateCafeRequest[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear this field's error as soon as the user edits it.
    if (key in fieldErrors) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key as ErrorField];
        return next;
      });
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors = validate(form);
    setFieldErrors(errors);
    const firstInvalid = FIELD_ORDER.find((f) => errors[f]);
    if (firstInvalid) {
      refs[firstInvalid].current?.focus();
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setFormError('Session expired. Please sign in again.');
      return;
    }

    setSubmitting(true);
    try {
      const { cafe } = await createCafe(session.access_token, form);
      router.push(`/cafes/${cafe.id}`);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create cafe');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Cafe details</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <Field
            label={
              <>
                Cafe name
                <RequiredMark />
              </>
            }
            htmlFor="name"
            error={fieldErrors.name}
          >
            <Input
              id="name"
              ref={refs.name}
              required
              aria-required="true"
              aria-invalid={fieldErrors.name ? true : undefined}
              maxLength={120}
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="The Cozy Brew"
            />
          </Field>

          <Field
            label={
              <>
                Address line 1
                <RequiredMark />
              </>
            }
            htmlFor="addr1"
            error={fieldErrors.addressLine1}
          >
            <Input
              id="addr1"
              ref={refs.addressLine1}
              required
              aria-required="true"
              aria-invalid={fieldErrors.addressLine1 ? true : undefined}
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
            <Field
              label={
                <>
                  City
                  <RequiredMark />
                </>
              }
              htmlFor="city"
              error={fieldErrors.city}
            >
              <Input
                id="city"
                ref={refs.city}
                required
                aria-required="true"
                aria-invalid={fieldErrors.city ? true : undefined}
                maxLength={80}
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
                placeholder="Noida"
              />
            </Field>
            <Field
              label={
                <>
                  State
                  <RequiredMark />
                </>
              }
              htmlFor="state"
              error={fieldErrors.state}
            >
              <Input
                id="state"
                ref={refs.state}
                required
                aria-required="true"
                aria-invalid={fieldErrors.state ? true : undefined}
                maxLength={80}
                value={form.state}
                onChange={(e) => update('state', e.target.value)}
                placeholder="UP"
              />
            </Field>
          </div>

          <Field
            label={
              <>
                Pincode
                <RequiredMark />
              </>
            }
            htmlFor="pincode"
            error={fieldErrors.pincode}
          >
            <Input
              id="pincode"
              ref={refs.pincode}
              required
              aria-required="true"
              aria-invalid={fieldErrors.pincode ? true : undefined}
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={form.pincode}
              onChange={(e) => update('pincode', e.target.value)}
              placeholder="201301"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field
              label="GSTIN"
              hint={fieldErrors.gstin ? undefined : 'Optional'}
              htmlFor="gstin"
              error={fieldErrors.gstin}
            >
              <Input
                id="gstin"
                ref={refs.gstin}
                aria-invalid={fieldErrors.gstin ? true : undefined}
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

          {formError && (
            <p
              className="text-xs text-danger px-3 py-2 rounded-md border border-danger/20 bg-danger/5"
              role="alert"
            >
              {formError}
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
