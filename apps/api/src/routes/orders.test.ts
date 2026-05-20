import type {
  Cafe,
  MenuCategoryWithItems,
  MenuItem,
  Order,
  OrderItem,
  OrderStatsResponse,
  OrderStatus,
  OrderWithItems,
} from '@mehfil/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CafesRepository } from '../repositories/cafes.js';
import type { MenuRepository } from '../repositories/menu.js';
import type { NewOrder, OrdersRepository } from '../repositories/orders.js';
import { buildTestApp } from '../../test/helpers.js';
import { ordersRoutes } from './orders.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORDER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ITEM_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ITEM_ID_UNAVAIL = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

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
    primaryColor: null,
    logoUrl: null,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: ITEM_ID,
    cafeId: CAFE_ID,
    categoryId: 'cat-1',
    name: 'Cappuccino',
    description: null,
    basePricePaise: 15000,
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

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: ORDER_ID,
    cafeId: CAFE_ID,
    orderNumber: 'M-AAA111',
    status: 'pending',
    source: 'counter',
    tableLabel: null,
    customerName: null,
    customerPhone: null,
    notes: null,
    subtotalPaise: 30000,
    taxPaise: 1500,
    totalPaise: 31500,
    gstRateBp: 500,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    paidAt: null,
    ...overrides,
  };
}

function makeOrderWithItems(overrides: Partial<OrderWithItems> = {}): OrderWithItems {
  const sampleItem: OrderItem = {
    id: 'oi-1',
    orderId: ORDER_ID,
    menuItemId: ITEM_ID,
    itemNameSnapshot: 'Cappuccino',
    unitPricePaise: 15000,
    quantity: 2,
    lineTotalPaise: 30000,
    notes: null,
  };
  return {
    ...makeOrder(),
    items: [sampleItem],
    ...overrides,
  };
}

function createMockOrdersRepo() {
  return {
    create: vi.fn<(d: NewOrder) => Promise<OrderWithItems>>(),
    listByCafe: vi.fn<(cafeId: string, limit?: number) => Promise<Order[]>>(),
    findByIdAndCafe: vi.fn<(id: string, cafeId: string) => Promise<OrderWithItems | null>>(),
    updateStatus: vi.fn<(id: string, cafeId: string, status: OrderStatus) => Promise<Order | null>>(),
    todayStats: vi.fn<(cafeId: string) => Promise<OrderStatsResponse>>(),
  } satisfies OrdersRepository;
}

function createMockCafesRepo(cafe: Cafe | null): CafesRepository {
  return {
    create: vi.fn(),
    listByOwner: vi.fn(),
    findByIdAndOwner: vi.fn().mockResolvedValue(cafe),
  } as unknown as CafesRepository;
}

function createMockMenuRepo(menu: MenuCategoryWithItems[]): MenuRepository {
  return {
    getFullMenu: vi.fn().mockResolvedValue(menu),
    createCategory: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
  } as unknown as MenuRepository;
}

