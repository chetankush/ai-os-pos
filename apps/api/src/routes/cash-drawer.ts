import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type CafesRepository, createDrizzleCafesRepo } from '../repositories/cafes.js';
import {
  type CashDrawerRepository,
  createDrizzleCashDrawerRepo,
} from '../repositories/cash-drawer.js';

export interface CashDrawerRoutesOptions {
  repository?: CashDrawerRepository;
  cafesRepository?: CafesRepository;
}

const cafeParamsSchema = z.object({ cafeId: z.string().uuid() });

const openDrawerBodySchema = z.object({
  openingFloatPaise: z.number().int().min(0),
  openedByStaffId: z.string().uuid().optional(),
  notes: z.string().trim().max(500).optional(),
});

const closeDrawerBodySchema = z.object({
  closingCountedPaise: z.number().int().min(0),
  expectedCashPaise: z.number().int().min(0).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function cashDrawerRoutes(
  app: FastifyInstance,
  opts: CashDrawerRoutesOptions = {},
): Promise<void> {
  const drawerRepo = opts.repository ?? createDrizzleCashDrawerRepo(app.db);
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);

  async function ownsCafe(cafeId: string, ownerId: string): Promise<boolean> {
    return Boolean(await cafesRepo.findByIdAndOwner(cafeId, ownerId));
  }

  // ─── GET /cafes/:cafeId/cash-drawer/current ─────────────────────────────────
  app.get(
    '/cafes/:cafeId/cash-drawer/current',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const session = await drawerRepo.findOpen(cafeId);
      return { session };
    },
  );

  // ─── POST /cafes/:cafeId/cash-drawer/open ───────────────────────────────────
  app.post(
    '/cafes/:cafeId/cash-drawer/open',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const body = openDrawerBodySchema.parse(request.body);

      const existing = await drawerRepo.findOpen(cafeId);
      if (existing) {
        return reply.status(409).send({
          error: {
            code: 'DRAWER_ALREADY_OPEN',
            message: 'A cash drawer session is already open. Close it before opening a new one.',
          },
        });
      }

      const session = await drawerRepo.open(cafeId, {
        openingFloatPaise: body.openingFloatPaise,
        openedByStaffId: body.openedByStaffId ?? null,
        notes: body.notes ?? null,
      });
      return reply.status(201).send({ session });
    },
  );

  // ─── POST /cafes/:cafeId/cash-drawer/close ──────────────────────────────────
  app.post(
    '/cafes/:cafeId/cash-drawer/close',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const body = closeDrawerBodySchema.parse(request.body);

      const session = await drawerRepo.close(cafeId, {
        closingCountedPaise: body.closingCountedPaise,
        expectedCashPaise: body.expectedCashPaise ?? null,
        notes: body.notes ?? null,
      });
      if (!session) {
        return reply.status(409).send({
          error: { code: 'NO_OPEN_DRAWER', message: 'There is no open cash drawer to close' },
        });
      }

      // Variance: counted − expected. Positive = over, negative = short.
      const variancePaise =
        session.expectedCashPaise === null || session.closingCountedPaise === null
          ? null
          : session.closingCountedPaise - session.expectedCashPaise;

      return { session, variancePaise };
    },
  );
}
