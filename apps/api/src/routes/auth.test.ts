import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';
import { authRoutes } from './auth.js';

// Minimal Supabase config so the route module registers itself. The real
// Supabase endpoint is never called — every test injects a mock fetch.
const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key',
};

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /auth/signup', () => {
  let app: FastifyInstance;
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchImpl = vi.fn();
    // Build with NO Supabase env — that way registerRoutes() skips registering
    // /auth/signup with real fetch. Then we patch app.config and register the
    // route directly with our mock fetch so we can assert on the call.
    app = await buildTestApp();
    (app.config as { SUPABASE_URL?: string }).SUPABASE_URL = ENV.SUPABASE_URL;
    (app.config as { SUPABASE_SECRET_KEY?: string }).SUPABASE_SECRET_KEY = ENV.SUPABASE_SECRET_KEY;
    await app.register(authRoutes, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a user and returns 201 with id + email', async () => {
    fetchImpl.mockResolvedValueOnce(
      mockResponse(200, {
        id: 'user-uuid-1',
        email: 'cafe@sangam.in',
      }),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'cafe@sangam.in', password: 'TestPass123' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      user: { id: 'user-uuid-1', email: 'cafe@sangam.in' },
    });

    // It called Supabase admin users endpoint with email_confirm: true.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/auth/v1/admin/users');
    expect(init.method).toBe('POST');
    const payload = JSON.parse(init.body as string);
    expect(payload).toMatchObject({
      email: 'cafe@sangam.in',
      password: 'TestPass123',
      email_confirm: true,
    });
  });

  it('forwards optional fullName as user_metadata.full_name', async () => {
    fetchImpl.mockResolvedValueOnce(mockResponse(200, { id: 'u', email: 'a@b.in' }));

    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'a@b.in', password: 'TestPass123', fullName: 'Anita Rao' },
    });

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(init.body as string);
    expect(payload.user_metadata).toEqual({ full_name: 'Anita Rao' });
  });

  it('lowercases and trims the email before submitting', async () => {
    fetchImpl.mockResolvedValueOnce(mockResponse(200, { id: 'u', email: 'cafe@sangam.in' }));

    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: '  Cafe@Sangam.IN  ', password: 'TestPass123' },
    });

    const payload = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(payload.email).toBe('cafe@sangam.in');
  });

  it('returns 400 when email is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'not-an-email', password: 'TestPass123' },
    });
    expect(res.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 400 when password is shorter than 8 chars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'cafe@sangam.in', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 409 when Supabase says the email is already registered', async () => {
    fetchImpl.mockResolvedValueOnce(
      mockResponse(422, {
        msg: 'A user with this email address has already been registered',
        error_code: 'email_exists',
      }),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'taken@sangam.in', password: 'TestPass123' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: { code: 'EMAIL_ALREADY_REGISTERED' },
    });
  });

  it('returns 502 when Supabase 5xx-errors', async () => {
    fetchImpl.mockResolvedValueOnce(mockResponse(503, { msg: 'service unavailable' }));

    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'cafe@sangam.in', password: 'TestPass123' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      error: { code: 'SIGNUP_FAILED' },
    });
  });
});

describe('auth routes — registration guards', () => {
  it('does not register the signup route if Supabase is not configured', async () => {
    // No SUPABASE_URL / SUPABASE_SECRET_KEY → route is a no-op.
    const app = await buildTestApp();
    await app.register(authRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'cafe@sangam.in', password: 'TestPass123' },
    });
    // Fastify returns 404 when the route doesn't exist.
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
