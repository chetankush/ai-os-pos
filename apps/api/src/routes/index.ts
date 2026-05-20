import type { FastifyInstance } from 'fastify';
import { cafesRoutes } from './cafes.js';
import { healthRoutes } from './health.js';
import { menuRoutes } from './menu.js';
import { ordersRoutes } from './orders.js';
import { settleRoutes } from './settle.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);

  // Cafe/menu/order routes require both auth and db.
  if (app.hasDecorator('db') && app.hasDecorator('authenticate')) {
    await app.register(cafesRoutes);
    await app.register(menuRoutes);
    await app.register(ordersRoutes);
  } else {
    app.log.warn(
      'db-backed routes not registered — requires DATABASE_URL and SUPABASE_JWT_SECRET',
    );
  }

  // Settle only needs auth (it analyzes an uploaded statement, no DB).
  if (app.hasDecorator('authenticate')) {
    await app.register(settleRoutes);
  } else {
    app.log.warn('settle routes not registered — requires SUPABASE_JWT_SECRET');
  }
}
