import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

/**
 * Signup is a thin pass-through to Supabase's admin API. We use the service
 * key to create the user with `email_confirm: true` so the very first sign-in
 * works immediately — no inbox-roundtrip required for a cafe owner to onboard.
 *
 * If Supabase isn't configured (e.g. tests with only DB), the route is not
 * registered — callers get the standard 404 / "Route not found".
 *
 * The admin call uses the service key on the SERVER ONLY; the publishable
 * (anon) key is what the browser uses. Once the user exists, the browser logs
 * in via the normal Supabase password grant, so we don't need to mint or
 * forward any tokens here.
 */

export interface AuthRoutesOptions {
  /** Lets tests override fetch (call counts, error simulation). */
  fetchImpl?: typeof fetch;
}

const signupBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
  fullName: z.string().trim().max(120).optional(),
});

interface SupabaseAdminUser {
  id: string;
  email: string;
}

interface SupabaseAdminError {
  msg?: string;
  message?: string;
  error_code?: string;
  code?: string | number;
}

export async function authRoutes(
  app: FastifyInstance,
  opts: AuthRoutesOptions = {},
): Promise<void> {
  const supabaseUrl = app.config.SUPABASE_URL;
  const secretKey = app.config.SUPABASE_SECRET_KEY;
  const doFetch = opts.fetchImpl ?? fetch;

  if (!supabaseUrl || !secretKey) {
    app.log.warn(
      'auth signup route not registered — requires SUPABASE_URL and SUPABASE_SECRET_KEY',
    );
    return;
  }

  app.post(
    '/auth/signup',
    {
      // Tight ceiling — signup is anonymous and abuseable. Keyed by IP via the
      // default keyGenerator (no Authorization header here).
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (request, reply) => {
      const body = signupBodySchema.parse(request.body);

      const res = await doFetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          apikey: secretKey,
          authorization: `Bearer ${secretKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: body.email,
          password: body.password,
          email_confirm: true,
          user_metadata: body.fullName ? { full_name: body.fullName } : undefined,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as SupabaseAdminUser | SupabaseAdminError;

      if (!res.ok) {
        const err = json as SupabaseAdminError;
        const msg = err.msg ?? err.message ?? 'Could not create your account';
        // Supabase returns 422 for "User already registered" — map to 409 so
        // the client can present a clearer "already have an account?" message.
        const alreadyExists =
          /already|exists|registered/i.test(msg) || err.error_code === 'email_exists';

        if (alreadyExists) {
          return reply.status(409).send({
            error: {
              code: 'EMAIL_ALREADY_REGISTERED',
              message: 'An account with that email already exists. Try signing in.',
            },
          });
        }

        request.log.error({ status: res.status, err }, 'signup admin call failed');
        return reply.status(res.status >= 500 ? 502 : 400).send({
          error: { code: 'SIGNUP_FAILED', message: msg },
        });
      }

      const user = json as SupabaseAdminUser;
      return reply.status(201).send({
        user: { id: user.id, email: user.email },
      });
    },
  );
}
