import type { Database } from '@sangam/db';
import { schema } from '@sangam/db';
import { describe, expect, it } from 'vitest';
import { createDrizzleTableSessionsRepo } from './table-sessions.js';

/**
 * Repo-level coverage for the "cancelled orders are still billed" bug. We run
 * the REAL repo against a tiny in-memory fake of the Drizzle query builder that
 * actually evaluates the `where` predicates the repo constructs — so the test
 * proves the cancelled-order exclusion lives in the repo, not the test.
 *
 * Only the handful of query shapes the table-sessions repo uses are supported.
 */

// ─── Minimal Drizzle predicate evaluator ──────────────────────────────────────
// Walks the SQL AST produced by eq/ne/inArray/and and returns a JS predicate.
type Row = Record<string, unknown>;

function isSql(node: unknown): node is { queryChunks: unknown[] } {
  return Boolean(node) && Array.isArray((node as { queryChunks?: unknown[] }).queryChunks);
}

function chunkName(c: unknown): string | undefined {
  return (c as { constructor?: { name?: string } })?.constructor?.name;
}

function stringChunkValue(c: unknown): string {
  const v = (c as { value?: string[] }).value;
  return Array.isArray(v) ? v.join('') : '';
}

function evalSql(node: unknown, row: Row): boolean {
  if (!isSql(node)) return true;
  const chunks = node.queryChunks;

  // Boolean group: and(...) → ['(', innerSql, ')'] where inner joins with ' and '
  const innerSql = chunks.find((c, i) => i > 0 && isSql(c));
  if (chunks.length === 3 && isSql(chunks[1])) {
    return evalGroup(chunks[1], row);
  }

  // Leaf comparison: [ '', Column, op, Param|Array, '' ]
  const col = chunks.find((c) => chunkName(c)?.startsWith('Pg')) as { name?: string } | undefined;
  if (!col?.name) {
    // Could be a bare grouped expression.
    return innerSql ? evalGroup(innerSql, row) : true;
  }
  const op = chunks
    .filter((c) => chunkName(c) === 'StringChunk')
    .map(stringChunkValue)
    .map((s) => s.trim())
    .find((s) => s === '=' || s === '<>' || s === 'in');

  const left = row[col.name];

  if (op === 'in') {
    // inArray(col, [...]) emits the value list as a bare JS Array chunk whose
    // elements are Param objects.
    const arr = chunks.find((c) => Array.isArray(c)) as unknown[] | undefined;
    const params = (arr ?? []) as { value?: unknown }[];
    const values = params.map((p) => (p && typeof p === 'object' && 'value' in p ? p.value : p));
    return values.includes(left);
  }

  const param = chunks.find((c) => chunkName(c) === 'Param') as { value?: unknown } | undefined;
  const right = param?.value;
  if (op === '<>') return left !== right;
  return left === right; // '=' (default)
}

function evalGroup(node: unknown, row: Row): boolean {
  if (!isSql(node)) return true;
  // Inner of an and(): [SQL, ' and ', SQL, ' and ', SQL, …] — every SQL must hold.
  const parts = node.queryChunks.filter((c) => isSql(c));
  if (parts.length === 0) return evalSql(node, row);
  return parts.every((p) => evalSql(p, row));
}

// ─── Fake Database ─────────────────────────────────────────────────────────────
interface Store {
  tableSessions: Row[];
  restaurantTables: Row[];
  orders: Row[];
  orderItems: Row[];
}

function tableKey(table: unknown): keyof Store {
  if (table === schema.tableSessions) return 'tableSessions';
  if (table === schema.restaurantTables) return 'restaurantTables';
  if (table === schema.orders) return 'orders';
  if (table === schema.orderItems) return 'orderItems';
  throw new Error('Unknown table in fake db');
}

