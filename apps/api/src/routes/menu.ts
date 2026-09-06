import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cacheKey, getCache } from '../lib/cache.js';
import { parseMenuCsv } from '../menu/import.js';
import { type CafesRepository, createDrizzleCafesRepo } from '../repositories/cafes.js';
import {
  type MenuRepository,
  type NewMenuItem,
  createDrizzleMenuRepo,
} from '../repositories/menu.js';

export interface MenuRoutesOptions {
  repository?: MenuRepository;
  cafesRepository?: CafesRepository;
}

const cafeParamsSchema = z.object({
  cafeId: z.string().uuid(),
});

const itemParamsSchema = z.object({
  cafeId: z.string().uuid(),
  itemId: z.string().uuid(),
});

const createCategoryBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).optional(),
});

const createItemBodySchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  basePricePaise: z.number().int().min(0).max(10_000_00),
  hsnCode: z.string().trim().max(8).regex(/^\d+$/, 'HSN/SAC must be digits').optional(),
  gstRateBpOverride: z.number().int().min(0).max(2800).optional(),
  imageUrl: z.string().trim().url().optional(),
  isVegetarian: z.boolean().optional(),
  isVegan: z.boolean().optional(),
  containsEgg: z.boolean().optional(),
  spiceLevel: z.number().int().min(0).max(3).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const importBodySchema = z.object({
  csv: z.string().min(1).max(500_000),
});

const updateItemBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable(),
    basePricePaise: z.number().int().min(0).max(10_000_00),
    hsnCode: z.string().trim().max(8).regex(/^\d+$/, 'HSN/SAC must be digits').nullable(),
    gstRateBpOverride: z.number().int().min(0).max(2800).nullable(),
    imageUrl: z.string().trim().url().nullable(),
    isVegetarian: z.boolean(),
    isVegan: z.boolean(),
    containsEgg: z.boolean(),
    spiceLevel: z.number().int().min(0).max(3),
    isAvailable: z.boolean(),
    sortOrder: z.number().int().min(0),
    categoryId: z.string().uuid(),
  })
  .partial();

