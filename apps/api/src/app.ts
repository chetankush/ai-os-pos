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
    // Key authenticated requests by their bearer token, not IP — multiple
    // cafe staff behind one restaurant NAT must not share a budget (and the
    // limiter runs before auth, so we can't use request.user here). Anonymous
    // traffic still keys by IP. Authenticated gets a higher ceiling for the
    // burst of order/status calls during a service rush.
    max: (req) => (req.headers.authorization ? 600 : 100),
    timeWindow: '1 minute',
    keyGenerator: (req) => req.headers.authorization ?? req.ip,
  });

  if (env.DATABASE_URL) {
    await app.register(dbPlugin, { databaseUrl: env.DATABASE_URL });
  } else {
    app.log.warn('DATABASE_URL not set — db-backed routes will not work');
  }

  if (env.SUPABASE_JWT_SECRET || env.SUPABASE_URL) {
    await app.register(authPlugin, {
      jwtSecret: env.SUPABASE_JWT_SECRET,
      supabaseUrl: env.SUPABASE_URL,
    });
  } else {
    app.log.warn(
      'No SUPABASE_URL or SUPABASE_JWT_SECRET set — auth-protected routes will not work',
    );
  }

  registerErrorHandler(app);
  await registerRoutes(app);

  return app;
}
