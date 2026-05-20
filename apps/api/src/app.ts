import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env.js';
import { authPlugin } from './plugins/auth.js';
import { dbPlugin } from './plugins/db.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRoutes } from './routes/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Env;
  }
}

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.LOG_LEVEL,
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
                : undefined,
          },
    disableRequestLogging: env.NODE_ENV === 'test',
    trustProxy: env.NODE_ENV === 'production',
    bodyLimit: 1024 * 1024,
  });

  app.decorate('config', env);

  await app.register(sensible);
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  if (env.DATABASE_URL) {
    await app.register(dbPlugin, { databaseUrl: env.DATABASE_URL });
  } else {
    app.log.warn('DATABASE_URL not set — db-backed routes will not work');
  }

  if (env.SUPABASE_JWT_SECRET) {
    await app.register(authPlugin, { jwtSecret: env.SUPABASE_JWT_SECRET });
  } else {
    app.log.warn('SUPABASE_JWT_SECRET not set — auth-protected routes will not work');
  }

  registerErrorHandler(app);
  await registerRoutes(app);

  return app;
}
