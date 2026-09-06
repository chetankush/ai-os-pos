import type { Cafe, MenuCategory, MenuItem } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';
import type { CafesRepository } from '../repositories/cafes.js';
import type {
  MenuRepository,
  NewMenuCategory,
  NewMenuItem,
  UpdateMenuItem,
} from '../repositories/menu.js';
import { menuRoutes } from './menu.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';
const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ITEM_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeCafe(): Cafe {
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
  };
}

function makeCategory(overrides: Partial<MenuCategory> = {}): MenuCategory {
  return {
    id: CAT_ID,
    cafeId: CAFE_ID,
    name: 'Beverages',
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

function makeItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: ITEM_ID,
    cafeId: CAFE_ID,
    categoryId: CAT_ID,
    name: 'Cappuccino',
    description: null,
    basePricePaise: 15000,
    hsnCode: null,
    gstRateBpOverride: null,
    imageUrl: null,
    isVegetarian: true,
    isVegan: false,
    containsEgg: false,
    spiceLevel: 0,
    isAvailable: true,
    sortOrder: 0,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

function createMockMenuRepo() {
  return {
    getFullMenu: vi.fn(),
    categoryExists: vi.fn<(categoryId: string, cafeId: string) => Promise<boolean>>(),
    createCategory: vi.fn<(d: NewMenuCategory) => Promise<MenuCategory>>(),
    createItem: vi.fn<(d: NewMenuItem) => Promise<MenuItem>>(),
    updateItem:
      vi.fn<(id: string, cafeId: string, p: UpdateMenuItem) => Promise<MenuItem | null>>(),
    deleteItem: vi.fn<(id: string, cafeId: string) => Promise<boolean>>(),
  } satisfies MenuRepository;
}

function createMockCafesRepo(returnCafe: Cafe | null) {
  return {
    create: vi.fn(),
    listByOwner: vi.fn(),
    findByIdAndOwner: vi.fn().mockResolvedValue(returnCafe),
  } as unknown as CafesRepository;
}

describe('menu endpoints', () => {
  let app: FastifyInstance;
  let menuRepo: ReturnType<typeof createMockMenuRepo>;
  let ownerToken: string;
  let otherToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    menuRepo = createMockMenuRepo();
    await app.register(menuRoutes, {
      repository: menuRepo,
      cafesRepository: createMockCafesRepo(makeCafe()),
    });
    await app.ready();

    ownerToken = app.jwt.sign(
      { sub: OWNER_ID, email: 'owner@test.in', aud: 'authenticated' },
      { expiresIn: '1h' },
    );
    otherToken = app.jwt.sign(
      { sub: OTHER_ID, email: 'other@test.in', aud: 'authenticated' },
      { expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    menuRepo.getFullMenu.mockReset();
    menuRepo.categoryExists.mockReset();
    // Default: the category belongs to the cafe (valid). Tests override to false.
    menuRepo.categoryExists.mockResolvedValue(true);
    menuRepo.createCategory.mockReset();
    menuRepo.createItem.mockReset();
    menuRepo.updateItem.mockReset();
    menuRepo.deleteItem.mockReset();
  });

  // ─── GET /cafes/:cafeId/menu ────────────────────────────────────────────────

  describe('GET /cafes/:cafeId/menu', () => {
    it('returns categories with items grouped', async () => {
      menuRepo.getFullMenu.mockResolvedValueOnce([{ ...makeCategory(), items: [makeItem()] }]);

      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/menu`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.categories).toHaveLength(1);
      expect(body.categories[0].items).toHaveLength(1);
      expect(body.categories[0].items[0].name).toBe('Cappuccino');
    });

    it('requires authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/menu`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects non-uuid cafeId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/cafes/not-a-uuid/menu',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── POST /cafes/:cafeId/menu/categories ────────────────────────────────────

  describe('POST /cafes/:cafeId/menu/categories', () => {
    it('creates a category', async () => {
      menuRepo.createCategory.mockResolvedValueOnce(makeCategory());

      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/categories`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Beverages' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().category.name).toBe('Beverages');
      expect(menuRepo.createCategory).toHaveBeenCalledWith({
        cafeId: CAFE_ID,
        name: 'Beverages',
        sortOrder: 0,
      });
    });

    it('validates name is required', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/categories`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── POST /cafes/:cafeId/menu/items ─────────────────────────────────────────

  describe('POST /cafes/:cafeId/menu/items', () => {
    it('rejects an item whose category does not belong to the cafe', async () => {
      menuRepo.categoryExists.mockResolvedValueOnce(false); // foreign/orphan category

      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/items`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { categoryId: CAT_ID, name: 'Cappuccino', basePricePaise: 15000 },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_CATEGORY');
      expect(menuRepo.createItem).not.toHaveBeenCalled();
    });

    it('creates an item with sensible defaults', async () => {
      menuRepo.createItem.mockResolvedValueOnce(makeItem());

      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/items`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          categoryId: CAT_ID,
          name: 'Cappuccino',
          basePricePaise: 15000,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(menuRepo.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          cafeId: CAFE_ID,
          categoryId: CAT_ID,
          name: 'Cappuccino',
          basePricePaise: 15000,
          isVegetarian: true,
          isVegan: false,
          containsEgg: false,
          spiceLevel: 0,
        }),
      );
    });

    it('persists hsnCode and gstRateBpOverride when provided', async () => {
      menuRepo.createItem.mockResolvedValueOnce(
        makeItem({ hsnCode: '996331', gstRateBpOverride: 1800 }),
      );

      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/items`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          categoryId: CAT_ID,
          name: 'Cappuccino',
          basePricePaise: 15000,
          hsnCode: '996331',
          gstRateBpOverride: 1800,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().item.hsnCode).toBe('996331');
      expect(res.json().item.gstRateBpOverride).toBe(1800);
      expect(menuRepo.createItem).toHaveBeenCalledWith(
        expect.objectContaining({ hsnCode: '996331', gstRateBpOverride: 1800 }),
      );
    });

    it('defaults hsnCode and gstRateBpOverride to null when omitted', async () => {
      menuRepo.createItem.mockResolvedValueOnce(makeItem());

      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/items`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { categoryId: CAT_ID, name: 'Cappuccino', basePricePaise: 15000 },
      });

      expect(res.statusCode).toBe(201);
      expect(menuRepo.createItem).toHaveBeenCalledWith(
        expect.objectContaining({ hsnCode: null, gstRateBpOverride: null }),
      );
    });

    it('rejects a non-digit hsnCode', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/items`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          categoryId: CAT_ID,
          name: 'Cappuccino',
          basePricePaise: 15000,
          hsnCode: 'ABC123',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects an hsnCode longer than 8 chars', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/items`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          categoryId: CAT_ID,
          name: 'Cappuccino',
          basePricePaise: 15000,
          hsnCode: '123456789',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a gstRateBpOverride above 2800', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/items`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          categoryId: CAT_ID,
          name: 'Cappuccino',
          basePricePaise: 15000,
          gstRateBpOverride: 2900,
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects negative prices', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/items`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          categoryId: CAT_ID,
          name: 'Free Item',
          basePricePaise: -1,
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects spice level > 3', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/items`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          categoryId: CAT_ID,
          name: 'Inferno',
          basePricePaise: 100,
          spiceLevel: 5,
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── PATCH /cafes/:cafeId/menu/items/:itemId ────────────────────────────────

  describe('PATCH /cafes/:cafeId/menu/items/:itemId', () => {
    it('updates an item', async () => {
      menuRepo.updateItem.mockResolvedValueOnce(makeItem({ isAvailable: false }));

      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/menu/items/${ITEM_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { isAvailable: false },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().item.isAvailable).toBe(false);
    });

    it('updates hsnCode and gstRateBpOverride', async () => {
      menuRepo.updateItem.mockResolvedValueOnce(
        makeItem({ hsnCode: '996331', gstRateBpOverride: 500 }),
      );

      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/menu/items/${ITEM_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { hsnCode: '996331', gstRateBpOverride: 500 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().item.hsnCode).toBe('996331');
      expect(res.json().item.gstRateBpOverride).toBe(500);
      expect(menuRepo.updateItem).toHaveBeenCalledWith(
        ITEM_ID,
        CAFE_ID,
        expect.objectContaining({ hsnCode: '996331', gstRateBpOverride: 500 }),
      );
    });

    it('clears gstRateBpOverride when set to null', async () => {
      menuRepo.updateItem.mockResolvedValueOnce(makeItem({ gstRateBpOverride: null }));

      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/menu/items/${ITEM_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { gstRateBpOverride: null },
      });

      expect(res.statusCode).toBe(200);
      expect(menuRepo.updateItem).toHaveBeenCalledWith(
        ITEM_ID,
        CAFE_ID,
        expect.objectContaining({ gstRateBpOverride: null }),
      );
    });

    it('returns 404 if item not found', async () => {
      menuRepo.updateItem.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/menu/items/${ITEM_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { isAvailable: false },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ─── DELETE /cafes/:cafeId/menu/items/:itemId ───────────────────────────────

  describe('DELETE /cafes/:cafeId/menu/items/:itemId', () => {
    it('returns 204 on delete', async () => {
      menuRepo.deleteItem.mockResolvedValueOnce(true);

      const res = await app.inject({
        method: 'DELETE',
        url: `/cafes/${CAFE_ID}/menu/items/${ITEM_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(204);
    });

    it('returns 404 if item missing', async () => {
      menuRepo.deleteItem.mockResolvedValueOnce(false);

      const res = await app.inject({
        method: 'DELETE',
        url: `/cafes/${CAFE_ID}/menu/items/${ITEM_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ─── POST /cafes/:cafeId/menu/import ────────────────────────────────────────

  describe('POST /cafes/:cafeId/menu/import', () => {
    it('creates categories + items from a CSV', async () => {
      // No existing categories — every category in the CSV is new.
      menuRepo.getFullMenu.mockResolvedValueOnce([]);
      menuRepo.createCategory
        .mockResolvedValueOnce(makeCategory({ id: 'cat-bev', name: 'Beverages' }))
        .mockResolvedValueOnce(makeCategory({ id: 'cat-main', name: 'Mains' }));
      menuRepo.createItem.mockResolvedValue(makeItem());

      const csv = [
        'category,name,price,veg,spice',
        'Beverages,Tea,40,yes,0',
        'Beverages,Coffee,60,yes,0',
        'Mains,Paneer,280,yes,2',
      ].join('\n');

      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/import`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { csv },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.categoriesCreated).toBe(2);
      expect(body.itemsCreated).toBe(3);
      expect(body.skipped).toBe(0);
      expect(body.errors).toEqual([]);
      expect(menuRepo.createCategory).toHaveBeenCalledTimes(2);
      expect(menuRepo.createItem).toHaveBeenCalledTimes(3);
    });

    it('reuses an existing category by name (case-insensitive) instead of recreating it', async () => {
      menuRepo.getFullMenu.mockResolvedValueOnce([
        { ...makeCategory({ id: 'cat-bev', name: 'Beverages' }), items: [] },
      ]);
      menuRepo.createItem.mockResolvedValue(makeItem());

      const csv = ['category,name,price', 'beverages,Tea,40'].join('\n');

      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/import`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { csv },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.categoriesCreated).toBe(0);
      expect(body.itemsCreated).toBe(1);
      expect(menuRepo.createCategory).not.toHaveBeenCalled();
      expect(menuRepo.createItem).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'cat-bev', name: 'Tea', basePricePaise: 4000 }),
      );
    });

    it('passes parsed prices through as paise and maps veg + spice', async () => {
      menuRepo.getFullMenu.mockResolvedValueOnce([]);
      menuRepo.createCategory.mockResolvedValueOnce(
        makeCategory({ id: 'cat-main', name: 'Mains' }),
      );
      menuRepo.createItem.mockResolvedValue(makeItem());

      const csv = ['category,name,price,veg,spice', 'Mains,Chicken,320.50,no,3'].join('\n');

      await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/import`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { csv },
      });

      expect(menuRepo.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          basePricePaise: 32050,
          isVegetarian: false,
          spiceLevel: 3,
        }),
      );
    });

    it('returns parse errors and creates nothing when the CSV is malformed', async () => {
      const csv = ['name,price', 'Tea,40'].join('\n'); // missing category column

      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/import`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { csv },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.itemsCreated).toBe(0);
      expect(body.categoriesCreated).toBe(0);
      expect(body.errors.length).toBeGreaterThan(0);
      expect(menuRepo.createItem).not.toHaveBeenCalled();
    });

    it('imports good rows and reports bad ones as skipped', async () => {
      menuRepo.getFullMenu.mockResolvedValueOnce([]);
      menuRepo.createCategory.mockResolvedValueOnce(
        makeCategory({ id: 'cat-bev', name: 'Beverages' }),
      );
      menuRepo.createItem.mockResolvedValue(makeItem());

      const csv = ['category,name,price', 'Beverages,Tea,40', 'Beverages,Bad,abc'].join('\n');

      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/import`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { csv },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.itemsCreated).toBe(1);
      expect(body.skipped).toBe(1);
      expect(body.errors).toHaveLength(1);
    });

    it('rejects a missing csv body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/menu/import`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── Cafe ownership enforcement ─────────────────────────────────────────────

  describe('cafe ownership', () => {
    let appWithMissingCafe: FastifyInstance;

    beforeAll(async () => {
      appWithMissingCafe = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
      await appWithMissingCafe.register(menuRoutes, {
        repository: createMockMenuRepo(),
        cafesRepository: createMockCafesRepo(null),
      });
      await appWithMissingCafe.ready();
    });

    afterAll(async () => {
      await appWithMissingCafe.close();
    });

    it('returns 404 when the cafe is not owned by the user', async () => {
      const res = await appWithMissingCafe.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/menu`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
