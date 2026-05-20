/**
 * Staff, roles, audit log, and cash-drawer (shift) domain types + API
 * request/response envelopes. Kept independent of database concerns — these are
 * the API/UI shapes. Money is integer paise throughout.
 */

import type { CafeId } from './domain.js';

// ─── Staff & roles ──────────────────────────────────────────────────────────

export type StaffId = string;
export type StaffRole = 'owner' | 'manager' | 'cashier' | 'waiter';

/** A staff member. pinHash is NEVER exposed to the API/UI. */
export interface Staff {
  id: StaffId;
  cafeId: CafeId;
  name: string;
  role: StaffRole;
  /** Whether a PIN has been set (we never return the hash itself). */
  hasPin: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStaffRequest {
  name: string;
  role: StaffRole;
  /** 4–8 digit PIN. Hashed server-side; optional at creation. */
  pin?: string;
  isActive?: boolean;
}

export interface UpdateStaffRequest {
  name?: string;
  role?: StaffRole;
  /** New 4–8 digit PIN (replaces the old one). Send null to clear it. */
  pin?: string | null;
  isActive?: boolean;
}

export interface StaffResponse {
  staff: Staff;
}

export interface StaffListResponse {
  staff: Staff[];
}

// ─── Audit log ──────────────────────────────────────────────────────────────

export type AuditActorType = 'owner' | 'staff' | 'system';

export interface AuditLog {
  id: string;
  cafeId: CafeId;
  actorType: AuditActorType;
  actorId: string | null;
  actorName: string | null;
  /** Dotted action key, e.g. 'order.void', 'discount.apply', 'staff.create'. */
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogListResponse {
  logs: AuditLog[];
  /** Echoes the effective page limit applied. */
  limit: number;
}

// ─── Cash drawer / shift ────────────────────────────────────────────────────

export type CashDrawerStatus = 'open' | 'closed';

export interface CashDrawerSession {
  id: string;
  cafeId: CafeId;
  openedByStaffId: StaffId | null;
  openingFloatPaise: number;
  closingCountedPaise: number | null;
  expectedCashPaise: number | null;
  status: CashDrawerStatus;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
}

export interface OpenDrawerRequest {
  openingFloatPaise: number;
  openedByStaffId?: string;
  notes?: string;
}

export interface CloseDrawerRequest {
  closingCountedPaise: number;
  /** Cash the system expects in the drawer; if omitted, variance is null. */
  expectedCashPaise?: number;
  notes?: string;
}

export interface CashDrawerResponse {
  /** The current drawer session, or null when none is open. */
  session: CashDrawerSession | null;
}

/** Returned on close: the closed session plus the computed variance. */
export interface CloseDrawerResponse {
  session: CashDrawerSession;
  /** closingCounted − expected (paise). Positive = over, negative = short. Null if no expected. */
  variancePaise: number | null;
}
