import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ApiError,
  createCafe,
  fetchHealth,
  getCafe,
  listCafes,
} from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain' },
  });
}

describe('ApiError', () => {
  it('has name "ApiError"', () => {
    const err = new ApiError(404, 'NOT_FOUND', 'Resource not found');
    expect(err.name).toBe('ApiError');
  });

  it('sets status, code, message, and details', () => {
    const details = { field: 'name' };
    const err = new ApiError(422, 'VALIDATION', 'Invalid input', details);
    expect(err.status).toBe(422);
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toBe('Invalid input');
    expect(err.details).toEqual(details);
  });

  it('is an instance of both Error and ApiError', () => {
    const err = new ApiError(500, 'INTERNAL', 'boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });

  it('allows details to be undefined', () => {
    const err = new ApiError(400, 'BAD', 'oops');
    expect(err.details).toBeUndefined();
  });
});

describe('API client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('fetchHealth', () => {
    it('GETs /health with no token and no body', async () => {
      const payload = { status: 'ok' };
      fetchMock.mockResolvedValueOnce(jsonResponse(payload));

      const result = await fetchHealth();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${API_URL}/health`);
      expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined();
      expect(init.headers).not.toHaveProperty('authorization');
      expect(init.headers).not.toHaveProperty('content-type');
      expect(init.cache).toBe('no-store');
      expect(result).toEqual(payload);
    });
  });

  describe('listCafes', () => {
    it('GETs /cafes with bearer token', async () => {
      const payload = { cafes: [] };
      fetchMock.mockResolvedValueOnce(jsonResponse(payload));

      const result = await listCafes('tok-123');

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${API_URL}/cafes`);
      expect(init.method).toBe('GET');
      expect(init.headers.authorization).toBe('Bearer tok-123');
      expect(init.body).toBeUndefined();
      expect(init.cache).toBe('no-store');
      expect(result).toEqual(payload);
    });
  });

  describe('getCafe', () => {
    it('GETs /cafes/{id} with bearer token', async () => {
      const payload = { id: 'abc', name: 'Test Cafe' };
      fetchMock.mockResolvedValueOnce(jsonResponse(payload));

      const result = await getCafe('tok-xyz', 'abc');

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${API_URL}/cafes/abc`);
      expect(init.method).toBe('GET');
      expect(init.headers.authorization).toBe('Bearer tok-xyz');
      expect(init.body).toBeUndefined();
      expect(init.cache).toBe('no-store');
      expect(result).toEqual(payload);
    });
  });

  describe('createCafe', () => {
    it('POSTs /cafes with JSON body, content-type, and bearer token', async () => {
      const body = { name: 'New Cafe' } as unknown as Parameters<typeof createCafe>[1];
      const payload = { id: 'new-id', name: 'New Cafe' };
      fetchMock.mockResolvedValueOnce(jsonResponse(payload));

      const result = await createCafe('tok-create', body);

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${API_URL}/cafes`);
      expect(init.method).toBe('POST');
      expect(init.headers['content-type']).toBe('application/json');
      expect(init.headers.authorization).toBe('Bearer tok-create');
      expect(init.body).toBe(JSON.stringify(body));
      expect(init.cache).toBe('no-store');
      expect(result).toEqual(payload);
    });
  });

  describe('response handling', () => {
    it('resolves with parsed JSON on 200 OK', async () => {
      const payload = { status: 'ok', version: '1.0' };
      fetchMock.mockResolvedValueOnce(jsonResponse(payload, 200));

      await expect(fetchHealth()).resolves.toEqual(payload);
    });

    it('resolves with undefined on 204 No Content', async () => {
      fetchMock.mockResolvedValueOnce(noContentResponse());

      await expect(fetchHealth()).resolves.toBeUndefined();
    });

    it('throws ApiError with status/code/message from JSON error body on 4xx', async () => {
      const errBody = {
        error: { code: 'NOT_FOUND', message: 'Cafe not found' },
      };
      fetchMock.mockResolvedValueOnce(jsonResponse(errBody, 404));

      await expect(getCafe('tok', 'missing')).rejects.toMatchObject({
        name: 'ApiError',
        status: 404,
        code: 'NOT_FOUND',
        message: 'Cafe not found',
      });
    });

    it('throws ApiError with status/code/message from JSON error body on 5xx', async () => {
      const errBody = {
        error: { code: 'INTERNAL', message: 'Database exploded' },
      };
      fetchMock.mockResolvedValueOnce(jsonResponse(errBody, 500));

      await expect(listCafes('tok')).rejects.toMatchObject({
        name: 'ApiError',
        status: 500,
        code: 'INTERNAL',
        message: 'Database exploded',
      });
    });

    it('forwards details from JSON error body', async () => {
      const errBody = {
        error: {
          code: 'VALIDATION',
          message: 'Invalid',
          details: { field: 'name' },
        },
      };
      fetchMock.mockResolvedValueOnce(jsonResponse(errBody, 422));

      await expect(
        createCafe('tok', { name: '' } as unknown as Parameters<typeof createCafe>[1]),
      ).rejects.toMatchObject({
        status: 422,
        code: 'VALIDATION',
        details: { field: 'name' },
      });
    });

    it('throws ApiError with HTTP_ERROR code and generic message on non-JSON 4xx body', async () => {
      fetchMock.mockResolvedValueOnce(textResponse('Bad Request', 400));

      await expect(fetchHealth()).rejects.toMatchObject({
        name: 'ApiError',
        status: 400,
        code: 'HTTP_ERROR',
        message: 'Request failed with status 400',
      });
    });

    it('throws ApiError with HTTP_ERROR code and generic message on non-JSON 5xx body', async () => {
      fetchMock.mockResolvedValueOnce(textResponse('Server Error', 503));

      await expect(fetchHealth()).rejects.toMatchObject({
        name: 'ApiError',
        status: 503,
        code: 'HTTP_ERROR',
        message: 'Request failed with status 503',
      });
    });

    it('throws an instance of ApiError (not a plain Error)', async () => {
      fetchMock.mockResolvedValueOnce(textResponse('nope', 418));

      await expect(fetchHealth()).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('AbortSignal propagation', () => {
    it('passes signal to fetch init for fetchHealth', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));
      const controller = new AbortController();

      await fetchHealth(controller.signal);

      const [, init] = fetchMock.mock.calls[0]!;
      expect(init.signal).toBe(controller.signal);
    });

    it('passes signal to fetch init for listCafes', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ cafes: [] }));
      const controller = new AbortController();

      await listCafes('tok', controller.signal);

      const [, init] = fetchMock.mock.calls[0]!;
      expect(init.signal).toBe(controller.signal);
    });

    it('passes signal to fetch init for getCafe', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'x' }));
      const controller = new AbortController();

      await getCafe('tok', 'x', controller.signal);

      const [, init] = fetchMock.mock.calls[0]!;
      expect(init.signal).toBe(controller.signal);
    });
  });

  describe('cache: no-store', () => {
    it('sets cache to no-store on fetchHealth', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));
      await fetchHealth();
      expect(fetchMock.mock.calls[0]![1].cache).toBe('no-store');
    });

    it('sets cache to no-store on listCafes', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ cafes: [] }));
      await listCafes('tok');
      expect(fetchMock.mock.calls[0]![1].cache).toBe('no-store');
    });

    it('sets cache to no-store on getCafe', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'x' }));
      await getCafe('tok', 'x');
      expect(fetchMock.mock.calls[0]![1].cache).toBe('no-store');
    });

    it('sets cache to no-store on createCafe', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'x' }));
      await createCafe('tok', { name: 'X' } as unknown as Parameters<typeof createCafe>[1]);
      expect(fetchMock.mock.calls[0]![1].cache).toBe('no-store');
    });
  });
});
