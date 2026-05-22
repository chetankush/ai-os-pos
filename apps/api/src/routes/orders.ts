import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cacheKey, getCache } from '../lib/cache.js';
import { createDrizzleCafesRepo, type CafesRepository } from '../repositories/cafes.js';
import { createDrizzleMenuRepo, type MenuRepository } from '../repositories/menu.js';
import {
  createDrizzleOrdersRepo,
  type NewOrder,
  type OrdersRepository,
} from '../repositories/orders.js';
import {
  type AuditLogsRepository,
  createDrizzleAuditLogsRepo,
} from '../repositories/audit-logs.js';
import { OrderBuildError, buildOrder } from '../orders/build.js';

export interface OrdersRoutesOptions {
  repository?: OrdersRepository;
  cafesRepository?: CafesRepository;
  menuRepository?: MenuRepository;
  auditRepository?: AuditLogsRepository;
}

const cafeParamsSchema = z.object({ cafeId: z.string().uuid() });
const orderParamsSchema = z.object({
  cafeId: z.string().uuid(),
  orderId: z.string().uuid(),
});

const createOrderBodySchema = z.object({
  source: z.enum(['counter', 'qr', 'phone']).optional(),
  tableLabel: z.string().trim().max(40).optional(),
  tableSessionId: z.string().uuid().optional(),
  customerName: z.string().trim().max(80).optional(),
  customerPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, 'phone must be 7-15 digits, optional + prefix')
    .optional(),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
        notes: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, 'order must contain at least one item'),
  // Bill-level adjustments — owner/counter only.
  discount: z
    .object({
      type: z.enum(['percent', 'flat']),
      value: z.number().min(0),
      reason: z.string().trim().max(120).optional(),
    })
    .optional(),
  serviceChargeBp: z.number().int().min(0).max(10000).optional(),
  packagingChargePaise: z.number().int().min(0).optional(),
  roundOff: z.boolean().optional(),
});

const updateStatusBodySchema = z.object({
  status: z.enum(['pending', 'preparing', 'ready', 'completed', 'cancelled']),
  paymentMethod: z.enum(['cash', 'upi', 'card', 'online']).optional(),
});

const settleBodySchema = z.object({
  payments: z
    .array(
      z.object({
        method: z.enum(['cash', 'upi', 'card', 'online']),
        amountPaise: z.number().int().min(1),
      }),
    )
    .min(1, 'at least one payment is required')
    .max(4),
});

const refundBodySchema = z.object({
  method: z.enum(['cash', 'upi', 'card', 'online']),
  amountPaise: z.number().int().min(1),
  reason: z.string().trim().max(200).optional(),
});

