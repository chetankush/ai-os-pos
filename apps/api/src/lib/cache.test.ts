import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Shared mock state for the ioredis module. Hoisted so the vi.mock factory
// (which is itself hoisted above the imports) can safely reference it.
const redisMocks = vi.hoisted(() => {
  const get = vi.fn();
  const set = vi.fn();
  const del = vi.fn();
  const scanStream = vi.fn();
  const on = vi.fn();
  const ctor = vi.fn();

  // Constructor returns an object exposing the mock methods. Each `new Redis()`
  // call records its args via `ctor` so we can assert "client built only once".
  const RedisMock = vi.fn().mockImplementation((url: string, opts: unknown) => {
    ctor(url, opts);
    return { get, set, del, scanStream, on };
  });

  return { get, set, del, scanStream, on, ctor, RedisMock };
});

vi.mock('ioredis', () => ({
  Redis: redisMocks.RedisMock,
}));

beforeEach(() => {
  // Each test starts with a clean mock + module slate so the module-scoped
  // `initialized` / `client` state from cache.ts doesn't leak between tests.
  vi.resetModules();
  redisMocks.get.mockReset();
  redisMocks.set.mockReset();
  redisMocks.del.mockReset();
  redisMocks.scanStream.mockReset();
  redisMocks.on.mockReset();
  redisMocks.ctor.mockReset();
  redisMocks.RedisMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cacheKey', () => {
  it('joins parts with a colon', async () => {
    const { cacheKey } = await import('./cache.js');
    expect(cacheKey('a', 'b', 1)).toBe('a:b:1');
  });

  it('handles a single argument', async () => {
    const { cacheKey } = await import('./cache.js');
    expect(cacheKey('only')).toBe('only');
  });

  it('handles mixed string and number parts', async () => {
    const { cacheKey } = await import('./cache.js');
    expect(cacheKey('menu', 42, 'v', 7)).toBe('menu:42:v:7');
  });

  it('returns an empty string when called with no arguments', async () => {
    const { cacheKey } = await import('./cache.js');
    expect(cacheKey()).toBe('');
  });
});

describe('getCache — no-op fallback (REDIS_URL unset)', () => {
  beforeEach(() => {
    // Belt-and-braces: setup.ts doesn't define REDIS_URL, but a developer's
    // shell could. Strip it so the fallback path is exercised deterministically.
    vi.stubEnv('REDIS_URL', '');
  });

  it('get(anyKey) resolves to null', async () => {
    const { getCache } = await import('./cache.js');
    const cache = getCache();
    await expect(cache.get('anything')).resolves.toBeNull();
  });

  it('set resolves without throwing', async () => {
    const { getCache } = await import('./cache.js');
    const cache = getCache();
    await expect(cache.set('k', { a: 1 })).resolves.toBeUndefined();
  });

  it('del resolves without throwing', async () => {
    const { getCache } = await import('./cache.js');
    const cache = getCache();
    await expect(cache.del('k')).resolves.toBeUndefined();
  });

  it('delByPrefix resolves without throwing', async () => {
    const { getCache } = await import('./cache.js');
    const cache = getCache();
    await expect(cache.delByPrefix('menu:')).resolves.toBeUndefined();
  });

  it('does not instantiate the Redis client when REDIS_URL is empty', async () => {
    const { getCache } = await import('./cache.js');
    getCache();
    expect(redisMocks.RedisMock).not.toHaveBeenCalled();
  });
});