describe('orders endpoints', () => {
  let app: FastifyInstance;
  let ordersRepo: ReturnType<typeof createMockOrdersRepo>;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    ordersRepo = createMockOrdersRepo();
    await app.register(ordersRoutes, {
      repository: ordersRepo,
      cafesRepository: createMockCafesRepo(makeCafe()),
      menuRepository: createMockMenuRepo([
        {
          id: 'cat-1',
          cafeId: CAFE_ID,
          name: 'Beverages',
          sortOrder: 0,
          isActive: true,
          createdAt: '2026-05-20T00:00:00.000Z',
          updatedAt: '2026-05-20T00:00:00.000Z',
          items: [
            makeMenuItem(),
            makeMenuItem({ id: ITEM_ID_UNAVAIL, name: 'OOS Tea', isAvailable: false }),
          ],
        },
      ]),
    });
    await app.ready();

    ownerToken = app.jwt.sign({ sub: OWNER_ID, email: 'owner@test.in', aud: 'authenticated' }, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    ordersRepo.create.mockReset();
    ordersRepo.listByCafe.mockReset();
    ordersRepo.findByIdAndCafe.mockReset();
    ordersRepo.updateStatus.mockReset();
    ordersRepo.todayStats.mockReset();
  });

  // ─── POST /cafes/:cafeId/orders ─────────────────────────────────────────────

  describe('POST /cafes/:cafeId/orders', () => {
    it('creates an order with calculated subtotal/tax/total (5% non-AC)', async () => {
      ordersRepo.create.mockResolvedValueOnce(makeOrderWithItems());

      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          items: [{ menuItemId: ITEM_ID, quantity: 2 }],
        },
      });

      expect(res.statusCode).toBe(201);
      const call = ordersRepo.create.mock.calls[0]?.[0];
      expect(call?.subtotalPaise).toBe(30000); // 2 * 15000
      expect(call?.gstRateBp).toBe(500);
      expect(call?.taxPaise).toBe(1500); // 5% of 30000
      expect(call?.totalPaise).toBe(31500);
      expect(call?.items[0]?.itemNameSnapshot).toBe('Cappuccino');
      expect(call?.orderNumber).toMatch(/^M-[A-Z0-9]{6}$/);
    });

    it('rejects empty items array', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { items: [] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects unknown menu item', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          items: [
            { menuItemId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', quantity: 1 },
          ],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_ITEM');
    });

    it('rejects unavailable item', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { items: [{ menuItemId: ITEM_ID_UNAVAIL, quantity: 1 }] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('ITEM_UNAVAILABLE');
    });

    it('requires authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders`,
        payload: { items: [{ menuItemId: ITEM_ID, quantity: 1 }] },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /cafes/:cafeId/orders ──────────────────────────────────────────────

  describe('GET /cafes/:cafeId/orders', () => {
    it('returns a list of orders', async () => {
      ordersRepo.listByCafe.mockResolvedValueOnce([makeOrder()]);

      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/orders`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().orders).toHaveLength(1);
    });
  });

  // ─── GET /cafes/:cafeId/orders/stats ────────────────────────────────────────

  describe('GET /cafes/:cafeId/orders/stats', () => {
    it('returns today stats', async () => {
      ordersRepo.todayStats.mockResolvedValueOnce({
        todayCount: 7,
        todayRevenuePaise: 250000,
        byStatus: {
          pending: 2,
          preparing: 1,
          ready: 1,
          completed: 3,
          cancelled: 0,
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/orders/stats`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().todayCount).toBe(7);
      expect(res.json().todayRevenuePaise).toBe(250000);
    });
  });

  // ─── GET /cafes/:cafeId/orders/:orderId ─────────────────────────────────────

  describe('GET /cafes/:cafeId/orders/:orderId', () => {
    it('returns 404 when order missing', async () => {
      ordersRepo.findByIdAndCafe.mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns order with items', async () => {
      ordersRepo.findByIdAndCafe.mockResolvedValueOnce(makeOrderWithItems());
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().order.items).toHaveLength(1);
    });
  });

  // ─── PATCH /cafes/:cafeId/orders/:orderId/status ────────────────────────────

  describe('PATCH /cafes/:cafeId/orders/:orderId/status', () => {
    it('transitions pending → preparing', async () => {
      ordersRepo.findByIdAndCafe.mockResolvedValueOnce(makeOrderWithItems({ status: 'pending' }));
      ordersRepo.updateStatus.mockResolvedValueOnce(makeOrder({ status: 'preparing' }));

      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}/status`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'preparing' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().order.status).toBe('preparing');
    });

    it('rejects pending → completed (must go through preparing/ready)', async () => {
      ordersRepo.findByIdAndCafe.mockResolvedValueOnce(makeOrderWithItems({ status: 'pending' }));

      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}/status`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'completed' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_TRANSITION');
    });

    it('allows cancel from preparing', async () => {
      ordersRepo.findByIdAndCafe.mockResolvedValueOnce(makeOrderWithItems({ status: 'preparing' }));
      ordersRepo.updateStatus.mockResolvedValueOnce(makeOrder({ status: 'cancelled' }));

      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}/status`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'cancelled' },
      });

      expect(res.statusCode).toBe(200);
    });

    it('blocks transitions from completed', async () => {
      ordersRepo.findByIdAndCafe.mockResolvedValueOnce(makeOrderWithItems({ status: 'completed' }));

      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}/status`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'preparing' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ─── 18% GST for AC cafe ────────────────────────────────────────────────────

  describe('AC cafe uses 18% GST', () => {
    let acApp: FastifyInstance;
    let acRepo: ReturnType<typeof createMockOrdersRepo>;

    beforeAll(async () => {
      acApp = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
      acRepo = createMockOrdersRepo();
      await acApp.register(ordersRoutes, {
        repository: acRepo,
        cafesRepository: createMockCafesRepo(makeCafe({ isAirConditioned: true })),
        menuRepository: createMockMenuRepo([
          {
            id: 'cat-1',
            cafeId: CAFE_ID,
            name: 'B',
            sortOrder: 0,
            isActive: true,
            createdAt: '2026-05-20T00:00:00.000Z',
            updatedAt: '2026-05-20T00:00:00.000Z',
            items: [makeMenuItem()],
          },
        ]),
      });
      await acApp.ready();
    });

    afterAll(async () => {
      await acApp.close();
    });

    it('calculates 18% tax', async () => {
      acRepo.create.mockResolvedValueOnce(makeOrderWithItems({ gstRateBp: 1800 }));

      await acApp.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { items: [{ menuItemId: ITEM_ID, quantity: 1 }] },
      });

      const call = acRepo.create.mock.calls[0]?.[0];
      expect(call?.gstRateBp).toBe(1800);
      expect(call?.taxPaise).toBe(2700); // 18% of 15000
    });
  });
});
