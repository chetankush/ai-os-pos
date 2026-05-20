import type { Cafe, Order, OrderItem, OrderWithItems } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CafesRepository } from '../repositories/cafes.js';
import type { OrdersRepository } from '../repositories/orders.js';
import { buildTestApp } from '../../test/helpers.js';
import { publicRoutes } from './public.js';

const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORDER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SLUG = 'test-cafe';

function makeCafe(overrides: Partial<Cafe> = {}): Cafe {
  return {
    id: CAFE_ID,
    ownerId: '11111111-1111-1111-1111-111111111111',
    name: 'Test Cafe',
    slug: SLUG,
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
    onlinePaymentEnabled: true,
    qrPrepaidRequired: false,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: ORDER_ID,
    cafeId: CAFE_ID,
    orderNumber: 'S-AAA111',
    status: 'pending',
    source: 'qr',
    tableLabel: 'T1',
    customerName: 'Secret Diner',
    customerPhone: '+919999999999',
    notes: null,
    subtotalPaise: 30000,
    taxPaise: 1500,
    totalPaise: 31500,
    gstRateBp: 500,
    paymentMethod: null,
    paymentStatus: 'unpaid',
    providerOrderId: null,
    providerPaymentId: 'pay_secret',
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    paidAt: null,
    ...overrides,
  };
}

function makeOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    orderId: ORDER_ID,
    menuItemId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    itemNameSnapshot: 'Masala Chai',
    unitPricePaise: 15000,
    quantity: 2,
    lineTotalPaise: 30000,
    notes: null,
    ...overrides,
  };
}

function makeOrderWithItems(overrides: Partial<OrderWithItems> = {}): OrderWithItems {
  return { ...makeOrder(), items: [makeOrderItem()], ...overrides };
}

function createMockCafesRepo(cafe: Cafe | null): CafesRepository {
  return {
    create: vi.fn(),
    listByOwner: vi.fn(),
    findByIdAndOwner: vi.fn(),
    findBySlug: vi.fn().mockResolvedValue(cafe),
    update: vi.fn(),
  } satisfies CafesRepository;
}

function createMockOrdersRepo() {
  return {
    create: vi.fn(),
    listByCafe: vi.fn(),
    findByIdAndCafe: vi.fn(),
    updateStatus: vi.fn(),
    todayStats: vi.fn(),
    setPaymentPending: vi.fn(),
    markPaid: vi.fn(),
    markPaymentFailed: vi.fn(),
    topItemsToday: vi.fn(),
    itemSalesToday: vi.fn(),
    findByOrderNumber: vi.fn(),
  } satisfies OrdersRepository;
}

async function buildPublicApp(opts: {
  cafe?: Cafe | null;
  ordersRepo: ReturnType<typeof createMockOrdersRepo>;
}): Promise<FastifyInstance> {
  const app = await buildTestApp({});
  await app.register(publicRoutes, {
    cafesRepository: createMockCafesRepo(opts.cafe === undefined ? makeCafe() : opts.cafe),
    ordersRepository: opts.ordersRepo,
  });
  await app.ready();
  return app;
}

describe('GET /public/cafes/:slug/orders/:orderId', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns the diner-safe order detail with items (happy path)', async () => {
    const ordersRepo = createMockOrdersRepo();
    ordersRepo.findByIdAndCafe.mockResolvedValue(makeOrderWithItems());
    app = await buildPublicApp({ ordersRepo });

    const res = await app.inject({
      method: 'GET',
      url: `/public/cafes/${SLUG}/orders/${ORDER_ID}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      order: {
        id: ORDER_ID,
        orderNumber: 'S-AAA111',
        status: 'pending',
        paymentStatus: 'unpaid',
        totalPaise: 31500,
        tableLabel: 'T1',
        items: [{ name: 'Masala Chai', quantity: 2 }],
        createdAt: '2026-05-20T00:00:00.000Z',
      },
    });
    expect(ordersRepo.findByIdAndCafe).toHaveBeenCalledWith(ORDER_ID, CAFE_ID);
    // Never leak owner-only PII / provider ids to the diner.
    const order = res.json().order;
    expect(order).not.toHaveProperty('customerName');
    expect(order).not.toHaveProperty('customerPhone');
    expect(order).not.toHaveProperty('providerPaymentId');
  });

  it('returns 404 when cafe not found', async () => {
    const ordersRepo = createMockOrdersRepo();
    app = await buildPublicApp({ cafe: null, ordersRepo });

    const res = await app.inject({
      method: 'GET',
      url: `/public/cafes/${SLUG}/orders/${ORDER_ID}`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    expect(ordersRepo.findByIdAndCafe).not.toHaveBeenCalled();
  });

  it('returns 404 when order not found', async () => {
    const ordersRepo = createMockOrdersRepo();
    ordersRepo.findByIdAndCafe.mockResolvedValue(null);
    app = await buildPublicApp({ ordersRepo });

    const res = await app.inject({
      method: 'GET',
      url: `/public/cafes/${SLUG}/orders/${ORDER_ID}`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