function makeFakeDb(store: Store): Database {
  function selectChain(rows: Row[]) {
    const chain = {
      from(table: unknown) {
        const data = store[tableKey(table)];
        return whereChain(data);
      },
    };
    return chain;
  }

  function whereChain(data: Row[]) {
    let current = data;
    const chain = {
      where(predicate: unknown) {
        current = current.filter((r) => evalSql(predicate, r));
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit(n: number) {
        return Promise.resolve(current.slice(0, n));
      },
      then(resolve: (rows: Row[]) => unknown) {
        return Promise.resolve(current).then(resolve);
      },
    };
    return chain;
  }

  const db = {
    select(_projection?: unknown) {
      return selectChain([]);
    },
    transaction(cb: (tx: unknown) => Promise<unknown>) {
      return cb(db);
    },
    update(table: unknown) {
      const key = tableKey(table);
      let patch: Row = {};
      const chain = {
        set(p: Row) {
          patch = p;
          return chain;
        },
        where(predicate: unknown) {
          for (const r of store[key]) {
            if (evalSql(predicate, r)) Object.assign(r, patch);
          }
          return {
            returning() {
              return Promise.resolve(store[key].filter((r) => evalSql(predicate, r)));
            },
            then(resolve: (v: unknown) => unknown) {
              return Promise.resolve(undefined).then(resolve);
            },
          };
        },
      };
      return chain;
    },
  };
  return db as unknown as Database;
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────
const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TABLE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SESSION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function baseStore(): Store {
  return {
    tableSessions: [
      {
        id: SESSION_ID,
        cafeId: CAFE_ID,
        tableId: TABLE_ID,
        status: 'open',
        guestName: null,
        guestPhone: null,
        partySize: null,
        openedAt: '2026-05-20T00:00:00.000Z',
        closedAt: null,
      },
    ],
    restaurantTables: [
      {
        id: TABLE_ID,
        cafeId: CAFE_ID,
        label: 'T1',
        area: null,
        shape: 'square',
        seats: 4,
        x: 0,
        y: 0,
        sortOrder: 0,
        createdAt: '2026-05-20T00:00:00.000Z',
        updatedAt: '2026-05-20T00:00:00.000Z',
      },
    ],
    orders: [
      // Live order — should be billed/counted.
      {
        id: 'order-live',
        cafeId: CAFE_ID,
        tableSessionId: SESSION_ID,
        orderNumber: 'INV/2026-27/000001',
        status: 'ready',
        source: 'counter',
        tableLabel: null,
        customerName: null,
        customerPhone: null,
        notes: null,
        subtotalPaise: 20000,
        taxPaise: 1000,
        totalPaise: 21000,
        gstRateBp: 500,
        paymentMethod: null,
        paymentStatus: 'unpaid',
        providerOrderId: null,
        providerPaymentId: null,
        createdAt: '2026-05-20T00:00:00.000Z',
        updatedAt: '2026-05-20T00:00:00.000Z',
        paidAt: null,
      },
      // Cancelled order — must NOT be billed/counted/charged.
      {
        id: 'order-cancelled',
        cafeId: CAFE_ID,
        tableSessionId: SESSION_ID,
        orderNumber: 'INV/2026-27/000002',
        status: 'cancelled',
        source: 'counter',
        tableLabel: null,
        customerName: null,
        customerPhone: null,
        notes: null,
        subtotalPaise: 99900,
        taxPaise: 4995,
        totalPaise: 104895,
        gstRateBp: 500,
        paymentMethod: null,
        paymentStatus: 'unpaid',
        providerOrderId: null,
        providerPaymentId: null,
        createdAt: '2026-05-20T00:00:01.000Z',
        updatedAt: '2026-05-20T00:00:01.000Z',
        paidAt: null,
      },
    ],
    orderItems: [],
  };
}

describe('table-sessions repo — cancelled orders are excluded', () => {
  it('getDetail excludes the cancelled order from orders + totals', async () => {
    const store = baseStore();
    const repo = createDrizzleTableSessionsRepo(makeFakeDb(store));
    const detail = await repo.getDetail(SESSION_ID, CAFE_ID);
    expect(detail).not.toBeNull();
    expect(detail?.orders.map((o) => o.id)).toEqual(['order-live']);
    expect(detail?.subtotalPaise).toBe(20000);
    expect(detail?.taxPaise).toBe(1000);
    expect(detail?.totalPaise).toBe(21000);
  });

  it('floor excludes the cancelled order from runningTotal + orderCount', async () => {
    const store = baseStore();
    const repo = createDrizzleTableSessionsRepo(makeFakeDb(store));
    const tables = await repo.floor(CAFE_ID);
    const occupied = tables.find((t) => t.session);
    expect(occupied?.orderCount).toBe(1);
    expect(occupied?.runningTotalPaise).toBe(21000);
  });

  it('settle does not charge or complete the cancelled order', async () => {
    const store = baseStore();
    const repo = createDrizzleTableSessionsRepo(makeFakeDb(store));
    await repo.settle(SESSION_ID, CAFE_ID, 'cash');

    const live = store.orders.find((o) => o.id === 'order-live');
    const cancelled = store.orders.find((o) => o.id === 'order-cancelled');

    // Live order settled.
    expect(live?.status).toBe('completed');
    expect(live?.paymentStatus).toBe('paid');
    expect(live?.paymentMethod).toBe('cash');

    // Cancelled order untouched — still cancelled, never marked paid.
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.paymentStatus).toBe('unpaid');
    expect(cancelled?.paymentMethod).toBeNull();
    expect(cancelled?.paidAt).toBeNull();

    // Session closed.
    const session = store.tableSessions.find((s) => s.id === SESSION_ID);
    expect(session?.status).toBe('closed');
  });
});
