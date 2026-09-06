import type { Cafe, Customer, Order } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';
import type { CafesRepository } from '../repositories/cafes.js';
import type { CustomersRepository } from '../repositories/customers.js';
import { customersRoutes } from './customers.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CUSTOMER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

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

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: CUSTOMER_ID,
    cafeId: CAFE_ID,
    phone: '9990001111',
    name: 'Asha',
    totalOrders: 3,
    totalSpentPaise: 45000,
    lastOrderAt: '2026-05-28T00:00:00.000Z',
    createdAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'oooooooo-oooo-oooo-oooo-oooooooooooo',
    cafeId: CAFE_ID,
    orderNumber: 'SNG/2526/0001',
    status: 'completed',
    source: 'counter',
    tableLabel: null,
    tableSessionId: null,
    customerName: 'Asha',
    customerPhone: '9990001111',
    notes: null,
    subtotalPaise: 15000,
    discountPaise: 0,
    discountReason: null,
    serviceChargePaise: 0,
    packagingChargePaise: 0,
    taxPaise: 750,
    roundOffPaise: 0,
    totalPaise: 15750,
    gstRateBp: 500,
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    providerOrderId: null,
    providerPaymentId: null,
    createdAt: '2026-05-28T00:00:00.000Z',
    updatedAt: '2026-05-28T00:00:00.000Z',
    paidAt: '2026-05-28T00:00:00.000Z',
    ...overrides,
  };
}

function createMockCustomersRepo() {
  return {
    listByCafe: vi.fn(),
    findByIdAndCafe: vi.fn(),
    recentOrdersByPhone: vi.fn(),
    upsertFromOrder: vi.fn(),
  } satisfies CustomersRepository;
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

describe('customers endpoints', () => {
  let app: FastifyInstance;
  let customersRepo: ReturnType<typeof createMockCustomersRepo>;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    customersRepo = createMockCustomersRepo();
    await app.register(customersRoutes, {
      repository: customersRepo,
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
    for (const fn of Object.values(customersRepo)) (fn as ReturnType<typeof vi.fn>).mockReset();
  });

  describe('GET /cafes/:cafeId/customers', () => {
    it('returns customers for the cafe', async () => {
      customersRepo.listByCafe.mockResolvedValueOnce([makeCustomer()]);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/customers`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().customers).toHaveLength(1);
      expect(res.json().customers[0].id).toBe(CUSTOMER_ID);
      expect(customersRepo.listByCafe).toHaveBeenCalledWith(CAFE_ID, undefined);
    });

    it('passes the search term through', async () => {
      customersRepo.listByCafe.mockResolvedValueOnce([]);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/customers?search=asha`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(customersRepo.listByCafe).toHaveBeenCalledWith(CAFE_ID, 'asha');
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: `/cafes/${CAFE_ID}/customers` });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /cafes/:cafeId/customers/:id', () => {
    it('returns the customer and their recent orders', async () => {
      customersRepo.findByIdAndCafe.mockResolvedValueOnce(makeCustomer());
      customersRepo.recentOrdersByPhone.mockResolvedValueOnce([makeOrder()]);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/customers/${CUSTOMER_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().customer.id).toBe(CUSTOMER_ID);
      expect(res.json().orders).toHaveLength(1);
      expect(customersRepo.recentOrdersByPhone).toHaveBeenCalledWith(CAFE_ID, '9990001111');
    });

    it('returns 404 when the customer is missing', async () => {
      customersRepo.findByIdAndCafe.mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/customers/${CUSTOMER_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
      expect(customersRepo.recentOrdersByPhone).not.toHaveBeenCalled();
    });
  });

  describe('cafe ownership', () => {
    it('returns 404 when the caller does not own the cafe', async () => {
      const otherApp = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
      await otherApp.register(customersRoutes, {
        repository: createMockCustomersRepo(),
        cafesRepository: createMockCafesRepo(null),
      });
      await otherApp.ready();
      const token = otherApp.jwt.sign(
        { sub: OWNER_ID, email: 'owner@test.in', aud: 'authenticated' },
        { expiresIn: '1h' },
      );
      const res = await otherApp.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/customers`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      await otherApp.close();
    });
  });
});
