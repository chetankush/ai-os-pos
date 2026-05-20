import { Redis, type RedisOptions } from 'ioredis';

let client: Redis | null = null;
let initialized = false;

function getClient(): Redis | null {
  if (initialized) return client;
  initialized = true;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  const opts: RedisOptions = {
    // Lazy: don't connect until first command. Keeps tests/dev fast when
    // Redis isn't running. Errors are logged once per call, not retried forever.
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1000,
  };

  client = new Redis(url, opts);
  client.on('error', (err) => {
    // Don't crash the API if Redis is down — cache just degrades to no-op.
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[cache] redis error:', err.message);
    }
  });

  return client;
}

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
}

const noopCache: Cache = {
  async get() {
    return null;
  },
  async set() {
    /* noop */
  },
  async del() {
    /* noop */
  },
  async delByPrefix() {
    /* noop */
  },
};

export function getCache(): Cache {
  const redis = getClient();
  if (!redis) return noopCache;

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const raw = await redis.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T, ttlSeconds = 60): Promise<void> {
      try {
        await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      } catch {
        /* swallow */
      }
    },
    async del(key: string): Promise<void> {
      try {
        await redis.del(key);
      } catch {
        /* swallow */
      }
    },
    async delByPrefix(prefix: string): Promise<void> {
      try {
        // SCAN-based deletion to avoid blocking the server on large keyspaces.
        const stream = redis.scanStream({ match: `${prefix}*`, count: 100 });
        for await (const keys of stream) {
          if (keys.length > 0) await redis.del(...keys);
        }
      } catch {
        /* swallow */
      }
    },
  };
}

export function cacheKey(...parts: (string | number)[]): string {
  return parts.join(':');
}
