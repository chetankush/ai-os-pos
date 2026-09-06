import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isValidIsoDate, todayIstDate } from '../reports/date-range.js';
import { type CafesRepository, createDrizzleCafesRepo } from '../repositories/cafes.js';
import { type ExpensesRepository, createDrizzleExpensesRepo } from '../repositories/expenses.js';

export interface ExpensesRoutesOptions {
  repository?: ExpensesRepository;
  cafesRepository?: CafesRepository;
}

const cafeParamsSchema = z.object({ cafeId: z.string().uuid() });
const expenseParamsSchema = z.object({
  cafeId: z.string().uuid(),
  id: z.string().uuid(),
});

const expenseCategorySchema = z.enum([
  'rent',
  'salary',
  'supplies',
  'utilities',
  'marketing',
  'other',
]);

const isoDate = z.string().refine(isValidIsoDate, {
  message: 'date must be a valid YYYY-MM-DD',
});

const rangeQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

const createBodySchema = z.object({
  category: expenseCategorySchema,
  amountPaise: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
  incurredOn: isoDate,
});

const updateBodySchema = z
  .object({
    category: expenseCategorySchema.optional(),
    amountPaise: z.number().int().positive().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    incurredOn: isoDate.optional(),
  })
  // A PATCH with no fields is a no-op — reject it so the caller gets feedback.
  .refine((b) => Object.keys(b).length > 0, {
    message: 'Provide at least one field to update',
  });

export async function expensesRoutes(
  app: FastifyInstance,
  opts: ExpensesRoutesOptions = {},
): Promise<void> {
  const expensesRepo = opts.repository ?? createDrizzleExpensesRepo(app.db);
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);

  async function ownsCafe(cafeId: string, ownerId: string): Promise<boolean> {
    return Boolean(await cafesRepo.findByIdAndOwner(cafeId, ownerId));
  }

  /** Resolve a [from, to] window, defaulting either bound and rejecting from > to. */
  function resolveRange(
    from: string | undefined,
    to: string | undefined,
  ): { fromDate: string; toDate: string } | null {
    const today = todayIstDate();
    const fromDate = from ?? to ?? today;
    const toDate = to ?? from ?? today;
    if (fromDate > toDate) return null;
    return { fromDate, toDate };
  }

  // ─── GET /cafes/:cafeId/expenses/summary ────────────────────────────────────
  // Registered before the list route is fine (different path), but keep summary
  // first to make the per-category aggregation intent obvious.
  app.get(
    '/cafes/:cafeId/expenses/summary',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = cafeParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }

      const { from, to } = rangeQuerySchema.parse(request.query);
      const range = resolveRange(from, to);
      if (!range) {
        return reply.status(400).send({
          error: { code: 'INVALID_RANGE', message: '`from` must not be after `to`' },
        });
      }

      const byCategory = await expensesRepo.summary(cafeId, range.fromDate, range.toDate);
      const grandTotalPaise = byCategory.reduce((sum, c) => sum + c.totalPaise, 0);
      return { from: range.fromDate, to: range.toDate, byCategory, grandTotalPaise };
    },
  );

  // ─── GET /cafes/:cafeId/expenses ────────────────────────────────────────────
  app.get('/cafes/:cafeId/expenses', { preHandler: app.authenticate }, async (request, reply) => {
    const { cafeId } = cafeParamsSchema.parse(request.params);
    if (!(await ownsCafe(cafeId, request.user.id))) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
    }

    const { from, to } = rangeQuerySchema.parse(request.query);
    const range = resolveRange(from, to);
    if (!range) {
      return reply.status(400).send({
        error: { code: 'INVALID_RANGE', message: '`from` must not be after `to`' },
      });
    }

    const expenses = await expensesRepo.list(cafeId, range.fromDate, range.toDate);
    return { expenses, from: range.fromDate, to: range.toDate };
  });

  // ─── POST /cafes/:cafeId/expenses ───────────────────────────────────────────
  app.post('/cafes/:cafeId/expenses', { preHandler: app.authenticate }, async (request, reply) => {
    const { cafeId } = cafeParamsSchema.parse(request.params);
    if (!(await ownsCafe(cafeId, request.user.id))) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
    }

    const body = createBodySchema.parse(request.body);
    const expense = await expensesRepo.create(cafeId, {
      category: body.category,
      amountPaise: body.amountPaise,
      note: body.note ?? null,
      incurredOn: body.incurredOn,
    });
    return reply.status(201).send({ expense });
  });

  // ─── PATCH /cafes/:cafeId/expenses/:id ──────────────────────────────────────
  app.patch(
    '/cafes/:cafeId/expenses/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, id } = expenseParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }

      const body = updateBodySchema.parse(request.body);
      const expense = await expensesRepo.update(cafeId, id, body);
      if (!expense) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Expense not found' } });
      }
      return { expense };
    },
  );

  // ─── DELETE /cafes/:cafeId/expenses/:id ─────────────────────────────────────
  app.delete(
    '/cafes/:cafeId/expenses/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, id } = expenseParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }

      const removed = await expensesRepo.remove(cafeId, id);
      if (!removed) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Expense not found' } });
      }
      return reply.status(204).send();
    },
  );
}
