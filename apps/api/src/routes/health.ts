import type { FastifyInstance } from 'fastify';

const startedAt = Date.now();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return {
      status: 'ok' as const,
      uptime: Math.round((Date.now() - startedAt) / 1000),
      version: process.env.npm_package_version ?? '0.0.1',
      timestamp: new Date().toISOString(),
    };
  });
}
