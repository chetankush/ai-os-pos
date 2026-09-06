import type {
  Cafe,
  MenuCategoryWithItems,
  MenuItem,
  Order,
  OrderItem,
  OrderPayment,
  OrderStatsResponse,
  OrderStatus,
  OrderWithItems,
  PaymentMethod,
} from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';
import type { AuditLogsRepository } from '../repositories/audit-logs.js';
import type { CafesRepository } from '../repositories/cafes.js';
import type { MenuRepository } from '../repositories/menu.js';
import type { NewOrder, OrdersRepository } from '../repositories/orders.js';
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

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: ITEM_ID,
    cafeId: CAFE_ID,
    categoryId: 'cat-1',
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

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: ORDER_ID,
    cafeId: CAFE_ID,
    orderNumber: 'INV/2026-27/000001',
    status: 'pending',
    source: 'counter',
    tableLabel: null,
    tableSessionId: null,
    customerName: null,
    customerPhone: null,
    notes: null,
    subtotalPaise: 30000,
    discountPaise: 0,
    discountReason: null,
    serviceChargePaise: 0,
    packagingChargePaise: 0,
    taxPaise: 1500,
    roundOffPaise: 0,
    totalPaise: 31500,
    gstRateBp: 500,
    paymentMethod: null,
    paymentStatus: 'unpaid',
    providerOrderId: null,
    providerPaymentId: null,
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
    listBySession: vi.fn<(sessionId: string, cafeId: string) => Promise<OrderWithItems[]>>(),
    listKitchenTickets: vi.fn<(cafeId: string) => Promise<OrderWithItems[]>>(),
    findByIdAndCafe: vi.fn<(id: string, cafeId: string) => Promise<OrderWithItems | null>>(),
    updateStatus:
      vi.fn<(id: string, cafeId: string, status: OrderStatus) => Promise<Order | null>>(),
    todayStats: vi.fn<(cafeId: string) => Promise<OrderStatsResponse>>(),
    setPaymentPending:
      vi.fn<(id: string, cafeId: string, providerOrderId: string) => Promise<Order | null>>(),
    markPaid:
      vi.fn<(id: string, cafeId: string, providerPaymentId: string) => Promise<Order | null>>(),
    markPaymentFailed: vi.fn<(id: string, cafeId: string) => Promise<Order | null>>(),
    topItemsToday:
      vi.fn<
        (
          cafeId: string,
          limit: number,
        ) => Promise<{ name: string; qty: number; revenuePaise: number }[]>
      >(),
    itemSalesToday:
      vi.fn<
        (
          cafeId: string,
          name: string,
        ) => Promise<{ name: string; qty: number; revenuePaise: number }>
      >(),
    findByOrderNumber:
      vi.fn<(orderNumber: string, cafeId: string) => Promise<OrderWithItems | null>>(),
    settleWithPayments:
      vi.fn<
        (
          id: string,
          cafeId: string,
          payments: { method: PaymentMethod; amountPaise: number }[],
        ) => Promise<Order | null>
      >(),
    refund:
      vi.fn<
        (
          id: string,
          cafeId: string,
          refund: { method: PaymentMethod; amountPaise: number; reason: string | null },
        ) => Promise<Order | null>
      >(),
    listPayments: vi.fn<(id: string, cafeId: string) => Promise<OrderPayment[]>>(),
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
  let auditRepo: { list: ReturnType<typeof vi.fn>; record: ReturnType<typeof vi.fn> };
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    ordersRepo = createMockOrdersRepo();
    auditRepo = { list: vi.fn(), record: vi.fn() };
    await app.register(ordersRoutes, {
      repository: ordersRepo,
      cafesRepository: createMockCafesRepo(makeCafe()),
      auditRepository: auditRepo as unknown as AuditLogsRepository,
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

    ownerToken = app.jwt.sign(
      { sub: OWNER_ID, email: 'owner@test.in', aud: 'authenticated' },
      { expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    ordersRepo.create.mockReset();
    ordersRepo.listByCafe.mockReset();
    ordersRepo.listKitchenTickets.mockReset();
    ordersRepo.findByIdAndCafe.mockReset();
    ordersRepo.updateStatus.mockReset();
    ordersRepo.todayStats.mockReset();
    ordersRepo.settleWithPayments.mockReset();
    ordersRepo.refund.mockReset();
    ordersRepo.listPayments.mockReset();
    auditRepo.record.mockReset();
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
      // Gapless bill number is assigned by the repo's create() transaction, so
      // the route no longer passes an orderNumber.
      expect(call).not.toHaveProperty('orderNumber');
      // The mock repo returns the canonical INV/{fy}/{seq6} format.
      expect(res.json().order.orderNumber).toMatch(/^INV\/\d{4}-\d{2}\/\d{6}$/);
    });

    it('applies bill-level discount, charges, and round-off', async () => {
      ordersRepo.create.mockResolvedValueOnce(makeOrderWithItems());

      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          items: [{ menuItemId: ITEM_ID, quantity: 2 }], // 30000
          discount: { type: 'percent', value: 10, reason: 'regular' }, // -3000
          serviceChargeBp: 1000, // 10% of 27000 = 2700
          packagingChargePaise: 1000,
          roundOff: true,
        },
      });

      expect(res.statusCode).toBe(201);
      const call = ordersRepo.create.mock.calls[0]?.[0];
      expect(call?.subtotalPaise).toBe(30000);
      expect(call?.discountPaise).toBe(3000);
      expect(call?.discountReason).toBe('regular');
      expect(call?.serviceChargePaise).toBe(2700);
      expect(call?.packagingChargePaise).toBe(1000);
      expect(call?.taxPaise).toBe(1535); // 5% of 30700
      expect(call?.roundOffPaise).toBe(-35);
      expect(call?.totalPaise).toBe(32200);
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
          items: [{ menuItemId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', quantity: 1 }],
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

  // ─── GET /cafes/:cafeId/kitchen/tickets ─────────────────────────────────────

  describe('GET /cafes/:cafeId/kitchen/tickets', () => {
    it('returns active kitchen tickets with items', async () => {
      ordersRepo.listKitchenTickets.mockResolvedValueOnce([
        makeOrderWithItems({ status: 'pending' }),
        makeOrderWithItems({ id: 'cccccccc-cccc-cccc-cccc-cccccccccccd', status: 'preparing' }),
      ]);

      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/kitchen/tickets`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().tickets).toHaveLength(2);
      expect(res.json().tickets[0].items).toHaveLength(1);
      expect(ordersRepo.listKitchenTickets).toHaveBeenCalledWith(CAFE_ID);
    });

    it('returns 404 for a cafe the user does not own', async () => {
      const app2 = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
      const repo = createMockOrdersRepo();
      await app2.register(ordersRoutes, {
        repository: repo,
        cafesRepository: createMockCafesRepo(null),
        menuRepository: createMockMenuRepo([]),
      });
      await app2.ready();

      const res = await app2.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/kitchen/tickets`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
      expect(repo.listKitchenTickets).not.toHaveBeenCalled();
      await app2.close();
    });

    it('requires authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/kitchen/tickets`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /cafes/:cafeId/orders/stats ────────────────────────────────────────

  describe('GET /cafes/:cafeId/orders/stats', () => {
    it('returns today stats', async () => {
      ordersRepo.todayStats.mockResolvedValueOnce({
        todayCount: 7,
        todayRevenuePaise: 250000,
        todayGstPaise: 12500,
        byStatus: {
          pending: 2,
          preparing: 1,
          ready: 1,
          completed: 3,
          cancelled: 0,
        },
        paymentBreakdownPaise: { cash: 150000, upi: 100000, card: 0, online: 0 },
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

    it('records the payment method when completing (ready → completed)', async () => {
      ordersRepo.findByIdAndCafe.mockResolvedValueOnce(makeOrderWithItems({ status: 'ready' }));
      ordersRepo.updateStatus.mockResolvedValueOnce(
        makeOrder({ status: 'completed', paymentMethod: 'upi' }),
      );

      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}/status`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'completed', paymentMethod: 'upi' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().order.paymentMethod).toBe('upi');
      expect(ordersRepo.updateStatus).toHaveBeenCalledWith(ORDER_ID, CAFE_ID, 'completed', 'upi');
    });

    it('rejects an invalid payment method', async () => {
      ordersRepo.findByIdAndCafe.mockResolvedValueOnce(makeOrderWithItems({ status: 'ready' }));
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}/status`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: 'completed', paymentMethod: 'bitcoin' },
      });
      expect(res.statusCode).toBe(400);
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

  // ─── GST mode drives the rate (Sept-2025 reform, not AC) ────────────────────

  describe('GST mode drives the rate', () => {
    async function buildAppForMode(gstMode: Cafe['gstMode']) {
      const app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
      const repo = createMockOrdersRepo();
      await app.register(ordersRoutes, {
        repository: repo,
        cafesRepository: createMockCafesRepo(makeCafe({ gstMode })),
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
      await app.ready();
      return { app, repo };
    }

    it('regular_18 calculates 18% tax', async () => {
      const { app: acApp, repo } = await buildAppForMode('regular_18');
      repo.create.mockResolvedValueOnce(makeOrderWithItems({ gstRateBp: 1800 }));

      await acApp.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { items: [{ menuItemId: ITEM_ID, quantity: 1 }] },
      });

      const call = repo.create.mock.calls[0]?.[0];
      expect(call?.gstRateBp).toBe(1800);
      expect(call?.taxPaise).toBe(2700); // 18% of 15000
      await acApp.close();
    });

    it('composition charges no GST on the bill', async () => {
      const { app: compApp, repo } = await buildAppForMode('composition');
      repo.create.mockResolvedValueOnce(
        makeOrderWithItems({ gstRateBp: 0, taxPaise: 0, totalPaise: 15000 }),
      );

      await compApp.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { items: [{ menuItemId: ITEM_ID, quantity: 1 }] },
      });

      const call = repo.create.mock.calls[0]?.[0];
      expect(call?.gstRateBp).toBe(0);
      expect(call?.taxPaise).toBe(0);
      expect(call?.totalPaise).toBe(15000);
      await compApp.close();
    });

    it('exempt charges no GST on the bill', async () => {
      const { app: exApp, repo } = await buildAppForMode('exempt');
      repo.create.mockResolvedValueOnce(
        makeOrderWithItems({ gstRateBp: 0, taxPaise: 0, totalPaise: 15000 }),
      );

      await exApp.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { items: [{ menuItemId: ITEM_ID, quantity: 1 }] },
      });

      const call = repo.create.mock.calls[0]?.[0];
      expect(call?.gstRateBp).toBe(0);
      expect(call?.taxPaise).toBe(0);
      await exApp.close();
    });
  });

  describe('POST /cafes/:cafeId/orders/:orderId/settle (split tender)', () => {
    it('settles an order with multiple tenders that sum to the total', async () => {
      ordersRepo.findByIdAndCafe.mockResolvedValueOnce(makeOrderWithItems());
      ordersRepo.settleWithPayments.mockResolvedValueOnce(
        makeOrderWithItems({ status: 'completed', paymentStatus: 'paid' }),
      );
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}/settle`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          payments: [
            { method: 'cash', amountPaise: 20000 },
            { method: 'upi', amountPaise: 11500 },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      expect(ordersRepo.settleWithPayments).toHaveBeenCalledWith(ORDER_ID, CAFE_ID, [
        { method: 'cash', amountPaise: 20000 },
        { method: 'upi', amountPaise: 11500 },
      ]);
    });

    it('rejects tenders that do not sum to the bill total (400)', async () => {
      ordersRepo.findByIdAndCafe.mockResolvedValueOnce(makeOrderWithItems());
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}/settle`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { payments: [{ method: 'cash', amountPaise: 100 }] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('AMOUNT_MISMATCH');
    });

    it('rejects settling an already-paid order (409)', async () => {
      ordersRepo.findByIdAndCafe.mockResolvedValueOnce(
        makeOrderWithItems({ paymentStatus: 'paid' }),
      );
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}/settle`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { payments: [{ method: 'cash', amountPaise: 31500 }] },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('ALREADY_PAID');
    });
  });

  describe('POST /cafes/:cafeId/orders/:orderId/refund', () => {
    it('refunds a paid order and records an audit entry', async () => {
      ordersRepo.findByIdAndCafe.mockResolvedValueOnce(
        makeOrderWithItems({ paymentStatus: 'paid', paymentMethod: 'upi' }),
      );
      ordersRepo.refund.mockResolvedValueOnce(makeOrderWithItems({ paymentStatus: 'refunded' }));
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}/refund`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { method: 'upi', amountPaise: 31500, reason: 'spilled' },
      });
      expect(res.statusCode).toBe(200);
      expect(ordersRepo.refund).toHaveBeenCalledWith(ORDER_ID, CAFE_ID, {
        method: 'upi',
        amountPaise: 31500,
        reason: 'spilled',
      });
      expect(auditRepo.record).toHaveBeenCalledTimes(1);
      expect(auditRepo.record.mock.calls[0]?.[0]).toMatchObject({
        action: 'order.refund',
        entityId: ORDER_ID,
      });
    });

    it('rejects refunding an unpaid order (400)', async () => {
      ordersRepo.findByIdAndCafe.mockResolvedValueOnce(makeOrderWithItems());
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}/refund`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { method: 'cash', amountPaise: 100 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('NOT_REFUNDABLE');
      expect(ordersRepo.refund).not.toHaveBeenCalled();
    });
  });

  describe('GET /cafes/:cafeId/orders/:orderId/payments', () => {
    it('returns the tender ledger', async () => {
      ordersRepo.listPayments.mockResolvedValueOnce([
        {
          id: 'p1',
          cafeId: CAFE_ID,
          orderId: ORDER_ID,
          kind: 'payment',
          method: 'cash',
          amountPaise: 20000,
          reason: null,
          createdAt: '2026-05-21T00:00:00.000Z',
        },
      ]);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/orders/${ORDER_ID}/payments`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().payments).toHaveLength(1);
      expect(res.json().payments[0].method).toBe('cash');
    });
  });
});
