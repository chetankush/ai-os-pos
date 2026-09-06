'use client';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Customer } from '@sangam/types';
import { ChevronRight, Phone, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface Props {
  cafeId: string;
  initialCustomers: Customer[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatLastVisit(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

async function fetchCustomers(cafeId: string, search: string): Promise<Customer[]> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers();
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);

  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await fetch(`${API_URL}/cafes/${cafeId}/customers${qs}`, { headers });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const body = (await res.json()) as { customers: Customer[] };
  return body.customers;
}

export function CustomersList({ cafeId, initialCustomers }: Props) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState(initialCustomers);
  const [loading, setLoading] = useState(false);
  // Tracks the latest request so stale responses don't overwrite fresh ones.
  const reqId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    const id = ++reqId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const next = await fetchCustomers(cafeId, term);
        if (reqId.current === id) setCustomers(next);
      } catch {
        /* keep the previous list on a failed search */
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, cafeId]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          placeholder="Search by name or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          aria-label="Search customers"
        />
      </div>

      {customers.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="mx-auto size-12 rounded-lg bg-subtle border border-border grid place-items-center">
            <Users className="size-5 text-muted" />
          </div>
          <h3 className="mt-4 font-medium">{query.trim() ? 'No matches' : 'No customers yet'}</h3>
          <p className="mt-1 text-sm text-muted">
            {query.trim()
              ? 'Try a different name or phone number.'
              : 'Customers appear here once orders capture a phone number.'}
          </p>
        </Card>
      ) : (
        <Card className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <ul className="divide-y divide-border">
            {customers.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cafes/${cafeId}/customers/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle"
                >
                  <div className="size-9 shrink-0 rounded-full bg-accent/10 text-accent grid place-items-center text-sm font-semibold uppercase">
                    {(c.name ?? c.phone).charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name ?? 'Guest'}</p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted">
                      <Phone className="size-3" aria-hidden />
                      <span className="tabular-nums">{c.phone}</span>
                    </p>
                  </div>
                  <div className="hidden sm:block text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {formatPaise(c.totalSpentPaise)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted tabular-nums">
                      {c.totalOrders} {c.totalOrders === 1 ? 'order' : 'orders'}
                    </p>
                  </div>
                  <div className="hidden md:block w-28 text-right">
                    <p className="text-xs text-muted">Last visit</p>
                    <p className="mt-0.5 text-xs font-medium tabular-nums">
                      {formatLastVisit(c.lastOrderAt)}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
