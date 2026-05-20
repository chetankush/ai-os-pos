'use client';

import type { Cafe, CafeResponse, UpdateCafeRequest } from '@sangam/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageUpload } from '@/components/ui/image-upload';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Editable text/flag fields tracked in form state.
interface FormState {
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  fssai: string;
  isAirConditioned: boolean;
  onlinePaymentEnabled: boolean;
  qrPrepaidRequired: boolean;
  primaryColor: string;
}

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

function validate(form: FormState): FieldErrors {
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
  const gstin = form.gstin.trim();
  if (gstin && gstin.length !== 15) {
    errors.gstin = 'GSTIN must be 15 characters.';
  }

  return errors;
}

export function EditCafeForm({ cafe }: { cafe: Cafe }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    name: cafe.name,
    addressLine1: cafe.addressLine1,
    addressLine2: cafe.addressLine2 ?? '',
    city: cafe.city,
    state: cafe.state,
    pincode: cafe.pincode,
    gstin: cafe.gstin ?? '',
    fssai: cafe.fssai ?? '',
    isAirConditioned: cafe.isAirConditioned,
    onlinePaymentEnabled: cafe.onlinePaymentEnabled,
    qrPrepaidRequired: cafe.qrPrepaidRequired,
    primaryColor: cafe.primaryColor ?? '',
  });
  // Logo lives outside FormState since ImageUpload owns its value/onChange.
  const [logoUrl, setLogoUrl] = useState<string | null>(cafe.logoUrl);
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

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
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

    // Build the patch. Required text fields go through trimmed; optional text
    // fields send null when cleared so the backend can unset them.
    const patch: UpdateCafeRequest = {
      name: form.name.trim(),
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim() || null,
      city: form.city.trim(),
      state: form.state.trim(),
      pincode: form.pincode.trim(),
      gstin: form.gstin.trim() || null,
      fssai: form.fssai.trim() || null,
      isAirConditioned: form.isAirConditioned,
      onlinePaymentEnabled: form.onlinePaymentEnabled,
      // Prepayment is meaningless without online payments — never persist a
      // stale "on" value while the dependent toggle is disabled.
      qrPrepaidRequired: form.onlinePaymentEnabled && form.qrPrepaidRequired,
      primaryColor: form.primaryColor.trim() || null,
      logoUrl,
    };

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/cafes/${cafe.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        throw new ApiError(
          res.status,
          body?.error?.code ?? 'HTTP_ERROR',
          body?.error?.message ?? `Request failed with status ${res.status}`,
        );
      }
      const { cafe: updated } = (await res.json()) as CafeResponse;
      toast.success('Cafe updated');
      router.push(`/cafes/${updated.id}`);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to update cafe');
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
          <Field label="Logo" hint="Optional · square image works best">
            <ImageUpload shape="square" value={logoUrl} onChange={setLogoUrl} />
          </Field>

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
              value={form.addressLine2}
              onChange={(e) => update('addressLine2', e.target.value)}
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
                value={form.gstin}
                onChange={(e) => update('gstin', e.target.value)}
                placeholder="22AAAAA0000A1Z5"
              />
            </Field>
            <Field label="FSSAI license" hint="Optional" htmlFor="fssai">
              <Input
                id="fssai"
                maxLength={14}
                value={form.fssai}
                onChange={(e) => update('fssai', e.target.value)}
              />
            </Field>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-subtle/40 cursor-pointer hover:border-border-strong transition-colors">
            <input
              type="checkbox"
              checked={form.isAirConditioned}
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

          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Payments
            </h3>

            <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-subtle/40 cursor-pointer hover:border-border-strong transition-colors">
              <input
                type="checkbox"
                checked={form.onlinePaymentEnabled}
                onChange={(e) =>
                  update('onlinePaymentEnabled', e.target.checked)
                }
                className="mt-0.5 size-4 accent-fg"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  Accept online payments (Razorpay)
                </span>
                <p className="text-xs text-muted">
                  Let diners pay from their phone when they scan the table QR.
                </p>
              </div>
            </label>

            {/*
              Prepayment depends on online payments. When disabled we drop the
              opacity, swap the cursor, and set the input's `disabled` attribute
              so it's semantically (not just visually) inert.
            */}
            <label
              className={cn(
                'flex items-start gap-3 p-3 rounded-md border border-border bg-subtle/40 transition-colors',
                form.onlinePaymentEnabled
                  ? 'cursor-pointer hover:border-border-strong'
                  : 'opacity-50 cursor-not-allowed',
              )}
            >
              <input
                type="checkbox"
                disabled={!form.onlinePaymentEnabled}
                checked={form.onlinePaymentEnabled && form.qrPrepaidRequired}
                onChange={(e) => update('qrPrepaidRequired', e.target.checked)}
                className={cn(
                  'mt-0.5 size-4 accent-fg',
                  !form.onlinePaymentEnabled && 'cursor-not-allowed',
                )}
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  Require prepayment for QR orders
                </span>
                <p className="text-xs text-muted">
                  Diners must pay online before the order reaches the kitchen.
                  Off = pay-later tab or pay at counter.
                </p>
              </div>
            </label>
          </div>

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
          <Link href={`/cafes/${cafe.id}`} className={buttonClasses({ variant: 'ghost' })}>
            Cancel
          </Link>
          <Button type="submit" loading={submitting}>
            {submitting ? 'Saving' : 'Save changes'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
