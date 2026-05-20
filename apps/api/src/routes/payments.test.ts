import type { Cafe, Order, OrderWithItems } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentProvider } from '../payments/razorpay.js';
import type { CafesRepository } from '../repositories/cafes.js';
import type { OrdersRepository } from '../repositories/orders.js';
import { buildTestApp } from '../../test/helpers.js';
import { paymentsRoutes } from './payments.js';

const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORDER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SLUG = 'test-cafe';
const PROVIDER_ORDER_ID = 'order_test123';

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
    gstMode: 'regular_5',
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
    tableSessionId: null,
    customerName: null,
    customerPhone: null,
    notes: null,
    subtotalPaise: 30000,
    taxPaise: 1500,
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
  return { ...makeOrder(), items: [], ...overrides };
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
    listBySession: vi.fn(),
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

function createStubProvider(verifyResult = true): PaymentProvider & {
  createOrder: ReturnType<typeof vi.fn>;
  verifySignature: ReturnType<typeof vi.fn>;
} {
  return {
    createOrder: vi.fn(async (input: { amountPaise: number; currency?: string }) => ({
      id: PROVIDER_ORDER_ID,
      amount: input.amountPaise,
      currency: input.currency ?? 'INR',
    })),
    verifySignature: vi.fn(() => verifyResult),
  };
}

async function buildPaymentsApp(opts: {
  cafe?: Cafe | null;
  ordersRepo: ReturnType<typeof createMockOrdersRepo>;
  provider?: PaymentProvider;
  withKeys?: boolean;
}): Promise<FastifyInstance> {
  const app = await buildTestApp(
    opts.withKeys === false
      ? {}
      : { RAZORPAY_KEY_ID: 'rzp_test_keyid', RAZORPAY_KEY_SECRET: 'rzp_test_secret' },
  );
  await app.register(paymentsRoutes, {
    cafesRepository: createMockCafesRepo(opts.cafe === undefined ? makeCafe() : opts.cafe),
    ordersRepository: opts.ordersRepo,
    paymentProvider: opts.provider,
  });
  await app.ready();
  return app;
}

