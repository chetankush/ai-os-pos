import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z, ZodError } from 'zod';
import { buildTestApp } from '../../test/helpers.js';

describe('error handler — 404', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 404 for unknown route', async () => {
    const response = await app.inject({ method: 'GET', url: '/this-route-does-not-exist' });
    expect(response.statusCode).toBe(404);
  });

  it('returns canonical error envelope for 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/missing' });
    const body = response.json();
    expect(body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Route GET /missing not found',
      },
    });
  });

  it('uses correct method in 404 message', async () => {
    const response = await app.inject({ method: 'POST', url: '/missing' });
    const body = response.json() as { error: { message: string } };
    expect(body.error.message).toBe('Route POST /missing not found');
  });
});

describe('error handler — thrown errors', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();

    app.get('/boom', async () => {
      throw new Error('something exploded');
    });

    app.get('/teapot', async (_request, reply) => {
      const err = new Error("I'm a teapot");
      (err as Error & { statusCode?: number }).statusCode = 418;
      throw err;
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('maps unhandled errors to 500 with canonical envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/boom' });
    expect(response.statusCode).toBe(500);

    const body = response.json();
    expect(body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'something exploded',
      },
    });
  });

  it('respects statusCode on thrown errors below 500', async () => {
    const response = await app.inject({ method: 'GET', url: '/teapot' });
    expect(response.statusCode).toBe(418);

    const body = response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('REQUEST_ERROR');
    expect(body.error.message).toBe("I'm a teapot");
  });
});

describe('error handler — Zod validation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();

    const bodySchema = z.object({
      name: z.string().min(1),
      age: z.number().int().nonnegative(),
    });

    app.post('/zod', async (request) => {
      const data = bodySchema.parse(request.body);
      return { received: data };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 with VALIDATION_ERROR for invalid payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/zod',
      payload: { name: '', age: -1 },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json() as {
      error: { code: string; message: string; details?: { issues: unknown[] } };
    };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Request validation failed');
    expect(body.error.details?.issues).toBeInstanceOf(Array);
    expect(body.error.details?.issues.length).toBeGreaterThanOrEqual(1);
  });

  it('accepts valid payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/zod',
      payload: { name: 'Nikhil', age: 25 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: { name: 'Nikhil', age: 25 } });
  });
});

describe('error handler — production masking', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp({ NODE_ENV: 'production' });

    app.get('/secret', async () => {
      throw new Error('database password is hunter2');
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('masks 500 error messages in production', async () => {
    const response = await app.inject({ method: 'GET', url: '/secret' });
    expect(response.statusCode).toBe(500);

    const body = response.json() as { error: { message: string } };
    expect(body.error.message).toBe('Internal server error');
    expect(body.error.message).not.toContain('hunter2');
  });
});

describe('ZodError type guard', () => {
  it('ZodError is identifiable', () => {
    const schema = z.string();
    try {
      schema.parse(123);
    } catch (err) {
      expect(err).toBeInstanceOf(ZodError);
    }
  });
});
