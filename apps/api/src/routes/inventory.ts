import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type CafesRepository, createDrizzleCafesRepo } from '../repositories/cafes.js';
import {
  type InventoryRepository,
  type UpdateInventory,
  createDrizzleInventoryRepo,
} from '../repositories/inventory.js';

export interface InventoryRoutesOptions {
  repository?: InventoryRepository;
  cafesRepository?: CafesRepository;
}

const cafeParamsSchema = z.object({ cafeId: z.string().uuid() });
const itemParamsSchema = z.object({
  cafeId: z.string().uuid(),
  menuItemId: z.string().uuid(),
});

const updateInventoryBodySchema = z
  .object({
    stockQty: z.number().int().min(0).max(1_000_000).nullable(),
    lowStockThreshold: z.number().int().min(0).max(1_000_000).nullable(),
  })
  .partial()
  // At least one field must be present so an empty PATCH is a 400.
  .refine((b) => b.stockQty !== undefined || b.lowStockThreshold !== undefined, {
    message: 'Provide stockQty and/or lowStockThreshold',
  });

const restockBodySchema = z.object({
  addQty: z.number().int().min(1).max(1_000_000),
});

export async function inventoryRoutes(
  app: FastifyInstance,
  opts: InventoryRoutesOptions = {},
): Promise<void> {
  const inventoryRepo = opts.repository ?? createDrizzleInventoryRepo(app.db);
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);

  async function ownsCafe(cafeId: string, ownerId: string): Promise<boolean> {
    return Boolean(await cafesRepo.findByIdAndOwner(cafeId, ownerId));
  }

  // ─── GET /cafes/:cafeId/inventory ───────────────────────────────────────────
  app.get('/cafes/:cafeId/inventory', { preHandler: app.authenticate }, async (request, reply) => {
    const { cafeId } = cafeParamsSchema.parse(request.params);
    if (!(await ownsCafe(cafeId, request.user.id))) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
    }
    const items = await inventoryRepo.list(cafeId);
    return { items };
  });

  // ─── PATCH /cafes/:cafeId/inventory/:menuItemId ─────────────────────────────
  app.patch(
    '/cafes/:cafeId/inventory/:menuItemId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, menuItemId } = itemParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const patch = updateInventoryBodySchema.parse(request.body) as UpdateInventory;
      const item = await inventoryRepo.update(cafeId, menuItemId, patch);
      if (!item) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Menu item not found' } });
      }
      return { item };
    },
  );

  // ─── POST /cafes/:cafeId/inventory/:menuItemId/restock ──────────────────────
  app.post(
    '/cafes/:cafeId/inventory/:menuItemId/restock',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, menuItemId } = itemParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const { addQty } = restockBodySchema.parse(request.body);
      const item = await inventoryRepo.restock(cafeId, menuItemId, addQty);
      if (!item) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Menu item not found' } });
      }
      return { item };
    },
  );
}
