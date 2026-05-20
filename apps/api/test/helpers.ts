import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

/**
 * Builds a Fastify app instance in test mode.
 * Override env vars per-test by passing `overrides`.
 */
export async function buildTestApp(
  overrides: NodeJS.ProcessEnv = {},
): Promise<FastifyInstance> {
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    PORT: '0',
    LOG_LEVEL: 'fatal',
    ...overrides,
  });

  return buildApp(env);
}
