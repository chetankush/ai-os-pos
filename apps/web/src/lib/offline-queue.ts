import type { CreateOrderRequest } from '@sangam/types';

/**
 * Offline-resilient order queue.
 *
 * Indian cafes lose internet regularly; a counter that can't take an order when
 * WiFi drops is a dealbreaker. This persists pending order POSTs to localStorage
 * (namespaced per cafe) and replays them when connectivity returns.
 *
 * Each queued item carries a client-generated idempotency key so a future
 * backend can dedupe replays. Until the backend honours it (see report), there
 * is a small duplicate-order risk on flaky reconnects — documented, not hidden.
 *
 * Pure logic + a thin storage layer keep this framework-agnostic and unit
 * testable. All reads/writes go through SSR-safe guards.
 */

const STORAGE_PREFIX = 'sangam.offline-orders.';

export interface QueuedOrder {
  /** Client-generated idempotency key (crypto.randomUUID). Stable across retries. */
  id: string;
  /** The order POST body, exactly as it would have been sent online. */
  payload: CreateOrderRequest;
  /** Epoch ms when the order was first queued. */
  createdAt: number;
  /** Number of flush attempts so far. */
  attempts: number;
}

// ─── Storage layer (SSR-safe) ──────────────────────────────────────────────────

function storageKey(cafeId: string): string {
  return `${STORAGE_PREFIX}${cafeId}`;
}

/** Returns localStorage when available (browser only), else null. */
function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // localStorage can throw in private-mode / sandboxed iframes.
    return null;
  }
}

function readQueue(cafeId: string): QueuedOrder[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey(cafeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: only keep entries that look like queued orders.
    return parsed.filter(
      (e): e is QueuedOrder =>
        e != null &&
        typeof e.id === 'string' &&
        typeof e.createdAt === 'number' &&
        typeof e.attempts === 'number' &&
        e.payload != null,
    );
  } catch {
    return [];
  }
}

function writeQueue(cafeId: string, items: QueuedOrder[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(storageKey(cafeId), JSON.stringify(items));
  } catch {
    // Quota / disabled storage — nothing we can safely do here.
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID.
  return `oq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Persist a pending order. Returns the created queue entry (with its
 * idempotency key) so the caller can surface it / track it.
 */
export function enqueue(cafeId: string, payload: CreateOrderRequest): QueuedOrder {
  const item: QueuedOrder = {
    id: newId(),
    payload,
    createdAt: Date.now(),
    attempts: 0,
  };
  const queue = readQueue(cafeId);
  queue.push(item);
  writeQueue(cafeId, queue);
  return item;
}

/** All queued orders for a cafe, oldest first. */
export function peekAll(cafeId: string): QueuedOrder[] {
  return readQueue(cafeId);
}

/** Number of pending orders for a cafe. */
export function pendingCount(cafeId: string): number {
  return readQueue(cafeId).length;
}

/** Remove a queued order by id (e.g. after a successful send). */
export function remove(cafeId: string, id: string): void {
  const queue = readQueue(cafeId);
  const next = queue.filter((item) => item.id !== id);
  if (next.length !== queue.length) writeQueue(cafeId, next);
}

/** A function that actually sends a queued order to the API. */
export type OrderSender = (item: QueuedOrder) => Promise<void>;

export interface FlushResult {
  /** Idempotency keys that sent successfully and were removed from the queue. */
  succeeded: string[];
  /** Idempotency keys that failed and remain queued for the next flush. */
  failed: string[];
}

/**
 * Replay queued orders via the provided async sender, removing each one that
 * succeeds. Items are processed oldest-first; a failure increments that item's
 * attempt count and leaves it queued. Already-running flushes are not guarded
 * here — the React hook serialises calls.
 */
export async function flush(cafeId: string, sender: OrderSender): Promise<FlushResult> {
  const queue = readQueue(cafeId);
  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const item of queue) {
    try {
      await sender(item);
      succeeded.push(item.id);
      // Remove immediately so a mid-flush crash doesn't replay sent orders.
      remove(cafeId, item.id);
    } catch {
      failed.push(item.id);
      bumpAttempts(cafeId, item.id);
    }
  }

  return { succeeded, failed };
}

/** Increment the attempt counter for a queued order (best-effort). */
function bumpAttempts(cafeId: string, id: string): void {
  const queue = readQueue(cafeId);
  let changed = false;
  const next = queue.map((item) => {
    if (item.id === id) {
      changed = true;
      return { ...item, attempts: item.attempts + 1 };
    }
    return item;
  });
  if (changed) writeQueue(cafeId, next);
}
