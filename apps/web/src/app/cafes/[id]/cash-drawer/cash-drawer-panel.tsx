'use client';

import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { CashDrawerSession, CloseDrawerResponse } from '@sangam/types';
import { Lock, Unlock, Wallet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface Props {
  cafeId: string;
  initialSession: CashDrawerSession | null;
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
  return res.json();
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toPaise(rupeesStr: string): number | null {
  const n = Number(rupeesStr);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function CashDrawerPanel({ cafeId, initialSession }: Props) {
  const [session, setSession] = useState<CashDrawerSession | null>(initialSession);

  if (session) {
    return <CloseDrawerCard cafeId={cafeId} session={session} onClosed={() => setSession(null)} />;
  }
  return <OpenDrawerCard cafeId={cafeId} onOpened={setSession} />;
}

function OpenDrawerCard({
  cafeId,
  onOpened,
}: {
  cafeId: string;
  onOpened: (session: CashDrawerSession) => void;
}) {
  const [float, setFloat] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const paise = toPaise(float);
    if (paise === null) {
      setError('Enter a valid opening float');
      return;
    }

    setSubmitting(true);
    try {
      const data = await authedFetch(`/cafes/${cafeId}/cash-drawer/open`, {
        method: 'POST',
        body: JSON.stringify({ openingFloatPaise: paise, notes: notes.trim() || undefined }),
      });
      onOpened(data.session);
      toast.success('Drawer opened');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open drawer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-subtle border border-border grid place-items-center">
          <Wallet className="size-4 text-muted" />
        </div>
        <div>
          <CardTitle>No open drawer</CardTitle>
          <p className="text-xs text-muted mt-0.5">Start a shift by entering the opening float.</p>
        </div>
      </CardHeader>
      <CardBody className="pt-0">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Opening float (₹)" htmlFor="float">
            <Input
              id="float"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              autoFocus
              placeholder="2000"
              value={float}
              onChange={(e) => setFloat(e.target.value)}
              required
              className="tabular-nums"
            />
          </Field>
          <Field label="Notes" hint="Optional" htmlFor="open-notes">
            <Input
              id="open-notes"
              placeholder="Morning shift"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
          </Field>
          {error && (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="pt-1">
            <Button type="submit" loading={submitting} className="w-full">
              <Unlock className="size-4" />
              Open drawer
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function CloseDrawerCard({
  cafeId,
  session,
  onClosed,
}: {
  cafeId: string;
  session: CashDrawerSession;
  onClosed: () => void;
}) {
  const [counted, setCounted] = useState('');
  const [expected, setExpected] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CloseDrawerResponse | null>(null);

  // Live preview of variance as the user types.
  const countedPaise = toPaise(counted);
  const expectedPaise = expected.trim() ? toPaise(expected) : null;
  const previewVariance =
    countedPaise !== null && expectedPaise !== null ? countedPaise - expectedPaise : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (countedPaise === null) {
      setError('Enter the counted cash');
      return;
    }
    if (expected.trim() && expectedPaise === null) {
      setError('Enter a valid expected cash amount');
      return;
    }

    setSubmitting(true);
    try {
      const data: CloseDrawerResponse = await authedFetch(`/cafes/${cafeId}/cash-drawer/close`, {
        method: 'POST',
        body: JSON.stringify({
          closingCountedPaise: countedPaise,
          expectedCashPaise: expectedPaise ?? undefined,
          notes: notes.trim() || undefined,
        }),
      });
      setResult(data);
      toast.success('Drawer closed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close drawer');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return <ClosedSummary result={result} onDone={onClosed} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-success/10 grid place-items-center">
            <Wallet className="size-4 text-success" />
          </div>
          <div>
            <CardTitle>Drawer open</CardTitle>
            <p className="text-xs text-muted mt-0.5">
              Opened {new Date(session.openedAt).toLocaleString('en-IN')}
            </p>
          </div>
        </CardHeader>
        <CardBody className="pt-0">
          <dl className="flex items-center justify-between text-sm">
            <dt className="text-muted">Opening float</dt>
            <dd className="font-mono tabular-nums">{rupees(session.openingFloatPaise)}</dd>
          </dl>
          {session.notes && <p className="mt-2 text-xs text-muted">{session.notes}</p>}
        </CardBody>
      </Card>

      <Card className="p-5">
        <form onSubmit={handleSubmit} className="space-y-3">
          <h3 className="font-medium text-sm">Close drawer</h3>
          <Field label="Counted cash (₹)" htmlFor="counted">
            <Input
              id="counted"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              autoFocus
              placeholder="5100"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              required
              className="tabular-nums"
            />
          </Field>
          <Field
            label="Expected cash (₹)"
            hint="Optional — used to compute variance"
            htmlFor="expected"
          >
            <Input
              id="expected"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              placeholder="5000"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              className="tabular-nums"
            />
          </Field>

          {previewVariance !== null && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-subtle/40 px-3 py-2 text-sm">
              <span className="text-muted">Variance</span>
              <VarianceValue paise={previewVariance} />
            </div>
          )}

          <Field label="Notes" hint="Optional" htmlFor="close-notes">
            <Input
              id="close-notes"
              placeholder="Counted by Asha"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
          </Field>

          {error && (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="pt-1">
            <Button type="submit" loading={submitting} className="w-full">
              <Lock className="size-4" />
              Close drawer
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function ClosedSummary({
  result,
  onDone,
}: {
  result: CloseDrawerResponse;
  onDone: () => void;
}) {
  const { session, variancePaise } = result;
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-subtle border border-border grid place-items-center">
          <Lock className="size-4 text-muted" />
        </div>
        <div>
          <h3 className="font-medium">Drawer closed</h3>
          <p className="text-xs text-muted mt-0.5">
            {session.closedAt ? new Date(session.closedAt).toLocaleString('en-IN') : ''}
          </p>
        </div>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted">Opening float</dt>
          <dd className="font-mono tabular-nums">{rupees(session.openingFloatPaise)}</dd>
        </div>
        {session.expectedCashPaise !== null && (
          <div className="flex items-center justify-between">
            <dt className="text-muted">Expected cash</dt>
            <dd className="font-mono tabular-nums">{rupees(session.expectedCashPaise)}</dd>
          </div>
        )}
        <div className="flex items-center justify-between">
          <dt className="text-muted">Counted cash</dt>
          <dd className="font-mono tabular-nums">
            {session.closingCountedPaise !== null ? rupees(session.closingCountedPaise) : '—'}
          </dd>
        </div>
        {variancePaise !== null && (
          <div className="flex items-center justify-between border-t border-border pt-2">
            <dt className="text-muted">Variance</dt>
            <dd>
              <VarianceValue paise={variancePaise} />
            </dd>
          </div>
        )}
      </dl>

      <Button variant="secondary" onClick={onDone} className="w-full">
        Start a new shift
      </Button>
    </Card>
  );
}

function VarianceValue({ paise }: { paise: number }) {
  const tone = paise === 0 ? 'text-muted' : paise > 0 ? 'text-success' : 'text-danger';
  const label = paise === 0 ? '' : paise > 0 ? ' over' : ' short';
  return (
    <span className={cn('font-mono tabular-nums font-medium', tone)}>
      {paise > 0 ? '+' : ''}
      {`₹${(Math.abs(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      {label}
    </span>
  );
}
