import type {
  ApiErrorResponse,
  CafeResponse,
  CafesListResponse,
  CreateCafeRequest,
  HealthResponse,
} from '@mehfil/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};

  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (opts.token) {
    headers.authorization = `Bearer ${opts.token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    let errBody: ApiErrorResponse | null = null;
    try {
      errBody = (await response.json()) as ApiErrorResponse;
    } catch {
      // non-JSON error body — fall through with generic message
    }

    throw new ApiError(
      response.status,
      errBody?.error?.code ?? 'HTTP_ERROR',
      errBody?.error?.message ?? `Request failed with status ${response.status}`,
      errBody?.error?.details,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>('GET', '/health', { signal });
}

export function listCafes(token: string, signal?: AbortSignal): Promise<CafesListResponse> {
  return request<CafesListResponse>('GET', '/cafes', { token, signal });
}

export function getCafe(
  token: string,
  id: string,
  signal?: AbortSignal,
): Promise<CafeResponse> {
  return request<CafeResponse>('GET', `/cafes/${id}`, { token, signal });
}

export function createCafe(
  token: string,
  data: CreateCafeRequest,
): Promise<CafeResponse> {
  return request<CafeResponse>('POST', '/cafes', { token, body: data });
}
