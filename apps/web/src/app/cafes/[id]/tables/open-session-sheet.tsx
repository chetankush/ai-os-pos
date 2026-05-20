'use client';

import type {
  OpenSessionRequest,
  TableSessionResponse,
  TableWithStatus,
} from '@sangam/types';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Sheet } from './sheet';
import { authedFetch } from './tables-tool';

interface Props {
  cafeId: string;
  table: TableWithStatus;
  onClose: () => void;
  onOpened: () => void;
}

const PHONE_RE = /^\+?\d{7,15}$/;

export function OpenSessionSheet({ cafeId, table, onClose, onOpened }: Props) {
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [partySize, setPartySize] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedPhone = guestPhone.trim();
    if (trimmedPhone && !PHONE_RE.test(trimmedPhone)) {
      setError('Enter a valid phone number');
      return;
    }
    const size = Number(partySize);
    if (partySize.trim() && (!Number.isInteger(size) || size < 1)) {
      setError('Party size must be a whole number');
      return;
    }

    const body: OpenSessionRequest = {
      tableId: table.id,
      ...(guestName.trim() ? { guestName: guestName.trim() } : {}),
      ...(trimmedPhone ? { guestPhone: trimmedPhone } : {}),
      ...(partySize.trim() ? { partySize: size } : {}),
    };

    setSubmitting(true);
    try {
      await authedFetch<TableSessionResponse>(`/cafes/${cafeId}/table-sessions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast.success(`Table ${table.label} seated`);
      onOpened();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open session');
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      title={`Seat Table ${table.label}`}
      subtitle="Start a tab — guest details are optional"
      onClose={onClose}
      footer={
        <Button
          type="submit"
          form="open-session-form"
          size="lg"
          className="w-full"
          loading={submitting}
        >
          {submitting ? 'Opening' : 'Open table'}
        </Button>
      }
    >
      <form id="open-session-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Guest name" hint="Optional" htmlFor="guest-name">
          <Input
            id="guest-name"
            autoFocus
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Asha"
            maxLength={120}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" hint="Optional" htmlFor="guest-phone">
            <Input
              id="guest-phone"
              type="tel"
              inputMode="tel"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="98765 43210"
              maxLength={20}
            />
          </Field>
          <Field label="Party size" hint="Optional" htmlFor="party-size">
            <Input
              id="party-size"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
              placeholder={String(table.seats)}
            />
          </Field>
        </div>

        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
