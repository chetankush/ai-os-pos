import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OTHER_SECRET = 'a-different-secret-not-our-app';

interface SignArgs {
  sub?: string;
  email?: string;
  role?: string;
  expiresIn?: number | string;
  secret?: string;
}

async function signTestToken(app: FastifyInstance, args: SignArgs = {}): Promise<string> {
  const payload = {
    sub: args.sub ?? '11111111-1111-1111-1111-111111111111',
    email: args.email ?? 'nikhil@mehfil.in',
    role: args.role ?? 'authenticated',
    aud: 'authenticated',
  };

  if (args.secret) {
    // Sign with a different secret — build a throwaway app with that secret.
    const other = await buildTestApp({ SUPABASE_JWT_SECRET: args.secret });
    other.get('/__protected', { preHandler: other.authenticate }, async () => ({ ok: true }));
    await other.ready();
    const token = other.jwt.sign(payload, { expiresIn: args.expiresIn ?? '1h' });
    await other.close();
    return token;
  }

  return app.jwt.sign(payload, { expiresIn: args.expiresIn ?? '1h' });
}

describe('auth plugin', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });

    app.get('/me', { preHandler: app.authenticate }, async (request) => {
      return { user: request.user };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects missing Authorization header with 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/me' });
    expect(response.statusCode).toBe(401);

    const body = response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'not-a-valid-format' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects garbage token with 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer not.a.real.jwt' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects token signed with wrong secret', async () => {
    const token = await signTestToken(app, { secret: OTHER_SECRET });
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects expired token with appropriate message', async () => {
    // Set exp claim directly to a past timestamp — fast-jwt rejects negative
    // expiresIn options, so we craft the claim by hand.
    const nowSec = Math.floor(Date.now() / 1000);
    const token = app.jwt.sign({
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'expired@mehfil.in',
      iat: nowSec - 120,
      exp: nowSec - 60,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json() as { error: { message: string } };
    expect(body.error.message).toMatch(/expired/i);
  });

  it('rejects token missing sub claim', async () => {
    // Sign payload without sub — @fastify/jwt allows arbitrary payloads.
    const token = app.jwt.sign({ email: 'no-sub@example.com' }, { expiresIn: '1h' });
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json() as { error: { message: string } };
    expect(body.error.message).toMatch(/subject/i);
  });

  it('rejects a token with the wrong audience', async () => {
    // A non-user token (e.g. aud="anon") signed with the same secret must not
    // be accepted as an authenticated user.
    const token = app.jwt.sign(
      { sub: '55555555-5555-5555-5555-555555555555', email: 'anon@x.com', aud: 'anon' },
      { expiresIn: '1h' },
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json() as { error: { message: string } };
    expect(body.error.message).toMatch(/audience/i);
  });

  it('accepts a valid token and populates request.user', async () => {
    const token = await signTestToken(app, {
      sub: '22222222-2222-2222-2222-222222222222',
      email: 'owner@mehfil.in',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'owner@mehfil.in',
        role: 'authenticated',
      },
    });
  });

  it('defaults role to "authenticated" when missing from token', async () => {
    const token = app.jwt.sign(
      { sub: '33333333-3333-3333-3333-333333333333', email: 'r@x.com', aud: 'authenticated' },
      { expiresIn: '1h' },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });

    const body = response.json() as { user: { role: string } };
    expect(body.user.role).toBe('authenticated');
  });

  it('preserves a custom role from the token', async () => {
    const token = app.jwt.sign(
      {
        sub: '44444444-4444-4444-4444-444444444444',
        email: 'staff@mehfil.in',
        role: 'staff',
        aud: 'authenticated',
      },
      { expiresIn: '1h' },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });

    const body = response.json() as { user: { role: string } };
    expect(body.user.role).toBe('staff');
  });
});