// Forward-only state machine; cancel allowed from any non-terminal state.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export async function ordersRoutes(
  app: FastifyInstance,
  opts: OrdersRoutesOptions = {},
): Promise<void> {
  const ordersRepo = opts.repository ?? createDrizzleOrdersRepo(app.db);
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);
  const menuRepo = opts.menuRepository ?? createDrizzleMenuRepo(app.db);
  const auditRepo = opts.auditRepository ?? createDrizzleAuditLogsRepo(app.db);
  const cache = getCache();

  function statsKey(cafeId: string): string {
    return cacheKey('orders', cafeId, 'stats', 'today');
  }

  async function getOwnedCafe(cafeId: string, ownerId: string) {
    return cafesRepo.findByIdAndOwner(cafeId, ownerId);
  }

  // ─── POST /cafes/:cafeId/orders ─────────────────────────────────────────────

  app.post(
    '/cafes/:cafeId/orders',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);
      const cafe = await getOwnedCafe(cafeId, request.user.id);
      if (!cafe) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Cafe not found' },
        });
      }

      const body = createOrderBodySchema.parse(request.body);
      const menu = await menuRepo.getFullMenu(cafeId);

      let built: ReturnType<typeof buildOrder>;
      try {
        built = buildOrder(cafe, menu, body.items, {
          discount: body.discount,
          serviceChargeBp: body.serviceChargeBp,
          packagingChargePaise: body.packagingChargePaise,
          roundOff: body.roundOff,
        });
      } catch (err) {
        if (err instanceof OrderBuildError) {
          return reply.status(400).send({
            error: { code: err.code, message: err.message },
          });
        }
        throw err;
      }

      const newOrder: NewOrder = {
        cafeId,
        source: body.source ?? 'counter',
        tableLabel: body.tableLabel ?? null,
        tableSessionId: body.tableSessionId ?? null,
        customerName: body.customerName ?? null,
        customerPhone: body.customerPhone ?? null,
        notes: body.notes ?? null,
        subtotalPaise: built.subtotalPaise,
        discountPaise: built.discountPaise,
        discountReason: built.discountReason,
        serviceChargePaise: built.serviceChargePaise,
        packagingChargePaise: built.packagingChargePaise,
        taxPaise: built.taxPaise,
        roundOffPaise: built.roundOffPaise,
        totalPaise: built.totalPaise,
        gstRateBp: built.gstRateBp,
        items: built.items,
      };

      // The bill number is a gapless serial allocated atomically inside the
      // create() transaction — no client-side number, no retry-on-collision.
      const order = await ordersRepo.create(newOrder);
      await cache.del(statsKey(cafeId));
      return reply.status(201).send({ order });
    },
  );

  // ─── GET /cafes/:cafeId/orders ──────────────────────────────────────────────

  app.get(
    '/cafes/:cafeId/orders',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);
      if (!(await getOwnedCafe(cafeId, request.user.id))) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Cafe not found' },
        });
      }
      const orders = await ordersRepo.listByCafe(cafeId, 50);
      return { orders };
    },
  );

  // ─── GET /cafes/:cafeId/orders/stats ────────────────────────────────────────

  app.get(
    '/cafes/:cafeId/orders/stats',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);
      if (!(await getOwnedCafe(cafeId, request.user.id))) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Cafe not found' },
        });
      }

      const key = statsKey(cafeId);
      const cached = await cache.get<unknown>(key);
      if (cached) return cached;

      const stats = await ordersRepo.todayStats(cafeId);
      // Short TTL — dashboard data should feel fresh.
      await cache.set(key, stats, 15);
      return stats;
    },
  );

  // ─── GET /cafes/:cafeId/orders/:orderId ─────────────────────────────────────

  app.get(
    '/cafes/:cafeId/orders/:orderId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, orderId } = orderParamsSchema.parse(request.params);
      if (!(await getOwnedCafe(cafeId, request.user.id))) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Cafe not found' },
        });
      }
      const order = await ordersRepo.findByIdAndCafe(orderId, cafeId);
      if (!order) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Order not found' },
        });
      }
      return { order };
    },
  );

  // ─── PATCH /cafes/:cafeId/orders/:orderId/status ────────────────────────────

  app.patch(
    '/cafes/:cafeId/orders/:orderId/status',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, orderId } = orderParamsSchema.parse(request.params);
      if (!(await getOwnedCafe(cafeId, request.user.id))) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Cafe not found' },
        });
      }
      const { status: nextStatus, paymentMethod } = updateStatusBodySchema.parse(
        request.body,
      );

      const current = await ordersRepo.findByIdAndCafe(orderId, cafeId);
      if (!current) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Order not found' },
        });
      }

      const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(nextStatus) && nextStatus !== current.status) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_TRANSITION',
            message: `Cannot transition from ${current.status} to ${nextStatus}`,
          },
        });
      }

      const updated = await ordersRepo.updateStatus(
        orderId,
        cafeId,
        nextStatus,
        paymentMethod,
      );
      if (!updated) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Order not found' },
        });
      }

      await cache.del(statsKey(cafeId));
      return { order: { ...updated, items: current.items } };
    },
  );

  // ─── POST /cafes/:cafeId/orders/:orderId/settle — split tender ───────────────
  app.post(
    '/cafes/:cafeId/orders/:orderId/settle',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, orderId } = orderParamsSchema.parse(request.params);
      if (!(await getOwnedCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const body = settleBodySchema.parse(request.body);

      const current = await ordersRepo.findByIdAndCafe(orderId, cafeId);
      if (!current) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
      }
      if (current.paymentStatus === 'paid') {
        return reply
          .status(409)
          .send({ error: { code: 'ALREADY_PAID', message: 'Order is already paid' } });
      }
      const tendered = body.payments.reduce((s, p) => s + p.amountPaise, 0);
      if (tendered !== current.totalPaise) {
        return reply.status(400).send({
          error: {
            code: 'AMOUNT_MISMATCH',
            message: `Tendered ₹${tendered / 100} must equal the bill total ₹${current.totalPaise / 100}`,
          },
        });
      }

      const updated = await ordersRepo.settleWithPayments(orderId, cafeId, body.payments);
      if (!updated) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
      }
      await cache.del(statsKey(cafeId));
      return { order: { ...updated, items: current.items } };
    },
  );

  // ─── POST /cafes/:cafeId/orders/:orderId/refund ─────────────────────────────
  app.post(
    '/cafes/:cafeId/orders/:orderId/refund',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, orderId } = orderParamsSchema.parse(request.params);
      if (!(await getOwnedCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const body = refundBodySchema.parse(request.body);

      const current = await ordersRepo.findByIdAndCafe(orderId, cafeId);
      if (!current) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
      }
      if (current.paymentStatus !== 'paid' && current.paymentStatus !== 'refunded') {
        return reply.status(400).send({
          error: { code: 'NOT_REFUNDABLE', message: 'Only a paid order can be refunded' },
        });
      }
      if (body.amountPaise > current.totalPaise) {
        return reply.status(400).send({
          error: { code: 'AMOUNT_TOO_HIGH', message: 'Refund cannot exceed the order total' },
        });
      }

      const updated = await ordersRepo.refund(orderId, cafeId, {
        method: body.method,
        amountPaise: body.amountPaise,
        reason: body.reason ?? null,
      });
      if (!updated) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
      }

      // Refunds are sensitive — record who did it for the audit trail.
      await auditRepo.record({
        cafeId,
        actorType: 'owner',
        actorId: request.user.id,
        action: 'order.refund',
        entityType: 'order',
        entityId: orderId,
        summary: `Refunded ₹${body.amountPaise / 100} (${body.method}) on ${current.orderNumber}`,
        metadata: { amountPaise: body.amountPaise, method: body.method, reason: body.reason ?? null },
      });

      await cache.del(statsKey(cafeId));
      return { order: { ...updated, items: current.items } };
    },
  );

  // ─── GET /cafes/:cafeId/orders/:orderId/payments — tender ledger ─────────────
  app.get(
    '/cafes/:cafeId/orders/:orderId/payments',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, orderId } = orderParamsSchema.parse(request.params);
      if (!(await getOwnedCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const payments = await ordersRepo.listPayments(orderId, cafeId);
      return { payments };
    },
  );
}
