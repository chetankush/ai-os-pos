import type { FastifyInstance } from 'fastify';
import { aiConsoleRoutes } from './ai-console.js';
import { aiRoutes } from './ai.js';
import { auditLogsRoutes } from './audit-logs.js';
import { cafesRoutes } from './cafes.js';
import { cashDrawerRoutes } from './cash-drawer.js';
import { healthRoutes } from './health.js';
import { menuRoutes } from './menu.js';
import { ordersRoutes } from './orders.js';
import { paymentsRoutes } from './payments.js';
import { reportsRoutes } from './reports.js';
import { publicRoutes } from './public.js';
import { settleRoutes } from './settle.js';
import { staffRoutes } from './staff.js';
import { tableSessionsRoutes } from './table-sessions.js';
import { tablesRoutes } from './tables.js';
import { uploadsRoutes } from './uploads.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);

  const hasDb = app.hasDecorator('db');
  const hasAuth = app.hasDecorator('authenticate');

  // Owner (authenticated) DB routes.
  if (hasDb && hasAuth) {
    await app.register(cafesRoutes);
    await app.register(menuRoutes);
    await app.register(ordersRoutes);
    await app.register(reportsRoutes);
    await app.register(tablesRoutes);
    await app.register(tableSessionsRoutes);
    await app.register(staffRoutes);
    await app.register(auditLogsRoutes);
    await app.register(cashDrawerRoutes);
    await app.register(aiRoutes);
    await app.register(aiConsoleRoutes);
  } else {
    app.log.warn(
      'owner routes not registered — requires DATABASE_URL and SUPABASE_JWT_SECRET',
    );
  }

  // Settle + uploads need auth (no DB).
  if (hasAuth) {
    await app.register(settleRoutes);
    await app.register(uploadsRoutes);
  } else {
    app.log.warn('settle/uploads routes not registered — requires auth');
  }

  // Public QR-ordering routes need DB but NO auth (diners aren't logged in).
  if (hasDb) {
    await app.register(publicRoutes);
    await app.register(paymentsRoutes);
  }
}
