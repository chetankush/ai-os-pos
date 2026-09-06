import type { CreateOrderRequest } from '@sangam/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueue, flush, peekAll, pendingCount, remove } from './offline-queue';

const CAFE = 'cafe-1';
const OTHER = 'cafe-2';

function order(name = 'Walk-in'): CreateOrderRequest {
  return {
    source: 'counter',
    customerName: name,
    items: [{ menuItemId: 'm1', quantity: 1 }],
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('enqueue / peekAll / pendingCount', () => {
  it('persists an order with an idempotency key, payload, createdAt and attempts', () => {
    const item = enqueue(CAFE, order('Asha'));
    expect(item.id).toMatch(/.+/);
    expect(item.attempts).toBe(0);
    expect(typeof item.createdAt).toBe('number');
    expect(item.payload.customerName).toBe('Asha');

    const all = peekAll(CAFE);
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(item.id);
    expect(pendingCount(CAFE)).toBe(1);
  });

  it('assigns a unique id per enqueue', () => {
    const a = enqueue(CAFE, order());
    const b = enqueue(CAFE, order());
    expect(a.id).not.toBe(b.id);
    expect(pendingCount(CAFE)).toBe(2);
  });

  it('namespaces queues per cafe', () => {
    enqueue(CAFE, order());
    enqueue(OTHER, order());
    expect(pendingCount(CAFE)).toBe(1);
    expect(pendingCount(OTHER)).toBe(1);
  });

  it('returns an empty queue when nothing is stored', () => {
    expect(peekAll(CAFE)).toEqual([]);
    expect(pendingCount(CAFE)).toBe(0);
  });

  it('ignores corrupt localStorage data', () => {
    localStorage.setItem('sangam.offline-orders.cafe-1', 'not-json{');
    expect(peekAll(CAFE)).toEqual([]);
  });
});

describe('remove', () => {
  it('removes a queued order by id', () => {
    const a = enqueue(CAFE, order());
    const b = enqueue(CAFE, order());
    remove(CAFE, a.id);
    const remaining = peekAll(CAFE);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(b.id);
  });

  it('is a no-op for an unknown id', () => {
    enqueue(CAFE, order());
    remove(CAFE, 'nope');
    expect(pendingCount(CAFE)).toBe(1);
  });
});

describe('flush', () => {
  it('sends every queued order and removes the ones that succeed', async () => {
    enqueue(CAFE, order('A'));
    enqueue(CAFE, order('B'));
    const sender = vi.fn().mockResolvedValue(undefined);

    const result = await flush(CAFE, sender);

    expect(sender).toHaveBeenCalledTimes(2);
    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect(pendingCount(CAFE)).toBe(0);
  });

  it('keeps failed orders queued and bumps their attempt count', async () => {
    const a = enqueue(CAFE, order('A'));
    const b = enqueue(CAFE, order('B'));
    const sender = vi.fn(async (item: { id: string }) => {
      if (item.id === b.id) throw new Error('still offline');
    });

    const result = await flush(CAFE, sender);

    expect(result.succeeded).toEqual([a.id]);
    expect(result.failed).toEqual([b.id]);

    const remaining = peekAll(CAFE);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(b.id);
    expect(remaining[0]?.attempts).toBe(1);
  });

  it('does not retry already-sent orders within a single flush', async () => {
    enqueue(CAFE, order('A'));
    const sender = vi.fn().mockResolvedValue(undefined);
    await flush(CAFE, sender);
    // A second flush has nothing left to send.
    const second = await flush(CAFE, sender);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(second.succeeded).toHaveLength(0);
  });

  it('processes orders oldest-first', async () => {
    enqueue(CAFE, order('first'));
    enqueue(CAFE, order('second'));
    const seen: string[] = [];
    const sender = vi.fn(async (item: { payload: CreateOrderRequest }) => {
      seen.push(item.payload.customerName ?? '');
    });
    await flush(CAFE, sender);
    expect(seen).toEqual(['first', 'second']);
  });
});
