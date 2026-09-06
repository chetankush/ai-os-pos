import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { askWaiter } from '../ai/waiter.js';
import { type CafesRepository, createDrizzleCafesRepo } from '../repositories/cafes.js';
import { type MenuRepository, createDrizzleMenuRepo } from '../repositories/menu.js';

export interface AiRoutesOptions {
  cafesRepository?: CafesRepository;
  menuRepository?: MenuRepository;
}

const paramsSchema = z.object({ cafeId: z.string().uuid() });
const bodySchema = z.object({
  message: z.string().trim().min(1).max(500),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      }),
    )
    .max(10)
    .optional(),
});

export async function aiRoutes(app: FastifyInstance, opts: AiRoutesOptions = {}): Promise<void> {
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);
  const menuRepo = opts.menuRepository ?? createDrizzleMenuRepo(app.db);

  app.post('/cafes/:cafeId/ai-waiter', { preHandler: app.authenticate }, async (request, reply) => {
    const { cafeId } = paramsSchema.parse(request.params);
    const cafe = await cafesRepo.findByIdAndOwner(cafeId, request.user.id);
    if (!cafe) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Cafe not found' },
      });
    }

    const apiKey = app.config.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return reply.status(503).send({
        error: { code: 'AI_UNCONFIGURED', message: 'AI waiter is not configured' },
      });
    }

    const body = bodySchema.parse(request.body);
    const menu = await menuRepo.getFullMenu(cafeId);

    try {
      return await askWaiter(
        {
          apiKey,
          baseUrl: app.config.DEEPSEEK_BASE_URL,
          model: app.config.DEEPSEEK_MODEL,
        },
        cafe,
        menu,
        body.message,
        body.history ?? [],
      );
    } catch (err) {
      app.log.error({ err }, 'ai-waiter provider error (owner preview)');
      return reply.status(502).send({
        error: {
          code: 'AI_UPSTREAM_ERROR',
          message: 'The AI waiter is temporarily unavailable.',
        },
      });
    }
  });
}
