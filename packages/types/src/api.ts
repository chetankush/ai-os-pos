/**
 * API request/response envelopes shared between frontend and backend.
 * Concrete endpoint payloads live alongside their domain types.
 */

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export interface HealthResponse {
  status: 'ok';
  uptime: number;
  version: string;
  timestamp: string;
}

// ─── Cafes ────────────────────────────────────────────────────────────────────

export interface CreateCafeRequest {
  name: string;
  slug?: string;
  gstin?: string;
  fssai?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  isAirConditioned?: boolean;
  primaryColor?: string;
  logoUrl?: string;
}

export interface CafesListResponse {
  cafes: import('./domain.js').Cafe[];
}

export interface CafeResponse {
  cafe: import('./domain.js').Cafe;
}
