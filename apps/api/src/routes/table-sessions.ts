import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type CafesRepository, createDrizzleCafesRepo } from '../repositories/cafes.js';
import {
  type NewTableSession,
  type TableSessionsRepository,
  createDrizzleTableSessionsRepo,
} from '../repositories/table-sessions.js';
import { type TablesRepository, createDrizzleTablesRepo } from '../repositories/tables.js';

export interface TableSessionsRoutesOptions {
  repository?: TableSessionsRepository;
  tablesRepository?: TablesRepository;
  cafesRepository?: CafesRepository;
}

const cafeParamsSchema = z.object({ cafeId: z.string().uuid() });
const sessionParamsSchema = z.object({
  cafeId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

const openSessionBodySchema = z.object({
  tableId: z.string().uuid(),
  guestName: z.string().trim().max(80).optional(),
  guestPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, 'phone must be 7-15 digits, optional + prefix')
    .optional(),
  partySize: z.number().int().min(1).max(99).optional(),
});

const settleSessionBodySchema = z.object({
  paymentMethod: z.enum(['cash', 'upi', 'card', 'online']),
});

export async function tableSessionsRoutes(
  app: FastifyInstance,
  opts: TableSessionsRoutesOptions = {},
): Promise<void> {
  const sessionsRepo = opts.repository ?? createDrizzleTableSessionsRepo(app.db);
  const tablesRepo = opts.tablesRepository ?? createDrizzleTablesRepo(app.db);
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);

  async function ownsCafe(cafeId: string, ownerId: string): Promise<boolean> {
    return Boolean(await cafesRepo.findByIdAndOwner(cafeId, ownerId));
  }

  // ─── GET /cafes/:cafeId/floor ───────────────────────────────────────────────
  app.get('/cafes/:cafeId/floor', { preHandler: app.authenticate }, async (request, reply) => {
    const { cafeId } = cafeParamsSchema.parse(request.params);
    if (!(await ownsCafe(cafeId, request.user.id))) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
    }
    const tables = await sessionsRepo.floor(cafeId);
    return { tables };
  });

  // ─── GET /cafes/:cafeId/table-sessions/history ──────────────────────────────
  // Static "history" segment is matched before the parametric ":sessionId" route.
  app.get(
    '/cafes/:cafeId/table-sessions/history',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      return sessionsRepo.history(cafeId);
    },
  );

  // ─── POST /cafes/:cafeId/table-sessions ─────────────────────────────────────
  app.post(
    '/cafes/:cafeId/table-sessions',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const body = openSessionBodySchema.parse(request.body);

      const table = await tablesRepo.findByIdAndCafe(body.tableId, cafeId);
      if (!table) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Table not found' } });
      }

      const existing = await sessionsRepo.findOpenByTable(body.tableId, cafeId);
      if (existing) {
        return reply.status(409).send({
          error: {
            code: 'SESSION_ALREADY_OPEN',
            message: 'This table already has an open session',
          },
        });
      }

      const data: NewTableSession = {
        cafeId,
        tableId: body.tableId,
        guestName: body.guestName ?? null,
        guestPhone: body.guestPhone ?? null,
        partySize: body.partySize ?? null,
      };
      const session = await sessionsRepo.open(data);
      return reply.status(201).send({ session });
    },
  );

  // ─── GET /cafes/:cafeId/table-sessions/:sessionId ───────────────────────────
  app.get(
    '/cafes/:cafeId/table-sessions/:sessionId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, sessionId } = sessionParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const detail = await sessionsRepo.getDetail(sessionId, cafeId);
      if (!detail) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
      }
      return { session: detail };
    },
  );

  // ─── POST /cafes/:cafeId/table-sessions/:sessionId/settle ───────────────────
  app.post(
    '/cafes/:cafeId/table-sessions/:sessionId/settle',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, sessionId } = sessionParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const { paymentMethod } = settleSessionBodySchema.parse(request.body);

      const detail = await sessionsRepo.settle(sessionId, cafeId, paymentMethod);
      if (!detail) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
      }
      return { session: detail };
    },
  );

  // ─── POST /cafes/:cafeId/table-sessions/:sessionId/close ────────────────────
  app.post(
    '/cafes/:cafeId/table-sessions/:sessionId/close',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, sessionId } = sessionParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const session = await sessionsRepo.close(sessionId, cafeId);
      if (!session) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
      }
      return { session };
    },
  );
}
