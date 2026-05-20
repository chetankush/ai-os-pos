import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  type AuditLogsRepository,
  createDrizzleAuditLogsRepo,
} from '../repositories/audit-logs.js';
import { type CafesRepository, createDrizzleCafesRepo } from '../repositories/cafes.js';

export interface AuditLogsRoutesOptions {
  repository?: AuditLogsRepository;
  cafesRepository?: CafesRepository;
}

const cafeParamsSchema = z.object({ cafeId: z.string().uuid() });

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function auditLogsRoutes(
  app: FastifyInstance,
  opts: AuditLogsRoutesOptions = {},
): Promise<void> {
  const auditRepo = opts.repository ?? createDrizzleAuditLogsRepo(app.db);
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);

  async function ownsCafe(cafeId: string, ownerId: string): Promise<boolean> {
    return Boolean(await cafesRepo.findByIdAndOwner(cafeId, ownerId));
  }

  // ─── GET /cafes/:cafeId/audit-logs ──────────────────────────────────────────
  // Read-only window into the append-only trail. Newest first, limited, with
  // optional ?action= and ?from=&to= filters. There is intentionally NO write
  // endpoint here — entries are created via recordAudit() from server code.
  app.get('/cafes/:cafeId/audit-logs', { preHandler: app.authenticate }, async (request, reply) => {
    const { cafeId } = cafeParamsSchema.parse(request.params);
    if (!(await ownsCafe(cafeId, request.user.id))) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
    }
    const query = listQuerySchema.parse(request.query);
    const { logs, limit } = await auditRepo.list(cafeId, {
      limit: query.limit,
      action: query.action,
      from: query.from,
      to: query.to,
    });
    return { logs, limit };
  });
}
