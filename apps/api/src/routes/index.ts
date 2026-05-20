import type { FastifyInstance } from 'fastify';
import { cafesRoutes } from './cafes.js';
import { healthRoutes } from './health.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);

  // Cafes endpoints require both auth and db. If either plugin failed to
  // register (missing env vars), skip the route entirely so the server can
  // still serve /health for monitoring.
  if (app.hasDecorator('db') && app.hasDecorator('authenticate')) {
    await app.register(cafesRoutes);
  } else {
    app.log.warn(
      'cafes routes not registered — requires DATABASE_URL and SUPABASE_JWT_SECRET',
    );
  }
}
