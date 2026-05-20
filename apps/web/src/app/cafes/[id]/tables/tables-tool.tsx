'use client';

import type { TableLiveStatus } from '@sangam/types';
import {
  CheckCircle2,
  CircleDashed,
  type LucideIcon,
  Receipt,
  Users,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Shared client helpers for the live floor + table sessions.
 * (This file previously held the QR generator, now replaced by the live floor.)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Supabase-bearer JSON fetch for owner-auth session mutations/reads. */
export async function authedFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
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
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

const RUPEE_FORMATTER = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

/** Rounded-rupees display, e.g. ₹1,250. */
export function formatRupees(paise: number): string {
  return `₹${RUPEE_FORMATTER.format(Math.round(paise / 100))}`;
}

// ─── Live-status visual semantics ───────────────────────────────────────────
// Color + icon + text label (never color alone). Each set carries a dark
// variant — consistent with the §8 status palette in design.md.

export interface LiveStatusStyle {
  label: string;
  Icon: LucideIcon;
  /** Card surface + border + text classes (light + dark). */
  card: string;
  /** Small status chip classes (light + dark). */
  chip: string;
}

export const LIVE_STATUS: Record<TableLiveStatus, LiveStatusStyle> = {
  free: {
    label: 'Free',
    Icon: CircleDashed,
    card: 'border-border bg-bg text-fg hover:border-border-strong',
    chip: 'bg-subtle text-muted border-border',
  },
  occupied: {
    label: 'Occupied',
    Icon: Users,
    card:
      'border-accent/40 bg-accent/5 text-fg hover:border-accent ' +
      'dark:bg-accent/10',
    chip: 'bg-accent/10 text-accent border-accent/30',
  },
  ready: {
    label: 'Ready',
    Icon: CheckCircle2,
    card:
      'border-emerald-300 bg-emerald-50 text-fg hover:border-emerald-400 ' +
      'dark:border-emerald-800 dark:bg-emerald-900/20',
    chip:
      'bg-emerald-100 text-emerald-900 border-emerald-200 ' +
      'dark:bg-emerald-900/30 dark:text-emerald-100 dark:border-emerald-800',
  },
  billed: {
    label: 'Billed',
    Icon: Receipt,
    card:
      'border-blue-300 bg-blue-50 text-fg hover:border-blue-400 ' +
      'dark:border-blue-800 dark:bg-blue-900/20',
    chip:
      'bg-blue-100 text-blue-900 border-blue-200 ' +
      'dark:bg-blue-900/30 dark:text-blue-100 dark:border-blue-800',
  },
};
