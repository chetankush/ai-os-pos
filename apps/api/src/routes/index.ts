import type { FastifyInstance } from 'fastify';
import { cafesRoutes } from './cafes.js';
import { healthRoutes } from './health.js';
import { menuRoutes } from './menu.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);

  // Cafes + menu endpoints require both auth and db. If either plugin failed
  // to register (missing env vars), skip the routes so the server can still
  // serve /health for monitoring.
  if (app.hasDecorator('db') && app.hasDecorator('authenticate')) {
    await app.register(cafesRoutes);
    await app.register(menuRoutes);
  } else {
    app.log.warn(
      'cafes + menu routes not registered — requires DATABASE_URL and SUPABASE_JWT_SECRET',
    );
  }
}
