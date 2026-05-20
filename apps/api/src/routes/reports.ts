import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isValidIsoDate, todayIstDate } from '../reports/date-range.js';
import { type CafesRepository, createDrizzleCafesRepo } from '../repositories/cafes.js';
import { type ReportsRepository, createDrizzleReportsRepo } from '../repositories/reports.js';

export interface ReportsRoutesOptions {
  repository?: ReportsRepository;
  cafesRepository?: CafesRepository;
}

const cafeParamsSchema = z.object({ cafeId: z.string().uuid() });

const isoDate = z.string().refine(isValidIsoDate, {
  message: 'date must be a valid YYYY-MM-DD',
});

const dayEndQuerySchema = z.object({
  date: isoDate.optional(),
});

const salesQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  groupBy: z.enum(['item', 'category', 'hour']).default('item'),
});

export async function reportsRoutes(
  app: FastifyInstance,
  opts: ReportsRoutesOptions = {},
): Promise<void> {
  const reportsRepo = opts.repository ?? createDrizzleReportsRepo(app.db);
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);

  async function getOwnedCafe(cafeId: string, ownerId: string) {
    return cafesRepo.findByIdAndOwner(cafeId, ownerId);
  }

  // ─── GET /cafes/:cafeId/reports/day-end ─────────────────────────────────────

  app.get(
    '/cafes/:cafeId/reports/day-end',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);
      if (!(await getOwnedCafe(cafeId, request.user.id))) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Cafe not found' },
        });
      }

      const { date } = dayEndQuerySchema.parse(request.query);
      const businessDay = date ?? todayIstDate();
      const report = await reportsRepo.dayEnd(cafeId, businessDay);
      return { report };
    },
  );

  // ─── GET /cafes/:cafeId/reports/sales ───────────────────────────────────────

  app.get(
    '/cafes/:cafeId/reports/sales',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);
      if (!(await getOwnedCafe(cafeId, request.user.id))) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Cafe not found' },
        });
      }

      const { from, to, groupBy } = salesQuerySchema.parse(request.query);
      const today = todayIstDate();
      // Default to "today" for either bound; allow a one-sided range to expand.
      const fromDate = from ?? to ?? today;
      const toDate = to ?? from ?? today;
      if (fromDate > toDate) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_RANGE',
            message: '`from` must not be after `to`',
          },
        });
      }

      const rows = await reportsRepo.sales(cafeId, fromDate, toDate, groupBy);
      return { groupBy, from: fromDate, to: toDate, rows };
    },
  );
}
