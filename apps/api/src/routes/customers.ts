import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type CafesRepository, createDrizzleCafesRepo } from '../repositories/cafes.js';
import { type CustomersRepository, createDrizzleCustomersRepo } from '../repositories/customers.js';

export interface CustomersRoutesOptions {
  repository?: CustomersRepository;
  cafesRepository?: CafesRepository;
}

const cafeParamsSchema = z.object({ cafeId: z.string().uuid() });
const customerParamsSchema = z.object({
  cafeId: z.string().uuid(),
  id: z.string().uuid(),
});
const listQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
});

export async function customersRoutes(
  app: FastifyInstance,
  opts: CustomersRoutesOptions = {},
): Promise<void> {
  const customersRepo = opts.repository ?? createDrizzleCustomersRepo(app.db);
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);

  async function ownsCafe(cafeId: string, ownerId: string): Promise<boolean> {
    return Boolean(await cafesRepo.findByIdAndOwner(cafeId, ownerId));
  }

  // ─── GET /cafes/:cafeId/customers ───────────────────────────────────────────
  app.get('/cafes/:cafeId/customers', { preHandler: app.authenticate }, async (request, reply) => {
    const { cafeId } = cafeParamsSchema.parse(request.params);
    if (!(await ownsCafe(cafeId, request.user.id))) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
    }
    const { search } = listQuerySchema.parse(request.query);
    const customers = await customersRepo.listByCafe(cafeId, search);
    return { customers };
  });

  // ─── GET /cafes/:cafeId/customers/:id ───────────────────────────────────────
  app.get(
    '/cafes/:cafeId/customers/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, id } = customerParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const customer = await customersRepo.findByIdAndCafe(id, cafeId);
      if (!customer) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Customer not found' } });
      }
      const orders = await customersRepo.recentOrdersByPhone(cafeId, customer.phone);
      return { customer, orders };
    },
  );
}
