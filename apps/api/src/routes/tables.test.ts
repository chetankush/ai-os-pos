import type { Cafe, RestaurantTable } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';
import type { CafesRepository } from '../repositories/cafes.js';
import type { NewTable, TablesRepository, UpdateTable } from '../repositories/tables.js';
import { tablesRoutes } from './tables.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TABLE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

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

function makeTable(overrides: Partial<RestaurantTable> = {}): RestaurantTable {
  return {
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
    ...overrides,
  };
}

function createMockTablesRepo() {
  return {
    list: vi.fn<(cafeId: string) => Promise<RestaurantTable[]>>(),
    create: vi.fn<(cafeId: string, data: NewTable) => Promise<RestaurantTable>>(),
    findByIdAndCafe: vi.fn<(id: string, cafeId: string) => Promise<RestaurantTable | null>>(),
    update:
      vi.fn<(id: string, cafeId: string, patch: UpdateTable) => Promise<RestaurantTable | null>>(),
    delete: vi.fn<(id: string, cafeId: string) => Promise<boolean>>(),
  } satisfies TablesRepository;
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

describe('tables endpoints', () => {
  let app: FastifyInstance;
  let tablesRepo: ReturnType<typeof createMockTablesRepo>;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    tablesRepo = createMockTablesRepo();
    await app.register(tablesRoutes, {
      repository: tablesRepo,
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
    tablesRepo.list.mockReset();
    tablesRepo.create.mockReset();
    tablesRepo.findByIdAndCafe.mockReset();
    tablesRepo.update.mockReset();
    tablesRepo.delete.mockReset();
  });

  describe('GET /cafes/:cafeId/tables', () => {
    it('returns the cafe tables', async () => {
      tablesRepo.list.mockResolvedValueOnce([makeTable()]);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/tables`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().tables).toHaveLength(1);
    });

    it('requires authentication', async () => {
      const res = await app.inject({ method: 'GET', url: `/cafes/${CAFE_ID}/tables` });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /cafes/:cafeId/tables', () => {
    it('creates a table', async () => {
      tablesRepo.create.mockResolvedValueOnce(makeTable({ label: 'T9', seats: 6 }));
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/tables`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { label: 'T9', seats: 6, shape: 'round' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().table.label).toBe('T9');
      const call = tablesRepo.create.mock.calls[0];
      expect(call?.[0]).toBe(CAFE_ID);
      expect(call?.[1].label).toBe('T9');
    });

    it('returns 409 TABLE_LABEL_TAKEN on duplicate label', async () => {
      tablesRepo.create.mockRejectedValueOnce({ code: '23505' });
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/tables`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { label: 'T1' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('TABLE_LABEL_TAKEN');
    });

    it('rejects a missing label', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/tables`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { seats: 4 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /cafes/:cafeId/tables/:tableId', () => {
    it('updates a table', async () => {
      tablesRepo.update.mockResolvedValueOnce(makeTable({ x: 100, y: 200 }));
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/tables/${TABLE_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { x: 100, y: 200 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().table.x).toBe(100);
    });

    it('returns 404 when not found', async () => {
      tablesRepo.update.mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/tables/${TABLE_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { seats: 8 },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /cafes/:cafeId/tables/:tableId', () => {
    it('deletes a table (204)', async () => {
      tablesRepo.delete.mockResolvedValueOnce(true);
      const res = await app.inject({
        method: 'DELETE',
        url: `/cafes/${CAFE_ID}/tables/${TABLE_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when the table does not exist', async () => {
      tablesRepo.delete.mockResolvedValueOnce(false);
      const res = await app.inject({
        method: 'DELETE',
        url: `/cafes/${CAFE_ID}/tables/${TABLE_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('cafe ownership', () => {
    it('returns 404 when the cafe is not owned', async () => {
      const notOwnedApp = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
      await notOwnedApp.register(tablesRoutes, {
        repository: createMockTablesRepo(),
        cafesRepository: createMockCafesRepo(null),
      });
      await notOwnedApp.ready();

      const res = await notOwnedApp.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/tables`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
      await notOwnedApp.close();
    });
  });
});
