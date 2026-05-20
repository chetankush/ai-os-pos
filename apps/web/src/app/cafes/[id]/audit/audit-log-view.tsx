'use client';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { AuditLog, AuditLogListResponse } from '@sangam/types';
import { ScrollText } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

interface Props {
  cafeId: string;
  initialLogs: AuditLog[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function authedFetch(path: string, init: RequestInit = {}) {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

const ACTOR_STYLE: Record<string, string> = {
  owner: 'bg-accent/10 text-accent',
  staff: 'bg-subtle text-fg',
  system: 'bg-subtle text-muted',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AuditLogView({ cafeId, initialLogs }: Props) {
  const [logs, setLogs] = useState(initialLogs);
  const [actionFilter, setActionFilter] = useState('');
  const [isPending, startTransition] = useTransition();

  function applyFilter(value: string) {
    setActionFilter(value);
    startTransition(async () => {
      try {
        const qs = value.trim() ? `?action=${encodeURIComponent(value.trim())}` : '';
        const data: AuditLogListResponse = await authedFetch(`/cafes/${cafeId}/audit-logs${qs}`);
        setLogs(data.logs);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load audit log');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <Input
          placeholder="Filter by action (e.g. order.void)"
          value={actionFilter}
          onChange={(e) => applyFilter(e.target.value)}
          aria-label="Filter audit log by action"
        />
      </div>

      {logs.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="mx-auto size-12 rounded-lg bg-subtle border border-border grid place-items-center">
            <ScrollText className="size-5 text-muted" />
          </div>
          <h3 className="mt-4 font-medium">No entries</h3>
          <p className="mt-1 text-sm text-muted">
            {actionFilter.trim()
              ? 'No audit entries match that action.'
              : 'Sensitive actions will appear here as they happen.'}
          </p>
        </Card>
      ) : (
        <Card className={cn('overflow-hidden transition-opacity', isPending && 'opacity-60')}>
          <ul className="divide-y divide-border">
            {logs.map((log) => (
              <li key={log.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={cn(
                    'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                    ACTOR_STYLE[log.actorType] ?? ACTOR_STYLE.system,
                  )}
                >
                  {log.actorType}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono text-fg/80 rounded bg-subtle px-1.5 py-0.5">
                      {log.action}
                    </code>
                    {log.actorName && <span className="text-xs text-muted">{log.actorName}</span>}
                  </div>
                  <p className="mt-1 text-sm">{log.summary}</p>
                  {log.entityType && (
                    <p className="mt-0.5 text-xs text-muted truncate">
                      {log.entityType}
                      {log.entityId ? ` · ${log.entityId}` : ''}
                    </p>
                  )}
                </div>
                <time
                  className="shrink-0 text-xs text-muted tabular-nums"
                  dateTime={log.createdAt}
                  title={new Date(log.createdAt).toLocaleString('en-IN')}
                >
                  {formatTime(log.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
