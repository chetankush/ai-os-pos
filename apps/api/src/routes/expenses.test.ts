import type { Cafe, Expense, ExpenseCategoryTotal } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';
import type { CafesRepository } from '../repositories/cafes.js';
import type { ExpensesRepository } from '../repositories/expenses.js';
import { expensesRoutes } from './expenses.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EXPENSE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

function makeCafe(overrides: Partial<Cafe> = {}): Cafe {
  return {
    id: CAFE_ID,
    ownerId: OWNER_ID,
    name: 'Test Cafe',
    slug: 'test-cafe',
    gstin: null,
    fssai: null,
    addressLine1: 'A',
    addressLine2: null,
    city: 'Noida',
    state: 'UP',
    pincode: '201301',
    isAirConditioned: false,
    gstMode: 'regular_5',
    primaryColor: null,
    logoUrl: null,
    onlinePaymentEnabled: false,
    qrPrepaidRequired: false,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: EXPENSE_ID,
    cafeId: CAFE_ID,
    category: 'supplies',
    amountPaise: 150000,
    note: 'Milk + sugar',
    incurredOn: '2026-05-20',
    createdAt: '2026-05-20T06:00:00.000Z',
    ...overrides,
  };
}

function createMockExpensesRepo() {
  return {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    summary: vi.fn(),
  } satisfies ExpensesRepository;
}

function createMockCafesRepo(cafe: Cafe | null): CafesRepository {
  return {
    create: vi.fn(),
    listByOwner: vi.fn(),
    findByIdAndOwner: vi.fn().mockResolvedValue(cafe),
    findBySlug: vi.fn(),
    update: vi.fn(),
  } satisfies CafesRepository;
}

describe('expenses endpoints', () => {
  let app: FastifyInstance;
  let repo: ReturnType<typeof createMockExpensesRepo>;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    repo = createMockExpensesRepo();
    await app.register(expensesRoutes, {
      repository: repo,
      cafesRepository: createMockCafesRepo(makeCafe()),
    });
    await app.ready();
    ownerToken = app.jwt.sign(
      { sub: OWNER_ID, email: 'owner@test.in', aud: 'authenticated' },
      { expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    repo.list.mockReset();
    repo.create.mockReset();
    repo.update.mockReset();
    repo.remove.mockReset();
    repo.summary.mockReset();
  });

  describe('GET /cafes/:cafeId/expenses', () => {
    it('lists expenses within a date range', async () => {
      repo.list.mockResolvedValueOnce([makeExpense()]);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/expenses?from=2026-05-01&to=2026-05-31`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().expenses).toHaveLength(1);
      expect(res.json().from).toBe('2026-05-01');
      expect(res.json().to).toBe('2026-05-31');
      expect(repo.list).toHaveBeenCalledWith(CAFE_ID, '2026-05-01', '2026-05-31');
    });

    it('rejects from after to', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/expenses?from=2026-05-31&to=2026-05-01`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_RANGE');
    });

    it('rejects a malformed date', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/expenses?from=2026-13-40`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: `/cafes/${CAFE_ID}/expenses` });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /cafes/:cafeId/expenses', () => {
    it('creates an expense', async () => {
      repo.create.mockResolvedValueOnce(makeExpense());
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/expenses`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          category: 'supplies',
          amountPaise: 150000,
          note: 'Milk + sugar',
          incurredOn: '2026-05-20',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().expense.id).toBe(EXPENSE_ID);
      expect(repo.create).toHaveBeenCalledWith(CAFE_ID, {
        category: 'supplies',
        amountPaise: 150000,
        note: 'Milk + sugar',
        incurredOn: '2026-05-20',
      });
    });

    it('rejects an invalid category', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/expenses`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { category: 'bribe', amountPaise: 1000, incurredOn: '2026-05-20' },
      });
      expect(res.statusCode).toBe(400);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects a non-positive amount', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/expenses`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { category: 'rent', amountPaise: 0, incurredOn: '2026-05-20' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a missing date', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/expenses`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { category: 'rent', amountPaise: 1000 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /cafes/:cafeId/expenses/:id', () => {
    it('updates an expense', async () => {
      repo.update.mockResolvedValueOnce(makeExpense({ amountPaise: 200000 }));
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/expenses/${EXPENSE_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { amountPaise: 200000 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().expense.amountPaise).toBe(200000);
      expect(repo.update).toHaveBeenCalledWith(CAFE_ID, EXPENSE_ID, { amountPaise: 200000 });
    });

    it('returns 404 when the expense does not exist', async () => {
      repo.update.mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/expenses/${EXPENSE_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { amountPaise: 200000 },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects an empty patch body', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/expenses/${EXPENSE_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /cafes/:cafeId/expenses/:id', () => {
    it('deletes an expense', async () => {
      repo.remove.mockResolvedValueOnce(true);
      const res = await app.inject({
        method: 'DELETE',
        url: `/cafes/${CAFE_ID}/expenses/${EXPENSE_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when the expense does not exist', async () => {
      repo.remove.mockResolvedValueOnce(false);
      const res = await app.inject({
        method: 'DELETE',
        url: `/cafes/${CAFE_ID}/expenses/${EXPENSE_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /cafes/:cafeId/expenses/summary', () => {
    it('returns totals by category and grand total', async () => {
      const byCategory: ExpenseCategoryTotal[] = [
        { category: 'rent', totalPaise: 5000000 },
        { category: 'supplies', totalPaise: 150000 },
      ];
      repo.summary.mockResolvedValueOnce(byCategory);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/expenses/summary?from=2026-05-01&to=2026-05-31`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().byCategory).toHaveLength(2);
      expect(res.json().grandTotalPaise).toBe(5150000);
      expect(res.json().from).toBe('2026-05-01');
    });
  });

  describe('cafe ownership', () => {
    it('returns 404 when the caller does not own the cafe', async () => {
      const otherApp = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
      await otherApp.register(expensesRoutes, {
        repository: createMockExpensesRepo(),
        cafesRepository: createMockCafesRepo(null),
      });
      await otherApp.ready();
      const token = otherApp.jwt.sign(
        { sub: OWNER_ID, email: 'owner@test.in', aud: 'authenticated' },
        { expiresIn: '1h' },
      );
      const res = await otherApp.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/expenses`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      await otherApp.close();
    });
  });
});
