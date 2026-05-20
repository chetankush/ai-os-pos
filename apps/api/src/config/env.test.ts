import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('applies defaults when no env vars are set', () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('coerces PORT from string to number', () => {
    const env = loadEnv({ PORT: '8080' });
    expect(env.PORT).toBe(8080);
    expect(typeof env.PORT).toBe('number');
  });

  it('rejects non-numeric PORT', () => {
    expect(() => loadEnv({ PORT: 'not-a-port' })).toThrow(/Invalid environment configuration/);
  });

  it('rejects negative PORT', () => {
    expect(() => loadEnv({ PORT: '-1' })).toThrow(/Invalid environment configuration/);
  });

  it('rejects PORT above 65535', () => {
    expect(() => loadEnv({ PORT: '70000' })).toThrow(/Invalid environment configuration/);
  });

  it('accepts PORT 0 (OS-assigned)', () => {
    const env = loadEnv({ PORT: '0' });
    expect(env.PORT).toBe(0);
  });

  it('rejects invalid NODE_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/Invalid environment configuration/);
  });

  it('rejects invalid LOG_LEVEL', () => {
    expect(() => loadEnv({ LOG_LEVEL: 'verbose' })).toThrow(/Invalid environment configuration/);
  });

  it('parses CORS_ORIGINS as comma-separated list', () => {
    const env = loadEnv({ CORS_ORIGINS: 'http://a.com, http://b.com,http://c.com' });
    expect(env.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com', 'http://c.com']);
  });

  it('drops empty values from CORS_ORIGINS', () => {
    const env = loadEnv({ CORS_ORIGINS: 'http://a.com,,http://b.com,' });
    expect(env.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com']);
  });

  it('accepts a valid DATABASE_URL', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://postgres:pw@db.example.com:5432/postgres',
    });
    expect(env.DATABASE_URL).toBe('postgresql://postgres:pw@db.example.com:5432/postgres');
  });

  it('rejects an invalid DATABASE_URL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'not-a-url' })).toThrow(/Invalid environment configuration/);
  });

  it('includes every failed field name in the error message', () => {
    let message = '';
    try {
      loadEnv({ PORT: 'bad', NODE_ENV: 'staging', LOG_LEVEL: 'verbose' });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }

    expect(message).toContain('PORT');
    expect(message).toContain('NODE_ENV');
    expect(message).toContain('LOG_LEVEL');
  });
});
