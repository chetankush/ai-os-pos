import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApiError } from './api';

// Trailing slashes stripped for the same reason as in ./api — see the note there.
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

async function getServerToken(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

interface ServerFetchOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  next?: NextFetchRequestConfig;
}

export async function serverFetch<T>(path: string, opts: ServerFetchOpts = {}): Promise<T> {
  const token = await getServerToken();
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    next: opts.next,
    cache: opts.next ? undefined : 'no-store',
  });

  if (!res.ok) {
    let parsed: { error?: { code?: string; message?: string } } | null = null;
    try {
      parsed = (await res.json()) as { error?: { code?: string; message?: string } };
    } catch {
      /* non-json body */
    }
    throw new ApiError(
      res.status,
      parsed?.error?.code ?? 'HTTP_ERROR',
      parsed?.error?.message ?? `Request failed with status ${res.status}`,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