describe('payments endpoints', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  // ─── POST /public/cafes/:slug/orders/:orderId/payment ────────────────────────

  describe('POST /public/cafes/:slug/orders/:orderId/payment', () => {
    it('creates a provider order and returns checkout fields (happy path)', async () => {
      const ordersRepo = createMockOrdersRepo();
      const order = makeOrder();
      ordersRepo.findByIdAndCafe.mockResolvedValue(makeOrderWithItems());
      ordersRepo.setPaymentPending.mockResolvedValue(
        makeOrder({ paymentStatus: 'pending', providerOrderId: PROVIDER_ORDER_ID }),
      );
      const provider = createStubProvider();
      app = await buildPaymentsApp({ ordersRepo, provider });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        keyId: 'rzp_test_keyid',
        providerOrderId: PROVIDER_ORDER_ID,
        amountPaise: order.totalPaise,
        currency: 'INR',
        orderId: ORDER_ID,
      });
      // Never trusts a client amount — charges the DB total.
      expect(provider.createOrder).toHaveBeenCalledWith({
        amountPaise: order.totalPaise,
        currency: 'INR',
        receipt: order.orderNumber,
        notes: { sangamOrderId: order.id },
      });
      expect(ordersRepo.setPaymentPending).toHaveBeenCalledWith(
        ORDER_ID,
        CAFE_ID,
        PROVIDER_ORDER_ID,
      );
    });

    it('returns 404 when cafe not found', async () => {
      const ordersRepo = createMockOrdersRepo();
      app = await buildPaymentsApp({ cafe: null, ordersRepo, provider: createStubProvider() });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when order not found', async () => {
      const ordersRepo = createMockOrdersRepo();
      ordersRepo.findByIdAndCafe.mockResolvedValue(null);
      app = await buildPaymentsApp({ ordersRepo, provider: createStubProvider() });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 409 PAYMENT_CONFLICT when already paid', async () => {
      const ordersRepo = createMockOrdersRepo();
      ordersRepo.findByIdAndCafe.mockResolvedValue(
        makeOrderWithItems({ paymentStatus: 'paid' }),
      );
      app = await buildPaymentsApp({ ordersRepo, provider: createStubProvider() });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment`,
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('PAYMENT_CONFLICT');
    });

    it('reuses the existing provider order when already pending (idempotent retry)', async () => {
      // Diner dismissed Razorpay Checkout then tapped "Pay" again — must NOT
      // 409 (that would strand them) and must NOT create a duplicate order.
      const ordersRepo = createMockOrdersRepo();
      const order = makeOrder();
      ordersRepo.findByIdAndCafe.mockResolvedValue(
        makeOrderWithItems({ paymentStatus: 'pending', providerOrderId: PROVIDER_ORDER_ID }),
      );
      const provider = createStubProvider();
      app = await buildPaymentsApp({ ordersRepo, provider });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        keyId: 'rzp_test_keyid',
        providerOrderId: PROVIDER_ORDER_ID,
        amountPaise: order.totalPaise,
        currency: 'INR',
        orderId: ORDER_ID,
      });
      // No new Razorpay order, no state write — pure reuse.
      expect(provider.createOrder).not.toHaveBeenCalled();
      expect(ordersRepo.setPaymentPending).not.toHaveBeenCalled();
    });

    it('allows retry when failed', async () => {
      const ordersRepo = createMockOrdersRepo();
      ordersRepo.findByIdAndCafe.mockResolvedValue(
        makeOrderWithItems({ paymentStatus: 'failed' }),
      );
      ordersRepo.setPaymentPending.mockResolvedValue(
        makeOrder({ paymentStatus: 'pending', providerOrderId: PROVIDER_ORDER_ID }),
      );
      app = await buildPaymentsApp({ ordersRepo, provider: createStubProvider() });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment`,
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 503 PAYMENT_UNCONFIGURED when no provider', async () => {
      const ordersRepo = createMockOrdersRepo();
      ordersRepo.findByIdAndCafe.mockResolvedValue(makeOrderWithItems());
      app = await buildPaymentsApp({ ordersRepo, provider: undefined, withKeys: false });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment`,
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('PAYMENT_UNCONFIGURED');
    });

    it('returns 503 PAYMENT_UNCONFIGURED when cafe has not opted in', async () => {
      const ordersRepo = createMockOrdersRepo();
      ordersRepo.findByIdAndCafe.mockResolvedValue(makeOrderWithItems());
      app = await buildPaymentsApp({
        cafe: makeCafe({ onlinePaymentEnabled: false }),
        ordersRepo,
        provider: createStubProvider(),
      });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment`,
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('PAYMENT_UNCONFIGURED');
    });
  });

  // ─── POST /public/cafes/:slug/orders/:orderId/payment/verify ─────────────────

  describe('POST /public/cafes/:slug/orders/:orderId/payment/verify', () => {
    const body = {
      razorpayPaymentId: 'pay_abc',
      razorpayOrderId: PROVIDER_ORDER_ID,
      razorpaySignature: 'sig_abc',
    };

    it('marks paid and returns the order on a valid signature', async () => {
      const ordersRepo = createMockOrdersRepo();
      ordersRepo.findByIdAndCafe.mockResolvedValue(
        makeOrderWithItems({ paymentStatus: 'pending', providerOrderId: PROVIDER_ORDER_ID }),
      );
      ordersRepo.markPaid.mockResolvedValue(
        makeOrder({
          paymentStatus: 'paid',
          paymentMethod: 'online',
          providerOrderId: PROVIDER_ORDER_ID,
          providerPaymentId: 'pay_abc',
        }),
      );
      const provider = createStubProvider(true);
      app = await buildPaymentsApp({ ordersRepo, provider });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment/verify`,
        payload: body,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().order.paymentStatus).toBe('paid');
      expect(res.json().order.id).toBe(ORDER_ID);
      expect(provider.verifySignature).toHaveBeenCalledWith({
        orderId: PROVIDER_ORDER_ID,
        paymentId: 'pay_abc',
        signature: 'sig_abc',
      });
      expect(ordersRepo.markPaid).toHaveBeenCalledWith(ORDER_ID, CAFE_ID, 'pay_abc');
      expect(ordersRepo.markPaymentFailed).not.toHaveBeenCalled();
    });

    it('returns 400 PAYMENT_ORDER_MISMATCH when providerOrderId differs', async () => {
      const ordersRepo = createMockOrdersRepo();
      ordersRepo.findByIdAndCafe.mockResolvedValue(
        makeOrderWithItems({ paymentStatus: 'pending', providerOrderId: 'order_OTHER' }),
      );
      const provider = createStubProvider(true);
      app = await buildPaymentsApp({ ordersRepo, provider });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment/verify`,
        payload: body,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('PAYMENT_ORDER_MISMATCH');
      expect(provider.verifySignature).not.toHaveBeenCalled();
      expect(ordersRepo.markPaid).not.toHaveBeenCalled();
    });

    it('returns 400 PAYMENT_VERIFICATION_FAILED and marks failed on a bad signature', async () => {
      const ordersRepo = createMockOrdersRepo();
      ordersRepo.findByIdAndCafe.mockResolvedValue(
        makeOrderWithItems({ paymentStatus: 'pending', providerOrderId: PROVIDER_ORDER_ID }),
      );
      ordersRepo.markPaymentFailed.mockResolvedValue(makeOrder({ paymentStatus: 'failed' }));
      const provider = createStubProvider(false);
      app = await buildPaymentsApp({ ordersRepo, provider });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment/verify`,
        payload: body,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('PAYMENT_VERIFICATION_FAILED');
      expect(ordersRepo.markPaymentFailed).toHaveBeenCalledWith(ORDER_ID, CAFE_ID);
      expect(ordersRepo.markPaid).not.toHaveBeenCalled();
    });

    it('returns 404 when cafe not found', async () => {
      const ordersRepo = createMockOrdersRepo();
      app = await buildPaymentsApp({ cafe: null, ordersRepo, provider: createStubProvider() });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment/verify`,
        payload: body,
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when order not found', async () => {
      const ordersRepo = createMockOrdersRepo();
      ordersRepo.findByIdAndCafe.mockResolvedValue(null);
      app = await buildPaymentsApp({ ordersRepo, provider: createStubProvider() });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment/verify`,
        payload: body,
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for an invalid body', async () => {
      const ordersRepo = createMockOrdersRepo();
      app = await buildPaymentsApp({ ordersRepo, provider: createStubProvider() });

      const res = await app.inject({
        method: 'POST',
        url: `/public/cafes/${SLUG}/orders/${ORDER_ID}/payment/verify`,
        payload: { razorpayPaymentId: 'pay_abc' },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
