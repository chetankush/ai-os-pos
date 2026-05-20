import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type CafesRepository, createDrizzleCafesRepo } from '../repositories/cafes.js';
import {
  type NewTable,
  type TablesRepository,
  type UpdateTable,
  createDrizzleTablesRepo,
} from '../repositories/tables.js';

export interface TablesRoutesOptions {
  repository?: TablesRepository;
  cafesRepository?: CafesRepository;
}

const cafeParamsSchema = z.object({ cafeId: z.string().uuid() });
const tableParamsSchema = z.object({
  cafeId: z.string().uuid(),
  tableId: z.string().uuid(),
});

const createTableBodySchema = z.object({
  label: z.string().trim().min(1, 'label is required').max(40),
  area: z.string().trim().max(80).nullish(),
  shape: z.enum(['round', 'square']).optional(),
  seats: z.number().int().min(1).max(99).optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  sortOrder: z.number().int().optional(),
});

const updateTableBodySchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    area: z.string().trim().max(80).nullable(),
    shape: z.enum(['round', 'square']),
    seats: z.number().int().min(1).max(99),
    x: z.number().int(),
    y: z.number().int(),
    sortOrder: z.number().int(),
  })
  .partial();

export async function tablesRoutes(
  app: FastifyInstance,
  opts: TablesRoutesOptions = {},
): Promise<void> {
  const tablesRepo = opts.repository ?? createDrizzleTablesRepo(app.db);
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);

  async function ownsCafe(cafeId: string, ownerId: string): Promise<boolean> {
    return Boolean(await cafesRepo.findByIdAndOwner(cafeId, ownerId));
  }

  // ─── GET /cafes/:cafeId/tables ──────────────────────────────────────────────
  app.get('/cafes/:cafeId/tables', { preHandler: app.authenticate }, async (request, reply) => {
    const { cafeId } = cafeParamsSchema.parse(request.params);
    if (!(await ownsCafe(cafeId, request.user.id))) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
    }
    const tables = await tablesRepo.list(cafeId);
    return { tables };
  });

  // ─── POST /cafes/:cafeId/tables ─────────────────────────────────────────────
  app.post('/cafes/:cafeId/tables', { preHandler: app.authenticate }, async (request, reply) => {
    const { cafeId } = cafeParamsSchema.parse(request.params);
    if (!(await ownsCafe(cafeId, request.user.id))) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
    }
    const body = createTableBodySchema.parse(request.body);
    const newTable: NewTable = {
      label: body.label,
      area: body.area ?? null,
      shape: body.shape ?? 'square',
      seats: body.seats ?? 4,
      x: body.x ?? 0,
      y: body.y ?? 0,
      sortOrder: body.sortOrder ?? 0,
    };

    try {
      const table = await tablesRepo.create(cafeId, newTable);
      return reply.status(201).send({ table });
    } catch (err) {
      const errCode = (err as { code?: string } | null)?.code;
      if (errCode === '23505') {
        return reply.status(409).send({
          error: {
            code: 'TABLE_LABEL_TAKEN',
            message: `A table labelled "${body.label}" already exists`,
          },
        });
      }
      throw err;
    }
  });

  // ─── PATCH /cafes/:cafeId/tables/:tableId ───────────────────────────────────
  app.patch(
    '/cafes/:cafeId/tables/:tableId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, tableId } = tableParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const patch = updateTableBodySchema.parse(request.body) as UpdateTable;

      try {
        const table = await tablesRepo.update(tableId, cafeId, patch);
        if (!table) {
          return reply
            .status(404)
            .send({ error: { code: 'NOT_FOUND', message: 'Table not found' } });
        }
        return { table };
      } catch (err) {
        const errCode = (err as { code?: string } | null)?.code;
        if (errCode === '23505') {
          return reply.status(409).send({
            error: { code: 'TABLE_LABEL_TAKEN', message: 'A table with that label already exists' },
          });
        }
        throw err;
      }
    },
  );

  // ─── DELETE /cafes/:cafeId/tables/:tableId ──────────────────────────────────
  app.delete(
    '/cafes/:cafeId/tables/:tableId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, tableId } = tableParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const deleted = await tablesRepo.delete(tableId, cafeId);
      if (!deleted) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Table not found' } });
      }
      return reply.status(204).send();
    },
  );
}
