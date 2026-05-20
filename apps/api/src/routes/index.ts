import type { FastifyInstance } from 'fastify';
import { cafesRoutes } from './cafes.js';
import { healthRoutes } from './health.js';
import { menuRoutes } from './menu.js';
import { ordersRoutes } from './orders.js';
import { settleRoutes } from './settle.js';
import { uploadsRoutes } from './uploads.js';

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

  // Settle + uploads only need auth (no DB).
  if (app.hasDecorator('authenticate')) {
    await app.register(settleRoutes);
    await app.register(uploadsRoutes);
  } else {
    app.log.warn('settle/uploads routes not registered — requires auth');
  }
}
