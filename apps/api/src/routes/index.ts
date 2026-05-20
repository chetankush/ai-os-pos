import type { FastifyInstance } from 'fastify';
import { cafesRoutes } from './cafes.js';
import { healthRoutes } from './health.js';
import { menuRoutes } from './menu.js';
import { ordersRoutes } from './orders.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);

  // All other routes require both auth and db. If either plugin failed to
  // register (missing env vars), skip them so /health still works.
  if (app.hasDecorator('db') && app.hasDecorator('authenticate')) {
    await app.register(cafesRoutes);
    await app.register(menuRoutes);
    await app.register(ordersRoutes);
  } else {
    app.log.warn(
      'protected routes not registered — requires DATABASE_URL and SUPABASE_JWT_SECRET',
    );
  }
}
