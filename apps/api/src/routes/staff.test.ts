import type { Cafe, Staff } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';
import type { CafesRepository } from '../repositories/cafes.js';
import type { StaffRepository } from '../repositories/staff.js';
import { staffRoutes } from './staff.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

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

function makeStaff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: STAFF_ID,
    cafeId: CAFE_ID,
    name: 'Asha',
    role: 'cashier',
    hasPin: false,
    isActive: true,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

function createMockStaffRepo() {
  return {
    list: vi.fn(),
    create: vi.fn(),
    findByIdAndCafe: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } satisfies StaffRepository;
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

describe('staff endpoints', () => {
  let app: FastifyInstance;
  let staffRepo: ReturnType<typeof createMockStaffRepo>;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    staffRepo = createMockStaffRepo();
    await app.register(staffRoutes, {
      repository: staffRepo,
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
    for (const fn of Object.values(staffRepo)) (fn as ReturnType<typeof vi.fn>).mockReset();
  });

  describe('GET /cafes/:cafeId/staff', () => {
    it('returns staff for the cafe', async () => {
      staffRepo.list.mockResolvedValueOnce([makeStaff()]);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/staff`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().staff).toHaveLength(1);
      expect(res.json().staff[0].id).toBe(STAFF_ID);
      // pinHash must never leak
      expect(res.json().staff[0].pinHash).toBeUndefined();
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: `/cafes/${CAFE_ID}/staff` });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /cafes/:cafeId/staff', () => {
    it('creates a staff member, hashing the PIN', async () => {
      staffRepo.create.mockResolvedValueOnce(makeStaff({ role: 'waiter', hasPin: true }));
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/staff`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Asha', role: 'waiter', pin: '1234' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().staff.hasPin).toBe(true);
      // the repo must receive a hashed pin, never the raw value
      const arg = staffRepo.create.mock.calls[0]?.[1];
      expect(arg.pinHash).toBeTypeOf('string');
      expect(arg.pinHash).not.toBe('1234');
      expect(arg.pinHash).toContain('scrypt$');
    });

    it('creates without a PIN (pinHash null)', async () => {
      staffRepo.create.mockResolvedValueOnce(makeStaff());
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/staff`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Bina', role: 'manager' },
      });
      expect(res.statusCode).toBe(201);
      expect(staffRepo.create.mock.calls[0]?.[1].pinHash).toBeNull();
    });

    it('rejects an invalid role', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/staff`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'X', role: 'chef' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a non-numeric PIN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/staff`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'X', role: 'waiter', pin: 'abcd' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 409 when the name is already taken', async () => {
      staffRepo.create.mockRejectedValueOnce({ code: '23505' });
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/staff`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Asha', role: 'waiter' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('STAFF_NAME_TAKEN');
    });
  });

  describe('PATCH /cafes/:cafeId/staff/:staffId', () => {
    it('updates name/role/isActive', async () => {
      staffRepo.update.mockResolvedValueOnce(makeStaff({ role: 'manager', isActive: false }));
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/staff/${STAFF_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { role: 'manager', isActive: false },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().staff.role).toBe('manager');
      expect(res.json().staff.isActive).toBe(false);
    });

    it('hashes a new PIN on update', async () => {
      staffRepo.update.mockResolvedValueOnce(makeStaff({ hasPin: true }));
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/staff/${STAFF_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { pin: '4321' },
      });
      expect(res.statusCode).toBe(200);
      const patch = staffRepo.update.mock.calls[0]?.[2];
      expect(patch.pinHash).toBeTypeOf('string');
      expect(patch.pinHash).toContain('scrypt$');
    });

    it('clears the PIN when pin is null', async () => {
      staffRepo.update.mockResolvedValueOnce(makeStaff({ hasPin: false }));
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/staff/${STAFF_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { pin: null },
      });
      expect(res.statusCode).toBe(200);
      expect(staffRepo.update.mock.calls[0]?.[2].pinHash).toBeNull();
    });

    it('returns 404 when the staff member is missing', async () => {
      staffRepo.update.mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'PATCH',
        url: `/cafes/${CAFE_ID}/staff/${STAFF_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'New' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /cafes/:cafeId/staff/:staffId', () => {
    it('deletes a staff member', async () => {
      staffRepo.delete.mockResolvedValueOnce(true);
      const res = await app.inject({
        method: 'DELETE',
        url: `/cafes/${CAFE_ID}/staff/${STAFF_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when nothing was deleted', async () => {
      staffRepo.delete.mockResolvedValueOnce(false);
      const res = await app.inject({
        method: 'DELETE',
        url: `/cafes/${CAFE_ID}/staff/${STAFF_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('cafe ownership', () => {
    it('returns 404 when the caller does not own the cafe', async () => {
      const otherApp = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
      await otherApp.register(staffRoutes, {
        repository: createMockStaffRepo(),
        cafesRepository: createMockCafesRepo(null),
      });
      await otherApp.ready();
      const token = otherApp.jwt.sign(
        { sub: OWNER_ID, email: 'owner@test.in', aud: 'authenticated' },
        { expiresIn: '1h' },
      );
      const res = await otherApp.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/staff`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      await otherApp.close();
    });
  });
});
