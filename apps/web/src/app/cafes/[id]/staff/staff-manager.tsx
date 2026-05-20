'use client';

import { Button, buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { FadeIn } from '@/components/ui/motion';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Staff, StaffRole } from '@sangam/types';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

interface Props {
  cafeId: string;
  initialStaff: Staff[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const ROLES: { value: StaffRole; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'waiter', label: 'Waiter' },
];

const ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  waiter: 'Waiter',
};

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

export function StaffManager({ cafeId, initialStaff }: Props) {
  const [staff, setStaff] = useState(initialStaff);
  const [showAdd, setShowAdd] = useState(initialStaff.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);

  function upsert(member: Staff) {
    setStaff((prev) => {
      const exists = prev.some((s) => s.id === member.id);
      return exists ? prev.map((s) => (s.id === member.id ? member : s)) : [...prev, member];
    });
  }

  function patchMember(id: string, patch: Partial<Staff>) {
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function remove(id: string) {
    setStaff((prev) => prev.filter((s) => s.id !== id));
  }

  if (staff.length === 0 && !showAdd) {
    return (
      <Card className="p-12 text-center border-dashed">
        <div className="mx-auto size-12 rounded-lg bg-subtle border border-border grid place-items-center">
          <Users className="size-5 text-muted" />
        </div>
        <h3 className="mt-4 font-medium">No staff yet</h3>
        <p className="mt-1 text-sm text-muted">Add your first team member to get started.</p>
        <div className="mt-6">
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="size-4" />
            Add staff
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <ul className="divide-y divide-border">
          <AnimatePresence initial={false}>
            {staff.map((member) => (
              <motion.li
                key={member.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
              >
                {editingId === member.id ? (
                  <div className="p-4">
                    <StaffForm
                      cafeId={cafeId}
                      member={member}
                      onDone={(updated) => {
                        upsert(updated);
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                ) : (
                  <StaffRow
                    cafeId={cafeId}
                    member={member}
                    onEdit={() => setEditingId(member.id)}
                    onToggleActive={(isActive) => patchMember(member.id, { isActive })}
                    onDelete={() => remove(member.id)}
                  />
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </Card>

      <AnimatePresence>
        {showAdd ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <Card className="p-5">
              <StaffForm
                cafeId={cafeId}
                onDone={(created) => {
                  upsert(created);
                  setShowAdd(false);
                }}
                onCancel={() => setShowAdd(false)}
              />
            </Card>
          </motion.div>
        ) : (
          <FadeIn>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className={cn(
                'w-full rounded-lg border border-dashed border-border-strong',
                'px-4 py-5 text-sm text-muted',
                'hover:border-fg hover:text-fg transition-colors',
                'flex items-center justify-center gap-2',
              )}
            >
              <Plus className="size-4" />
              Add staff member
            </button>
          </FadeIn>
        )}
      </AnimatePresence>
    </div>
  );
}

function StaffRow({
  cafeId,
  member,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  cafeId: string;
  member: Staff;
  onEdit: () => void;
  onToggleActive: (isActive: boolean) => void;
  onDelete: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function toggleActive(next: boolean) {
    onToggleActive(next);
    startTransition(async () => {
      try {
        await authedFetch(`/cafes/${cafeId}/staff/${member.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: next }),
        });
        toast.success(next ? `${member.name} reactivated` : `${member.name} deactivated`);
      } catch (err) {
        onToggleActive(!next); // revert
        toast.error(err instanceof Error ? err.message : 'Failed to update staff');
      }
    });
  }

  function doDelete() {
    startTransition(async () => {
      try {
        await authedFetch(`/cafes/${cafeId}/staff/${member.id}`, { method: 'DELETE' });
        toast.success(`Removed ${member.name}`);
        onDelete();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to remove staff');
      }
    });
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="size-9 shrink-0 rounded-full bg-accent/10 text-accent grid place-items-center text-sm font-semibold uppercase">
        {member.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn('font-medium text-sm truncate', !member.isActive && 'text-muted')}>
            {member.name}
          </p>
          {!member.isActive && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted rounded-full bg-subtle px-2 py-0.5">
              Inactive
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <span>{ROLE_LABEL[member.role]}</span>
          {member.hasPin && (
            <span className="inline-flex items-center gap-1">
              <KeyRound className="size-3" aria-hidden />
              PIN set
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={member.isActive}
        aria-label={`${member.name} active`}
        disabled={isPending}
        onClick={() => toggleActive(!member.isActive)}
        className="relative grid place-items-center size-11 shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2"
      >
        <span
          className={cn(
            'relative block h-6 w-10 rounded-full transition-colors',
            member.isActive ? 'bg-accent' : 'bg-border-strong',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 size-5 bg-bg rounded-full shadow-sm transition-transform',
              member.isActive ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </span>
      </button>

      <button
        type="button"
        onClick={onEdit}
        disabled={isPending}
        aria-label={`Edit ${member.name}`}
        className="grid place-items-center size-11 shrink-0 rounded-md text-muted hover:text-fg hover:bg-subtle transition-colors"
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        aria-label={`Remove ${member.name}`}
        className="grid place-items-center size-11 shrink-0 -mr-2 rounded-md text-muted hover:text-danger hover:bg-danger/5 transition-colors"
      >
        <Trash2 className="size-4" />
      </button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Remove ${member.name}?`}
        description="This removes the staff member. Their past activity stays in the audit log."
        confirmLabel="Remove"
        destructive
        onConfirm={doDelete}
      />
    </div>
  );
}

function StaffForm({
  cafeId,
  member,
  onDone,
  onCancel,
}: {
  cafeId: string;
  member?: Staff;
  onDone: (member: Staff) => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(member);
  const [name, setName] = useState(member?.name ?? '');
  const [role, setRole] = useState<StaffRole>(member?.role ?? 'waiter');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a name');
      return;
    }
    if (pin && !/^[0-9]{4,8}$/.test(pin)) {
      setError('PIN must be 4–8 digits');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && member) {
        const payload: Record<string, unknown> = { name: trimmed, role };
        if (pin) payload.pin = pin;
        const data = await authedFetch(`/cafes/${cafeId}/staff/${member.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        onDone(data.staff);
        toast.success(`Updated ${trimmed}`);
      } else {
        const data = await authedFetch(`/cafes/${cafeId}/staff`, {
          method: 'POST',
          body: JSON.stringify({ name: trimmed, role, pin: pin || undefined }),
        });
        onDone(data.staff);
        toast.success(`Added ${trimmed}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save staff');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label="Name" htmlFor="staff-name">
        <Input
          id="staff-name"
          autoFocus
          placeholder="Asha Kumar"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
        />
      </Field>

      <div>
        <p className="text-sm font-medium text-fg/90 mb-1.5">Role</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              aria-pressed={role === r.value}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md border transition-colors',
                role === r.value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-muted hover:border-border-strong',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <Field
        label="PIN"
        hint={isEdit ? 'Leave blank to keep the current PIN' : '4–8 digits, optional'}
        htmlFor="staff-pin"
      >
        <Input
          id="staff-pin"
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
          maxLength={8}
        />
      </Field>

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
          {isEdit ? 'Save changes' : 'Add staff'}
        </Button>
      </div>
    </form>
  );
}