describe('getCache — real cache (REDIS_URL set)', () => {
  beforeEach(() => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
  });

  it('get returns parsed JSON when redis returns a JSON string', async () => {
    const payload = { id: 1, name: 'Mehfil' };
    redisMocks.get.mockResolvedValueOnce(JSON.stringify(payload));

    const { getCache } = await import('./cache.js');
    const cache = getCache();

    await expect(cache.get<typeof payload>('cafe:1')).resolves.toEqual(payload);
    expect(redisMocks.get).toHaveBeenCalledWith('cafe:1');
  });

  it('get returns null when redis returns null', async () => {
    redisMocks.get.mockResolvedValueOnce(null);

    const { getCache } = await import('./cache.js');
    const cache = getCache();

    await expect(cache.get('missing')).resolves.toBeNull();
  });

  it('get returns null when redis throws (errors are swallowed)', async () => {
    redisMocks.get.mockRejectedValueOnce(new Error('connection refused'));

    const { getCache } = await import('./cache.js');
    const cache = getCache();

    await expect(cache.get('boom')).resolves.toBeNull();
  });

  it('get returns null when redis returns invalid JSON (parse error swallowed)', async () => {
    redisMocks.get.mockResolvedValueOnce('not-valid-json{');

    const { getCache } = await import('./cache.js');
    const cache = getCache();

    await expect(cache.get('bad')).resolves.toBeNull();
  });

  it('set serializes value to JSON and uses default ttl of 60', async () => {
    redisMocks.set.mockResolvedValueOnce('OK');

    const { getCache } = await import('./cache.js');
    const cache = getCache();
    const value = { items: [1, 2, 3] };

    await cache.set('cart:42', value);

    expect(redisMocks.set).toHaveBeenCalledWith(
      'cart:42',
      JSON.stringify(value),
      'EX',
      60,
    );
  });

  it('set accepts a custom ttlSeconds', async () => {
    redisMocks.set.mockResolvedValueOnce('OK');

    const { getCache } = await import('./cache.js');
    const cache = getCache();

    await cache.set('cart:42', { x: 1 }, 300);

    expect(redisMocks.set).toHaveBeenCalledWith(
      'cart:42',
      JSON.stringify({ x: 1 }),
      'EX',
      300,
    );
  });

  it('set swallows errors silently', async () => {
    redisMocks.set.mockRejectedValueOnce(new Error('redis down'));

    const { getCache } = await import('./cache.js');
    const cache = getCache();

    await expect(cache.set('k', 'v')).resolves.toBeUndefined();
  });

  it('del calls redis.del with the key', async () => {
    redisMocks.del.mockResolvedValueOnce(1);

    const { getCache } = await import('./cache.js');
    const cache = getCache();

    await cache.del('cafe:1');

    expect(redisMocks.del).toHaveBeenCalledWith('cafe:1');
  });

  it('del swallows errors silently', async () => {
    redisMocks.del.mockRejectedValueOnce(new Error('boom'));

    const { getCache } = await import('./cache.js');
    const cache = getCache();

    await expect(cache.del('k')).resolves.toBeUndefined();
  });

  it('delByPrefix scans with prefix* + count 100 and deletes each non-empty batch', async () => {
    // Two batches arrive on the stream; the empty one must NOT trigger a del.
    async function* fakeStream() {
      yield ['menu:1', 'menu:2'];
      yield [];
      yield ['menu:3'];
    }
    redisMocks.scanStream.mockReturnValueOnce(fakeStream());
    redisMocks.del.mockResolvedValue(1);

    const { getCache } = await import('./cache.js');
    const cache = getCache();

    await cache.delByPrefix('menu:');

    expect(redisMocks.scanStream).toHaveBeenCalledWith({
      match: 'menu:*',
      count: 100,
    });
    expect(redisMocks.del).toHaveBeenCalledTimes(2);
    expect(redisMocks.del).toHaveBeenNthCalledWith(1, 'menu:1', 'menu:2');
    expect(redisMocks.del).toHaveBeenNthCalledWith(2, 'menu:3');
  });

  it('delByPrefix swallows scan errors silently', async () => {
    redisMocks.scanStream.mockImplementationOnce(() => {
      throw new Error('scan failed');
    });

    const { getCache } = await import('./cache.js');
    const cache = getCache();

    await expect(cache.delByPrefix('menu:')).resolves.toBeUndefined();
  });

  it('instantiates the Redis client with lazyConnect and offline-queue disabled', async () => {
    const { getCache } = await import('./cache.js');
    getCache();

    expect(redisMocks.RedisMock).toHaveBeenCalledTimes(1);
    const [url, opts] = redisMocks.RedisMock.mock.calls[0] as [
      string,
      { lazyConnect: boolean; enableOfflineQueue: boolean; maxRetriesPerRequest: number },
    ];
    expect(url).toBe('redis://localhost:6379');
    expect(opts.lazyConnect).toBe(true);
    expect(opts.enableOfflineQueue).toBe(false);
    expect(opts.maxRetriesPerRequest).toBe(1);
  });
});

describe('getCache — module-level caching', () => {
  beforeEach(() => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
  });

  it('returns functionally equivalent caches across calls without re-instantiating Redis', async () => {
    // Single module import — the `initialized` flag is module-scoped, so all
    // getCache() calls within one import share the same client.
    const { getCache } = await import('./cache.js');

    const a = getCache();
    const b = getCache();
    const c = getCache();

    // Both shaped like the Cache interface.
    for (const cache of [a, b, c]) {
      expect(typeof cache.get).toBe('function');
      expect(typeof cache.set).toBe('function');
      expect(typeof cache.del).toBe('function');
      expect(typeof cache.delByPrefix).toBe('function');
    }

    // The constructor must have fired exactly once — proving the `initialized`
    // flag short-circuits subsequent getClient() calls.
    expect(redisMocks.RedisMock).toHaveBeenCalledTimes(1);
    expect(redisMocks.ctor).toHaveBeenCalledTimes(1);

    // Functional equivalence: every cache delegates to the same underlying
    // redis.get mock, so calling `.get` on any of them hits the mock.
    redisMocks.get.mockResolvedValue(JSON.stringify({ ok: true }));
    await a.get('k');
    await b.get('k');
    await c.get('k');
    expect(redisMocks.get).toHaveBeenCalledTimes(3);
  });

  it('does not re-instantiate Redis when REDIS_URL becomes unset after first call', async () => {
    // Once `initialized` flips to true, getClient() never re-reads REDIS_URL.
    const { getCache } = await import('./cache.js');

    getCache();
    expect(redisMocks.RedisMock).toHaveBeenCalledTimes(1);

    vi.stubEnv('REDIS_URL', '');
    getCache();
    getCache();

    expect(redisMocks.RedisMock).toHaveBeenCalledTimes(1);
  });
});
