import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from 'jose';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  role: string;
}

/**
 * Shape Supabase puts in its access token. We only depend on the canonical
 * JWT claims (sub, email, role); extra fields are ignored.
 */
interface SupabaseJwtPayload extends JWTPayload {
  email?: string;
  role?: string;
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
  /** Legacy HS256 shared secret. Used for HS256 tokens (tests, legacy projects). */
  jwtSecret?: string;
  /** Supabase project URL. Enables ES256/RS256 verification via the JWKS endpoint. */
  supabaseUrl?: string;
}

const AUDIENCE = 'authenticated';

function isAudienceValid(aud: JWTPayload['aud']): boolean {
  return aud === AUDIENCE || (Array.isArray(aud) && aud.includes(AUDIENCE));
}

/**
 * Supabase projects sign access tokens with EITHER:
 *  - HS256 + the legacy shared JWT secret, or
 *  - an asymmetric key (ES256/RS256) exposed via the project's JWKS endpoint.
 *
 * Newer projects (and this one) use asymmetric keys, so we verify by algorithm:
 * HS256 tokens against the shared secret (also what the test suite signs), and
 * asymmetric tokens against the cached remote JWKS.
 */
async function plugin(app: FastifyInstance, opts: AuthPluginOptions): Promise<void> {
  if (opts.jwtSecret) {
    await app.register(jwt, {
      secret: opts.jwtSecret,
      sign: { algorithm: 'HS256' },
      verify: { algorithms: ['HS256'] },
    });
  }

  // Lazily-fetched, auto-cached, rotation-aware JWKS for asymmetric tokens.
  const jwks = opts.supabaseUrl
    ? createRemoteJWKSet(
        new URL(`${opts.supabaseUrl}/auth/v1/.well-known/jwks.json`),
      )
    : null;
  const issuer = opts.supabaseUrl ? `${opts.supabaseUrl}/auth/v1` : undefined;

  app.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const unauthorized = (message: string) =>
        reply.status(401).send({ error: { code: 'UNAUTHORIZED', message } });

      const header = request.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        return unauthorized('Invalid or missing authentication token');
      }
      const token = header.slice('Bearer '.length).trim();

      let payload: SupabaseJwtPayload;
      try {
        const { alg } = decodeProtectedHeader(token);

        if (alg === 'HS256') {
          if (!opts.jwtSecret) throw new Error('HS256 not configured');
          // @fastify/jwt reads the token from the Authorization header itself.
          payload = await request.jwtVerify<SupabaseJwtPayload>();
        } else {
          if (!jwks) throw new Error('Asymmetric verification not configured');
          const { payload: verified } = await jwtVerify(token, jwks, {
            audience: AUDIENCE,
            ...(issuer ? { issuer } : {}),
          });
          payload = verified as SupabaseJwtPayload;
        }
      } catch (err) {
        const expired =
          err instanceof Error && /exp|expired/i.test(err.message);
        return unauthorized(
          expired ? 'Token expired' : 'Invalid or missing authentication token',
        );
      }

      if (!payload.sub) {
        return unauthorized('Token missing subject claim');
      }
      // jose already enforces audience for the asymmetric path; this also covers
      // the HS256 path so a non-user token (aud != "authenticated") is rejected.
      if (!isAudienceValid(payload.aud)) {
        return unauthorized('Invalid token audience');
      }

      request.user = {
        id: payload.sub,
        email: payload.email ?? null,
        role: payload.role ?? 'authenticated',
      };
    },
  );
}

export const authPlugin = fp(plugin, {
  name: 'auth',
  fastify: '5.x',
});
