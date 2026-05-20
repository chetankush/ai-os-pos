import type { PublicOrderDetail } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { askWaiter } from '../ai/waiter.js';
import { cacheKey, getCache } from '../lib/cache.js';
import { OrderBuildError, buildOrder, generateOrderNumber } from '../orders/build.js';
import { createDrizzleCafesRepo, type CafesRepository } from '../repositories/cafes.js';
import { createDrizzleMenuRepo, type MenuRepository } from '../repositories/menu.js';
import { createDrizzleOrdersRepo, type NewOrder, type OrdersRepository } from '../repositories/orders.js';

export interface PublicRoutesOptions {
  cafesRepository?: CafesRepository;
  menuRepository?: MenuRepository;
  ordersRepository?: OrdersRepository;
}

const slugParams = z.object({ slug: z.string().trim().min(1).max(80) });

const orderParams = z.object({
  slug: z.string().trim().min(1).max(80),
  orderId: z.string().uuid(),
});

const publicOrderSchema = z.object({
  tableLabel: z.string().trim().max(40).optional(),
  customerName: z.string().trim().max(80).optional(),
  customerPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, 'phone must be 7-15 digits')
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

const aiSchema = z.object({
  message: z.string().trim().min(1).max(500),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .max(10)
    .optional(),
});

/**
 * Public, unauthenticated endpoints for QR table ordering. A diner scans a
 * table QR → /m/{slug}?table=… → these power the menu, order, and AI waiter.
 * Only public-safe cafe fields are exposed.
 */
export async function publicRoutes(
  app: FastifyInstance,
  opts: PublicRoutesOptions = {},
): Promise<void> {
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);
  const menuRepo = opts.menuRepository ?? createDrizzleMenuRepo(app.db);
  const ordersRepo = opts.ordersRepository ?? createDrizzleOrdersRepo(app.db);
  const cache = getCache();

  app.get('/public/cafes/:slug', async (request, reply) => {
    const { slug } = slugParams.parse(request.params);
    const cafe = await cafesRepo.findBySlug(slug);
    if (!cafe) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Cafe not found' },
      });
    }
    const categories = (await menuRepo.getFullMenu(cafe.id)).map((c) => ({
      ...c,
      items: c.items.filter((i) => i.isAvailable),
    }));
    // Effective online payment: the cafe opted in AND the server has Razorpay
    // keys configured. Either alone is not enough to show the pay button.
    const onlinePaymentEnabled =
      cafe.onlinePaymentEnabled &&
      Boolean(app.config.RAZORPAY_KEY_ID && app.config.RAZORPAY_KEY_SECRET);

    return {
      cafe: {
        name: cafe.name,
        slug: cafe.slug,
        logoUrl: cafe.logoUrl,
        primaryColor: cafe.primaryColor,
        city: cafe.city,
        onlinePaymentEnabled,
        prepaidRequired: cafe.qrPrepaidRequired,
      },
      categories,
    };
  });

  app.post('/public/cafes/:slug/orders', async (request, reply) => {
    const { slug } = slugParams.parse(request.params);
    const cafe = await cafesRepo.findBySlug(slug);
    if (!cafe) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Cafe not found' },
      });
    }
    const body = publicOrderSchema.parse(request.body);
    const menu = await menuRepo.getFullMenu(cafe.id);

    let built: ReturnType<typeof buildOrder>;
    try {
      built = buildOrder(cafe, menu, body.items);
    } catch (err) {
      if (err instanceof OrderBuildError) {
        return reply.status(400).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }

    const newOrder: NewOrder = {
      cafeId: cafe.id,
      orderNumber: generateOrderNumber(),
      source: 'qr',
      tableLabel: body.tableLabel ?? null,
      customerName: body.customerName ?? null,
      customerPhone: body.customerPhone ?? null,
      notes: body.notes ?? null,
      subtotalPaise: built.subtotalPaise,
      taxPaise: built.taxPaise,
      totalPaise: built.totalPaise,
      gstRateBp: built.gstRateBp,
      items: built.items,
    };

    const create = async () => ordersRepo.create(newOrder);
    let order;
    try {
      order = await create();
    } catch (err) {
      if ((err as { code?: string } | null)?.code === '23505') {
        newOrder.orderNumber = generateOrderNumber();
        order = await create();
      } else {
        throw err;
      }
    }
    await cache.del(cacheKey('orders', cafe.id, 'stats', 'today'));

    // Public confirmation — only what the diner needs (matches PublicOrder).
    return reply.status(201).send({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalPaise: order.totalPaise,
        tableLabel: order.tableLabel,
      },
    });
  });

  app.get('/public/cafes/:slug/orders/:orderId', async (request, reply) => {
    const { slug, orderId } = orderParams.parse(request.params);
    const cafe = await cafesRepo.findBySlug(slug);
    if (!cafe) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Cafe not found' },
      });
    }
    const order = await ordersRepo.findByIdAndCafe(orderId, cafe.id);
    if (!order) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Order not found' },
      });
    }

    // Diner-safe live status — only fields the diner's own device needs.
    // Owner-only PII (customerName/phone) and provider ids are never exposed.
    const detail: PublicOrderDetail = {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalPaise: order.totalPaise,
      tableLabel: order.tableLabel,
      items: order.items.map((i) => ({ name: i.itemNameSnapshot, quantity: i.quantity })),
      createdAt: order.createdAt,
    };
    return { order: detail };
  });

  app.post('/public/cafes/:slug/ai-waiter', async (request, reply) => {
    const { slug } = slugParams.parse(request.params);
    const cafe = await cafesRepo.findBySlug(slug);
    if (!cafe) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Cafe not found' },
      });
    }
    const apiKey = app.config.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return reply.status(503).send({
        error: { code: 'AI_UNCONFIGURED', message: 'AI waiter is not available' },
      });
    }
    const body = aiSchema.parse(request.body);
    const menu = await menuRepo.getFullMenu(cafe.id);
    return askWaiter(
      { apiKey, baseUrl: app.config.DEEPSEEK_BASE_URL, model: app.config.DEEPSEEK_MODEL },
      cafe,
      menu,
      body.message,
      body.history ?? [],
    );
  });
}