export async function menuRoutes(
  app: FastifyInstance,
  opts: MenuRoutesOptions = {},
): Promise<void> {
  const menuRepo = opts.repository ?? createDrizzleMenuRepo(app.db);
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);
  const cache = getCache();

  async function assertCafeOwnedBy(cafeId: string, ownerId: string): Promise<boolean> {
    const cafe = await cafesRepo.findByIdAndOwner(cafeId, ownerId);
    return cafe !== null;
  }

  function menuCacheKey(cafeId: string): string {
    return cacheKey('menu', cafeId, 'full');
  }

  app.get('/cafes/:cafeId/menu', { preHandler: app.authenticate }, async (request, reply) => {
    const { cafeId } = cafeParamsSchema.parse(request.params);

    if (!(await assertCafeOwnedBy(cafeId, request.user.id))) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Cafe not found' },
      });
    }

    const key = menuCacheKey(cafeId);
    const cached = await cache.get<{ categories: unknown[] }>(key);
    if (cached) return cached;

    const categories = await menuRepo.getFullMenu(cafeId);
    const payload = { categories };
    await cache.set(key, payload, 60);
    return payload;
  });

  app.post(
    '/cafes/:cafeId/menu/categories',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);

      if (!(await assertCafeOwnedBy(cafeId, request.user.id))) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Cafe not found' },
        });
      }

      const body = createCategoryBodySchema.parse(request.body);
      const category = await menuRepo.createCategory({
        cafeId,
        name: body.name,
        sortOrder: body.sortOrder ?? 0,
      });

      await cache.del(menuCacheKey(cafeId));
      return reply.status(201).send({ category });
    },
  );

  app.post(
    '/cafes/:cafeId/menu/items',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);

      if (!(await assertCafeOwnedBy(cafeId, request.user.id))) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Cafe not found' },
        });
      }

      const body = createItemBodySchema.parse(request.body);

      // The DB FK only proves the category exists globally — verify it belongs
      // to THIS cafe, else the item is silently orphaned (or cross-tenant).
      if (!(await menuRepo.categoryExists(body.categoryId, cafeId))) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_CATEGORY',
            message: 'Category does not belong to this cafe',
          },
        });
      }

      const newItem: NewMenuItem = {
        cafeId,
        categoryId: body.categoryId,
        name: body.name,
        description: body.description ?? null,
        basePricePaise: body.basePricePaise,
        hsnCode: body.hsnCode ?? null,
        gstRateBpOverride: body.gstRateBpOverride ?? null,
        imageUrl: body.imageUrl ?? null,
        isVegetarian: body.isVegetarian ?? true,
        isVegan: body.isVegan ?? false,
        containsEgg: body.containsEgg ?? false,
        spiceLevel: body.spiceLevel ?? 0,
        sortOrder: body.sortOrder ?? 0,
      };

      const item = await menuRepo.createItem(newItem);
      await cache.del(menuCacheKey(cafeId));
      return reply.status(201).send({ item });
    },
  );

  app.post(
    '/cafes/:cafeId/menu/import',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);

      if (!(await assertCafeOwnedBy(cafeId, request.user.id))) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Cafe not found' },
        });
      }

      const { csv } = importBodySchema.parse(request.body);
      const { rows, errors } = parseMenuCsv(csv);

      let categoriesCreated = 0;
      let itemsCreated = 0;

      // Map existing categories by lowercased name so we reuse instead of
      // duplicating, and so two CSV rows in the same (new) category share one.
      // Only hit the DB if there's actually something to import.
      const categoryIdByName = new Map<string, string>();
      if (rows.length > 0) {
        for (const cat of await menuRepo.getFullMenu(cafeId)) {
          categoryIdByName.set(cat.name.trim().toLowerCase(), cat.id);
        }
      }

      for (const row of rows) {
        const key = row.category.trim().toLowerCase();
        let categoryId = categoryIdByName.get(key);
        if (!categoryId) {
          const created = await menuRepo.createCategory({
            cafeId,
            name: row.category,
            sortOrder: 0,
          });
          categoryId = created.id;
          categoryIdByName.set(key, categoryId);
          categoriesCreated += 1;
        }

        await menuRepo.createItem({
          cafeId,
          categoryId,
          name: row.name,
          description: row.description,
          basePricePaise: row.pricePaise,
          hsnCode: null,
          gstRateBpOverride: null,
          imageUrl: null,
          isVegetarian: row.isVegetarian,
          isVegan: false,
          containsEgg: false,
          spiceLevel: row.spiceLevel,
          sortOrder: 0,
        });
        itemsCreated += 1;
      }

      if (categoriesCreated > 0 || itemsCreated > 0) {
        await cache.del(menuCacheKey(cafeId));
      }

      // "skipped" = rows that parsed-but-failed validation (each yields an
      // error). Header-level errors (missing column / empty) carry no rows.
      const skipped = errors.length;
      return reply.status(200).send({ categoriesCreated, itemsCreated, skipped, errors });
    },
  );

  app.patch(
    '/cafes/:cafeId/menu/items/:itemId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, itemId } = itemParamsSchema.parse(request.params);

      if (!(await assertCafeOwnedBy(cafeId, request.user.id))) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Cafe not found' },
        });
      }

      const patch = updateItemBodySchema.parse(request.body);

      // If the patch moves the item to another category, that category must
      // also belong to this cafe.
      if (patch.categoryId && !(await menuRepo.categoryExists(patch.categoryId, cafeId))) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_CATEGORY',
            message: 'Category does not belong to this cafe',
          },
        });
      }

      const item = await menuRepo.updateItem(itemId, cafeId, patch);

      if (!item) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Menu item not found' },
        });
      }

      await cache.del(menuCacheKey(cafeId));
      return { item };
    },
  );

  app.delete(
    '/cafes/:cafeId/menu/items/:itemId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, itemId } = itemParamsSchema.parse(request.params);

      if (!(await assertCafeOwnedBy(cafeId, request.user.id))) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Cafe not found' },
        });
      }

      const ok = await menuRepo.deleteItem(itemId, cafeId);
      if (!ok) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Menu item not found' },
        });
      }

      await cache.del(menuCacheKey(cafeId));
      return reply.status(204).send();
    },
  );
}
