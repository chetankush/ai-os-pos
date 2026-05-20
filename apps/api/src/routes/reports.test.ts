import type { Cafe, DayEndReport, SalesRow } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';
import type { CafesRepository } from '../repositories/cafes.js';
import type { ReportsRepository } from '../repositories/reports.js';
import { reportsRoutes } from './reports.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

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

function makeDayEnd(overrides: Partial<DayEndReport> = {}): DayEndReport {
  return {
    date: '2026-05-20',
    grossSalesPaise: 100000,
    netSalesPaise: 95238,
    taxPaise: 4762,
    orderCount: 5,
    completedCount: 4,
    cancelledCount: 1,
    cancelledValuePaise: 31500,
    byPaymentMethod: [
      { method: 'cash', grossPaise: 60000, count: 3 },
      { method: 'upi', grossPaise: 40000, count: 2 },
    ],
    bySource: [
      { source: 'counter', grossPaise: 70000, count: 4 },
      { source: 'qr', grossPaise: 30000, count: 1 },
    ],
    ...overrides,
  };
}

function createMockReportsRepo() {
  return {
    dayEnd: vi.fn<(cafeId: string, date: string) => Promise<DayEndReport>>(),
    sales:
      vi.fn<
        (
          cafeId: string,
          from: string,
          to: string,
          groupBy: 'item' | 'category' | 'hour',
        ) => Promise<SalesRow[]>
      >(),
  } satisfies ReportsRepository;
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

describe('reports endpoints', () => {
  let app: FastifyInstance;
  let reportsRepo: ReturnType<typeof createMockReportsRepo>;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    reportsRepo = createMockReportsRepo();
    await app.register(reportsRoutes, {
      repository: reportsRepo,
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
    reportsRepo.dayEnd.mockReset();
    reportsRepo.sales.mockReset();
  });

  describe('GET /cafes/:cafeId/reports/day-end', () => {
    it('returns the Z-report for an explicit date', async () => {
      reportsRepo.dayEnd.mockResolvedValueOnce(makeDayEnd());
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/reports/day-end?date=2026-05-20`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(reportsRepo.dayEnd).toHaveBeenCalledWith(CAFE_ID, '2026-05-20');
      const body = res.json();
      expect(body.report.grossSalesPaise).toBe(100000);
      expect(body.report.byPaymentMethod).toHaveLength(2);
      expect(body.report.cancelledCount).toBe(1);
    });

    it('defaults to today when no date is given', async () => {
      reportsRepo.dayEnd.mockResolvedValueOnce(makeDayEnd());
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/reports/day-end`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      // Called with a YYYY-MM-DD string (today, in IST).
      const calledDate = reportsRepo.dayEnd.mock.calls[0]?.[1];
      expect(calledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('rejects a malformed date', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/reports/day-end?date=20-05-2026`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(400);
      expect(reportsRepo.dayEnd).not.toHaveBeenCalled();
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/reports/day-end`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /cafes/:cafeId/reports/sales', () => {
    it('returns item-grouped sales for a range', async () => {
      reportsRepo.sales.mockResolvedValueOnce([
        { name: 'Masala Dosa', qty: 12, revenuePaise: 144000 },
        { name: 'Filter Coffee', qty: 20, revenuePaise: 60000 },
      ]);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/reports/sales?from=2026-05-18&to=2026-05-20&groupBy=item`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(reportsRepo.sales).toHaveBeenCalledWith(CAFE_ID, '2026-05-18', '2026-05-20', 'item');
      const body = res.json();
      expect(body.groupBy).toBe('item');
      expect(body.rows).toHaveLength(2);
      expect(body.rows[0].name).toBe('Masala Dosa');
    });

    it('defaults groupBy to item and range to today', async () => {
      reportsRepo.sales.mockResolvedValueOnce([]);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/reports/sales`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const [, from, to, groupBy] = reportsRepo.sales.mock.calls[0] ?? [];
      expect(groupBy).toBe('item');
      expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(from).toBe(to);
    });

    it('supports hour grouping', async () => {
      reportsRepo.sales.mockResolvedValueOnce([{ hour: 13, orderCount: 4, revenuePaise: 50000 }]);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/reports/sales?date=2026-05-20&groupBy=hour&from=2026-05-20&to=2026-05-20`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().rows[0].hour).toBe(13);
    });

    it('rejects an inverted range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/reports/sales?from=2026-05-20&to=2026-05-18`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_RANGE');
      expect(reportsRepo.sales).not.toHaveBeenCalled();
    });

    it('rejects an invalid groupBy', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/reports/sales?groupBy=region`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/reports/sales`,
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
