'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type FlushResult, type OrderSender, flush, pendingCount } from './offline-queue';

const FLUSH_INTERVAL_MS = 30_000;

export interface UseOfflineQueue {
  /** Live navigator.onLine state. SSR/initial render assumes online. */
  online: boolean;
  /** Pending (unsynced) order count for this cafe. */
  pendingCount: number;
  /** Manually trigger a flush; resolves with the result (or null if no sender / nothing to do). */
  flushNow: () => Promise<FlushResult | null>;
}

/**
 * Tracks connectivity + the per-cafe offline order queue, auto-flushing on
 * reconnect and on an interval. Re-renders when the pending count changes.
 *
 * The caller supplies `sender`, which knows how to POST a queued order to the
 * API (with the cashier's auth). Pass a stable callback (or memoise it) — the
 * hook reads it through a ref so identity churn doesn't restart timers.
 */
export function useOfflineQueue(cafeId: string, sender: OrderSender): UseOfflineQueue {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [count, setCount] = useState<number>(0);

  // Keep the latest sender without retriggering effects.
  const senderRef = useRef(sender);
  senderRef.current = sender;

  // Guard against overlapping flushes (interval + reconnect + manual).
  const flushingRef = useRef(false);

  const refreshCount = useCallback(() => {
    setCount(pendingCount(cafeId));
  }, [cafeId]);

  const flushNow = useCallback(async (): Promise<FlushResult | null> => {
    if (flushingRef.current) return null;
    if (pendingCount(cafeId) === 0) {
      refreshCount();
      return null;
    }
    flushingRef.current = true;
    try {
      const result = await flush(cafeId, (item) => senderRef.current(item));
      return result;
    } finally {
      flushingRef.current = false;
      refreshCount();
    }
  }, [cafeId, refreshCount]);

  // Sync initial count + react to online/offline events.
  useEffect(() => {
    refreshCount();
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);

    const handleOnline = () => {
      setOnline(true);
      void flushNow();
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushNow, refreshCount]);

  // Periodic flush — covers cases where 'online' fires before the network is
  // actually usable, or never fires at all on flaky connections.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      void flushNow();
    }, FLUSH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [flushNow]);

  return { online, pendingCount: count, flushNow };
}
