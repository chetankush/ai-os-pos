import type { AuditLog, Cafe } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';
import type { AuditLogsRepository } from '../repositories/audit-logs.js';
import type { CafesRepository } from '../repositories/cafes.js';
import { auditLogsRoutes } from './audit-logs.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeCafe(overrides: Partial<Cafe> = {}): Cafe {
  return {
    id: CAFE_ID,
    ownerId: OWNER_ID,
    name: 'Test Cafe',
    slug: 'test-cafe',
    gstin: null,
    fssai: null,
    addressLine1: 'A',
    addressLine2: null,
    city: 'Noida',
    state: 'UP',
    pincode: '201301',
    isAirConditioned: false,
    primaryColor: null,
    logoUrl: null,
    onlinePaymentEnabled: false,
    qrPrepaidRequired: false,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    cafeId: CAFE_ID,
    actorType: 'owner',
    actorId: OWNER_ID,
    actorName: 'Owner',
    action: 'order.void',
    entityType: 'order',
    entityId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    summary: 'Voided order S-AAA111',
    metadata: { reason: 'duplicate' },
    createdAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

function createMockAuditRepo() {
  return {
    list: vi.fn(),
    record: vi.fn(),
  } satisfies AuditLogsRepository;
}

function createMockCafesRepo(cafe: Cafe | null): CafesRepository {
  return {
    create: vi.fn(),
    listByOwner: vi.fn(),
    findByIdAndOwner: vi.fn().mockResolvedValue(cafe),
    findBySlug: vi.fn(),
    update: vi.fn(),
  } satisfies CafesRepository;
}

describe('audit-logs endpoints', () => {
  let app: FastifyInstance;
  let auditRepo: ReturnType<typeof createMockAuditRepo>;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    auditRepo = createMockAuditRepo();
    await app.register(auditLogsRoutes, {
      repository: auditRepo,
      cafesRepository: createMockCafesRepo(makeCafe()),
    });
    await app.ready();
    ownerToken = app.jwt.sign(
      { sub: OWNER_ID, email: 'owner@test.in', aud: 'authenticated' },
      { expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    auditRepo.list.mockReset();
    auditRepo.record.mockReset();
  });

  describe('GET /cafes/:cafeId/audit-logs', () => {
    it('returns logs newest-first with the effective limit', async () => {
      auditRepo.list.mockResolvedValueOnce({ logs: [makeLog()], limit: 50 });
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/audit-logs`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().logs).toHaveLength(1);
      expect(res.json().limit).toBe(50);
      expect(res.json().logs[0].action).toBe('order.void');
      expect(auditRepo.list).toHaveBeenCalledWith(CAFE_ID, {
        limit: undefined,
        action: undefined,
        from: undefined,
        to: undefined,
      });
    });

    it('passes action + from/to filters through', async () => {
      auditRepo.list.mockResolvedValueOnce({ logs: [], limit: 25 });
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/audit-logs?action=order.void&limit=25&from=2026-05-01T00:00:00.000Z&to=2026-05-20T00:00:00.000Z`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(auditRepo.list).toHaveBeenCalledWith(CAFE_ID, {
        limit: 25,
        action: 'order.void',
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-20T00:00:00.000Z',
      });
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: `/cafes/${CAFE_ID}/audit-logs` });
      expect(res.statusCode).toBe(401);
    });

    it('returns 404 when the caller does not own the cafe', async () => {
      const otherApp = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
      await otherApp.register(auditLogsRoutes, {
        repository: createMockAuditRepo(),
        cafesRepository: createMockCafesRepo(null),
      });
      await otherApp.ready();
      const token = otherApp.jwt.sign(
        { sub: OWNER_ID, email: 'owner@test.in', aud: 'authenticated' },
        { expiresIn: '1h' },
      );
      const res = await otherApp.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/audit-logs`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      await otherApp.close();
    });
  });
});
