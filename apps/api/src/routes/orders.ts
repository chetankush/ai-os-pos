import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cacheKey, getCache } from '../lib/cache.js';
import { createDrizzleCafesRepo, type CafesRepository } from '../repositories/cafes.js';
import { createDrizzleMenuRepo, type MenuRepository } from '../repositories/menu.js';
import {
  createDrizzleOrdersRepo,
  type NewOrder,
  type NewOrderItem,
  type OrdersRepository,
} from '../repositories/orders.js';

export interface OrdersRoutesOptions {
  repository?: OrdersRepository;
  cafesRepository?: CafesRepository;
  menuRepository?: MenuRepository;
}

const cafeParamsSchema = z.object({ cafeId: z.string().uuid() });
const orderParamsSchema = z.object({
  cafeId: z.string().uuid(),
  orderId: z.string().uuid(),
});

const createOrderBodySchema = z.object({
  source: z.enum(['counter', 'qr', 'phone']).optional(),
  tableLabel: z.string().trim().max(40).optional(),
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
});

const updateStatusBodySchema = z.object({
  status: z.enum(['pending', 'preparing', 'ready', 'completed', 'cancelled']),
});

function generateOrderNumber(): string {
  // Short, terse, unique-per-cafe (enforced by unique index): "M-A3B7F1"
  const r = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X');
  return `M-${r}`;
}

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

      // Look up each menu item to snapshot price + name. Bulk-fetch via the
      // existing getFullMenu (single round-trip).
      const menu = await menuRepo.getFullMenu(cafeId);
      const allItems = new Map<string, { name: string; price: number; available: boolean }>();
      for (const cat of menu) {
        for (const item of cat.items) {
          allItems.set(item.id, {
            name: item.name,
            price: item.basePricePaise,
            available: item.isAvailable,
          });
        }
      }

      const newItems: NewOrderItem[] = [];
      for (const line of body.items) {
        const snapshot = allItems.get(line.menuItemId);
        if (!snapshot) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_ITEM',
              message: `Menu item ${line.menuItemId} not found in this cafe`,
            },
          });
        }
        if (!snapshot.available) {
          return reply.status(400).send({
            error: {
              code: 'ITEM_UNAVAILABLE',
              message: `Item "${snapshot.name}" is currently unavailable`,
            },
          });
        }
        newItems.push({
          menuItemId: line.menuItemId,
          itemNameSnapshot: snapshot.name,
          unitPricePaise: snapshot.price,
          quantity: line.quantity,
          notes: line.notes ?? null,
        });
      }

      // GST: 18% for AC cafe, 5% otherwise. Stored in basis points.
      const gstRateBp = cafe.isAirConditioned ? 1800 : 500;
      const subtotal = newItems.reduce(
        (sum, it) => sum + it.unitPricePaise * it.quantity,
        0,
      );
      const tax = Math.round((subtotal * gstRateBp) / 10000);
      const total = subtotal + tax;

      const newOrder: NewOrder = {
        cafeId,
        orderNumber: generateOrderNumber(),
        source: body.source ?? 'counter',
        tableLabel: body.tableLabel ?? null,
        customerName: body.customerName ?? null,
        customerPhone: body.customerPhone ?? null,
        notes: body.notes ?? null,
        subtotalPaise: subtotal,
        taxPaise: tax,
        totalPaise: total,
        gstRateBp,
        items: newItems,
      };

      try {
        const order = await ordersRepo.create(newOrder);
        await cache.del(statsKey(cafeId));
        return reply.status(201).send({ order });
      } catch (err) {
        const errCode = (err as { code?: string } | null)?.code;
        if (errCode === '23505') {
          // Unique violation on order_number — retry with new number once.
          newOrder.orderNumber = generateOrderNumber();
          const order = await ordersRepo.create(newOrder);
          await cache.del(statsKey(cafeId));
          return reply.status(201).send({ order });
        }
        throw err;
      }
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
      const { status: nextStatus } = updateStatusBodySchema.parse(request.body);

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

      const updated = await ordersRepo.updateStatus(orderId, cafeId, nextStatus);
      if (!updated) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Order not found' },
        });
      }

      await cache.del(statsKey(cafeId));
      return { order: { ...updated, items: current.items } };
    },
  );
}
