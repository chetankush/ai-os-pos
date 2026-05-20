'use client';

import type { Cafe } from '@cafespace/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ApiError, listCafes } from '@/lib/api';

export default function CafesListPage() {
  const { getAccessToken } = useAuth();
  const [cafes, setCafes] = useState<Cafe[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const token = getAccessToken();
    if (!token) return;

    listCafes(token, controller.signal)
      .then((data) => setCafes(data.cafes))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : 'Failed to load cafes');
      });

    return () => controller.abort();
  }, [getAccessToken]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your cafes</h1>
        <Link
          href="/cafes/new"
          className="rounded-md bg-black text-white dark:bg-white dark:text-black px-3 py-1.5 text-sm font-medium"
        >
          New cafe
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      {cafes === null && !error && <p className="text-sm opacity-60">Loading…</p>}

      {cafes?.length === 0 && (
        <div className="border border-dashed border-black/15 dark:border-white/15 rounded-lg p-8 text-center">
          <p className="text-sm opacity-70">You don&rsquo;t have any cafes yet.</p>
          <Link href="/cafes/new" className="text-sm underline mt-2 inline-block">
            Create your first cafe →
          </Link>
        </div>
      )}

      {cafes && cafes.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cafes.map((cafe) => (
            <li key={cafe.id}>
              <Link
                href={`/cafes/${cafe.id}`}
                className="block rounded-lg border border-black/10 dark:border-white/10 p-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <div className="font-medium">{cafe.name}</div>
                <div className="text-xs opacity-60 mt-1">
                  {cafe.city}, {cafe.state} · {cafe.pincode}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
