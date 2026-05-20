import { createDb, type Database } from '@cafespace/db';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export interface DbPluginOptions {
  databaseUrl: string;
}

/**
 * Connects to Postgres via Drizzle and decorates `app.db`. Closes the
 * underlying connection pool when Fastify shuts down.
 *
 * Tests typically skip this plugin and decorate `app.db` with a stub
 * instead — see test/helpers.ts.
 */
async function plugin(app: FastifyInstance, opts: DbPluginOptions): Promise<void> {
  const db = createDb(opts.databaseUrl);

  app.decorate('db', db);

  app.addHook('onClose', async () => {
    await db.$client.end({ timeout: 5 });
  });
}

export const dbPlugin = fp(plugin, {
  name: 'db',
  fastify: '5.x',
});
