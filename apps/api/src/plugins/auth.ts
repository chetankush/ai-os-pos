import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  role: string;
}

/**
 * Shape Supabase puts in its access token. We only depend on the canonical
 * JWT claims (sub, email, role); extra fields are ignored.
 */
interface SupabaseJwtPayload {
  sub?: string;
  email?: string;
  role?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: SupabaseJwtPayload;
    user: AuthenticatedUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  jwtSecret: string;
}

async function plugin(app: FastifyInstance, opts: AuthPluginOptions): Promise<void> {
  await app.register(jwt, {
    secret: opts.jwtSecret,
    sign: { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });

  app.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        const payload = await request.jwtVerify<SupabaseJwtPayload>();

        if (!payload.sub) {
          return reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Token missing subject claim',
            },
          });
        }

        request.user = {
          id: payload.sub,
          email: payload.email ?? null,
          role: payload.role ?? 'authenticated',
        };
      } catch (err) {
        const message =
          err instanceof Error && err.message.includes('expired')
            ? 'Token expired'
            : 'Invalid or missing authentication token';

        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message,
          },
        });
      }
    },
  );
}

export const authPlugin = fp(plugin, {
  name: 'auth',
  fastify: '5.x',
});
