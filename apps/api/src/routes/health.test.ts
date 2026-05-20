import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });

  it('returns JSON content-type', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['content-type']).toMatch(/application\/json/);
  });

  it('returns expected shape', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json();

    expect(body).toMatchObject({
      status: 'ok',
      version: expect.any(String),
      timestamp: expect.any(String),
      uptime: expect.any(Number),
    });
  });

  it('returns a non-negative uptime', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json() as { uptime: number };
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('returns an ISO-8601 timestamp', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json() as { timestamp: string };
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
