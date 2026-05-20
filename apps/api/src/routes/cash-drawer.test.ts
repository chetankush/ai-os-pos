import type { Cafe, CashDrawerSession } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';
import type { CafesRepository } from '../repositories/cafes.js';
import type { CashDrawerRepository } from '../repositories/cash-drawer.js';
import { cashDrawerRoutes } from './cash-drawer.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DRAWER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

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
    gstMode: 'regular_5',
    primaryColor: null,
    logoUrl: null,
    onlinePaymentEnabled: false,
    qrPrepaidRequired: false,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

function makeDrawer(overrides: Partial<CashDrawerSession> = {}): CashDrawerSession {
  return {
    id: DRAWER_ID,
    cafeId: CAFE_ID,
    openedByStaffId: null,
    openingFloatPaise: 200000,
    closingCountedPaise: null,
    expectedCashPaise: null,
    status: 'open',
    openedAt: '2026-05-20T00:00:00.000Z',
    closedAt: null,
    notes: null,
    ...overrides,
  };
}

function createMockDrawerRepo() {
  return {
    findOpen: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
  } satisfies CashDrawerRepository;
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

describe('cash-drawer endpoints', () => {
  let app: FastifyInstance;
  let drawerRepo: ReturnType<typeof createMockDrawerRepo>;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    drawerRepo = createMockDrawerRepo();
    await app.register(cashDrawerRoutes, {
      repository: drawerRepo,
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
    drawerRepo.findOpen.mockReset();
    drawerRepo.open.mockReset();
    drawerRepo.close.mockReset();
  });

  describe('GET /cafes/:cafeId/cash-drawer/current', () => {
    it('returns the open session', async () => {
      drawerRepo.findOpen.mockResolvedValueOnce(makeDrawer());
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/cash-drawer/current`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().session.id).toBe(DRAWER_ID);
    });

    it('returns null when no session is open', async () => {
      drawerRepo.findOpen.mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/cash-drawer/current`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().session).toBeNull();
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: `/cafes/${CAFE_ID}/cash-drawer/current` });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /cafes/:cafeId/cash-drawer/open', () => {
    it('opens a drawer with a float', async () => {
      drawerRepo.findOpen.mockResolvedValueOnce(null);
      drawerRepo.open.mockResolvedValueOnce(makeDrawer());
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/cash-drawer/open`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { openingFloatPaise: 200000 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().session.openingFloatPaise).toBe(200000);
    });

    it('returns 409 when a drawer is already open', async () => {
      drawerRepo.findOpen.mockResolvedValueOnce(makeDrawer());
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/cash-drawer/open`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { openingFloatPaise: 200000 },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('DRAWER_ALREADY_OPEN');
      expect(drawerRepo.open).not.toHaveBeenCalled();
    });

    it('rejects a negative float', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/cash-drawer/open`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { openingFloatPaise: -100 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /cafes/:cafeId/cash-drawer/close', () => {
    it('closes the drawer and returns variance (counted − expected)', async () => {
      const closed = makeDrawer({
        status: 'closed',
        closingCountedPaise: 510000,
        expectedCashPaise: 500000,
        closedAt: '2026-05-20T08:00:00.000Z',
      });
      drawerRepo.close.mockResolvedValueOnce(closed);
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/cash-drawer/close`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { closingCountedPaise: 510000, expectedCashPaise: 500000 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().session.status).toBe('closed');
      expect(res.json().variancePaise).toBe(10000);
    });

    it('returns null variance when no expected cash is provided', async () => {
      const closed = makeDrawer({
        status: 'closed',
        closingCountedPaise: 510000,
        expectedCashPaise: null,
        closedAt: '2026-05-20T08:00:00.000Z',
      });
      drawerRepo.close.mockResolvedValueOnce(closed);
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/cash-drawer/close`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { closingCountedPaise: 510000 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().variancePaise).toBeNull();
    });

    it('returns 409 when no drawer is open', async () => {
      drawerRepo.close.mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/cash-drawer/close`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { closingCountedPaise: 510000 },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('NO_OPEN_DRAWER');
    });
  });

  describe('cafe ownership', () => {
    it('returns 404 when the caller does not own the cafe', async () => {
      const otherApp = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
      await otherApp.register(cashDrawerRoutes, {
        repository: createMockDrawerRepo(),
        cafesRepository: createMockCafesRepo(null),
      });
      await otherApp.ready();
      const token = otherApp.jwt.sign(
        { sub: OWNER_ID, email: 'owner@test.in', aud: 'authenticated' },
        { expiresIn: '1h' },
      );
      const res = await otherApp.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/cash-drawer/current`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      await otherApp.close();
    });
  });
});
