import type { Cafe, InventoryItem } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';
import type { CafesRepository } from '../repositories/cafes.js';
import type {
  InventoryRepository,
  OrderStockLine,
  UpdateInventory,
} from '../repositories/inventory.js';
import { inventoryRoutes } from './inventory.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ITEM_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

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

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    menuItemId: ITEM_ID,
    categoryId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    name: 'Masala Chai',
    isAvailable: true,
    stockQty: 10,
    lowStockThreshold: 3,
    isLow: false,
    isOut: false,
    ...overrides,
  };
}

function createMockInventoryRepo() {
  return {
    list: vi.fn<(cafeId: string) => Promise<InventoryItem[]>>(),
    update:
      vi.fn<
        (
          cafeId: string,
          menuItemId: string,
          patch: UpdateInventory,
        ) => Promise<InventoryItem | null>
      >(),
    restock:
      vi.fn<
        (cafeId: string, menuItemId: string, addQty: number) => Promise<InventoryItem | null>
      >(),
    decrementForOrder: vi.fn<(cafeId: string, lines: OrderStockLine[]) => Promise<void>>(),
  } satisfies InventoryRepository;
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

describe('inventory endpoints', () => {
  let app: FastifyInstance;
  let inventoryRepo: ReturnType<typeof createMockInventoryRepo>;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    inventoryRepo = createMockInventoryRepo();
    await app.register(inventoryRoutes, {
      repository: inventoryRepo,
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
    inventoryRepo.list.mockReset();
    inventoryRepo.update.mockReset();
    inventoryRepo.restock.mockReset();
    inventoryRepo.decrementForOrder.mockReset();
  });

  describe('GET /cafes/:cafeId/inventory', () => {
    it('returns inventory items', async () => {
      inventoryRepo.list.mockResolvedValueOnce([
        makeItem(),
        makeItem({ menuItemId: 'x', isOut: true, stockQty: 0 }),
      ]);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/inventory`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toHaveLength(2);
    });

    it('requires authentication', async () => {
      const res = await app.inject({ method: 'GET', url: `/cafes/${CAFE_ID}/inventory` });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PATCH /cafes/:cafeId/inventory/:menuItemId', () => {
    it('sets stock and threshold', async () => {
      inventoryRepo.update.mockResolvedValueOnce(makeItem({ stockQty: 20, lowStockThreshold: 5 }));
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/inventory/${ITEM_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { stockQty: 20, lowStockThreshold: 5 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().item.stockQty).toBe(20);
      const call = inventoryRepo.update.mock.calls[0];
      expect(call?.[0]).toBe(CAFE_ID);
      expect(call?.[1]).toBe(ITEM_ID);
      expect(call?.[2]).toEqual({ stockQty: 20, lowStockThreshold: 5 });
    });

    it('allows clearing tracking with null', async () => {
      inventoryRepo.update.mockResolvedValueOnce(
        makeItem({ stockQty: null, isLow: false, isOut: false }),
      );
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/inventory/${ITEM_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { stockQty: null },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().item.stockQty).toBeNull();
    });

    it('rejects an empty body (no fields)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/inventory/${ITEM_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a negative stockQty', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/inventory/${ITEM_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { stockQty: -1 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when the menu item is not in the cafe', async () => {
      inventoryRepo.update.mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/inventory/${ITEM_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { stockQty: 5 },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /cafes/:cafeId/inventory/:menuItemId/restock', () => {
    it('increments stock', async () => {
      inventoryRepo.restock.mockResolvedValueOnce(makeItem({ stockQty: 15 }));
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/inventory/${ITEM_ID}/restock`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { addQty: 5 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().item.stockQty).toBe(15);
      expect(inventoryRepo.restock.mock.calls[0]?.[2]).toBe(5);
    });

    it('rejects a non-positive addQty', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/inventory/${ITEM_ID}/restock`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { addQty: 0 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when the menu item is not in the cafe', async () => {
      inventoryRepo.restock.mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/inventory/${ITEM_ID}/restock`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { addQty: 5 },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('cafe ownership', () => {
    it('returns 404 when the cafe is not owned', async () => {
      const notOwnedApp = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
      await notOwnedApp.register(inventoryRoutes, {
        repository: createMockInventoryRepo(),
        cafesRepository: createMockCafesRepo(null),
      });
      await notOwnedApp.ready();

      const res = await notOwnedApp.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/inventory`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
      await notOwnedApp.close();
    });
  });
});
