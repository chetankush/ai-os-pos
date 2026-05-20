import type { CreatePaymentResponse, Order, VerifyPaymentResponse } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createRazorpayProvider, type PaymentProvider } from '../payments/razorpay.js';
import { createDrizzleCafesRepo, type CafesRepository } from '../repositories/cafes.js';
import { createDrizzleOrdersRepo, type OrdersRepository } from '../repositories/orders.js';

export interface PaymentsRoutesOptions {
  cafesRepository?: CafesRepository;
  ordersRepository?: OrdersRepository;
  /** Inject a stub provider in tests. In runtime it's built from app.config. */
  paymentProvider?: PaymentProvider;
}

const paramsSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  orderId: z.string().uuid(),
});

const verifyBodySchema = z.object({
  razorpayPaymentId: z.string().trim().min(1).max(120),
  razorpayOrderId: z.string().trim().min(1).max(120),
  razorpaySignature: z.string().trim().min(1).max(256),
});

/** Diner-safe order shape (matches PublicOrder). */
function toPublicOrder(order: Order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalPaise: order.totalPaise,
    tableLabel: order.tableLabel,
  };
}

/**
 * Public, unauthenticated payment endpoints for QR diners (DropTheQ-style
 * pay-from-your-phone). The amount is always taken from the order row in the
 * DB — a client-sent amount is never trusted. Signature verification is
 * server-side and timing-safe.
 */
export async function paymentsRoutes(
  app: FastifyInstance,
  opts: PaymentsRoutesOptions = {},
): Promise<void> {
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);
  const ordersRepo = opts.ordersRepository ?? createDrizzleOrdersRepo(app.db);

  // Build the real provider from configured Razorpay keys; tests inject a stub.
  // No keys → no provider → endpoints respond 503 PAYMENT_UNCONFIGURED.
  const keyId = app.config.RAZORPAY_KEY_ID;
  const keySecret = app.config.RAZORPAY_KEY_SECRET;
  const provider =
    opts.paymentProvider ??
    (keyId && keySecret ? createRazorpayProvider({ keyId, keySecret }) : undefined);

  app.post('/public/cafes/:slug/orders/:orderId/payment', async (request, reply) => {
    const { slug, orderId } = paramsSchema.parse(request.params);

    const cafe = await cafesRepo.findBySlug(slug);
    if (!cafe) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
    }

    const order = await ordersRepo.findByIdAndCafe(orderId, cafe.id);
    if (!order) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
    }

    // Effective online enabled: cafe opted in AND we actually have a provider.
    const onlineEnabled = cafe.onlinePaymentEnabled && Boolean(provider);
    if (!onlineEnabled || !provider) {
      return reply.status(503).send({
        error: { code: 'PAYMENT_UNCONFIGURED', message: 'Online payment is not available' },
      });
    }

    // Already settled — nothing left to pay.
    if (order.paymentStatus === 'paid') {
      return reply.status(409).send({
        error: { code: 'PAYMENT_CONFLICT', message: 'This order is already paid' },
      });
    }

    // A previous attempt is still open — the diner dismissed Razorpay Checkout
    // and tapped "Pay" again. Reuse the same Razorpay order (idempotent retry)
    // instead of creating a duplicate. Razorpay orders stay payable until paid.
    if (order.paymentStatus === 'pending' && order.providerOrderId) {
      const reuse: CreatePaymentResponse = {
        keyId: keyId ?? '',
        providerOrderId: order.providerOrderId,
        amountPaise: order.totalPaise,
        currency: 'INR',
        orderId: order.id,
      };
      return reply.status(200).send(reuse);
    }

    // Fresh start (unpaid / failed / pending-without-an-order).
    const providerOrder = await provider.createOrder({
      amountPaise: order.totalPaise, // NEVER trust a client amount.
      currency: 'INR',
      receipt: order.orderNumber,
      notes: { sangamOrderId: order.id },
    });

    await ordersRepo.setPaymentPending(order.id, cafe.id, providerOrder.id);

    const body: CreatePaymentResponse = {
      keyId: keyId ?? '',
      providerOrderId: providerOrder.id,
      amountPaise: order.totalPaise,
      currency: 'INR',
      orderId: order.id,
    };
    return reply.status(200).send(body);
  });

  app.post('/public/cafes/:slug/orders/:orderId/payment/verify', async (request, reply) => {
    const { slug, orderId } = paramsSchema.parse(request.params);
    const verifyBody = verifyBodySchema.parse(request.body);

    const cafe = await cafesRepo.findBySlug(slug);
    if (!cafe) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
    }

    const order = await ordersRepo.findByIdAndCafe(orderId, cafe.id);
    if (!order) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
    }

    if (!provider) {
      return reply.status(503).send({
        error: { code: 'PAYMENT_UNCONFIGURED', message: 'Online payment is not available' },
      });
    }

    // The order must already own the provider order id the client claims —
    // verify nothing if these don't line up.
    if (order.providerOrderId !== verifyBody.razorpayOrderId) {
      return reply.status(400).send({
        error: { code: 'PAYMENT_ORDER_MISMATCH', message: 'Payment order does not match' },
      });
    }

    const valid = provider.verifySignature({
      orderId: verifyBody.razorpayOrderId,
      paymentId: verifyBody.razorpayPaymentId,
      signature: verifyBody.razorpaySignature,
    });

    if (!valid) {
      await ordersRepo.markPaymentFailed(order.id, cafe.id);
      return reply.status(400).send({
        error: { code: 'PAYMENT_VERIFICATION_FAILED', message: 'Payment signature is invalid' },
      });
    }

    const paid = await ordersRepo.markPaid(order.id, cafe.id, verifyBody.razorpayPaymentId);
    if (!paid) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
    }

    const body: VerifyPaymentResponse = { order: toPublicOrder(paid) };
    return reply.status(200).send(body);
  });
}
