import type { Cafe } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CafesRepository, NewCafe } from '../repositories/cafes.js';
import { buildTestApp } from '../../test/helpers.js';
import { cafesRoutes } from './cafes.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';

function makeCafe(overrides: Partial<Cafe> = {}): Cafe {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    ownerId: OWNER_ID,
    name: 'Sector 15 Cafe',
    slug: 'sector-15-cafe',
    gstin: null,
    fssai: null,
    addressLine1: 'Plot 1, Sector 15',
    addressLine2: null,
    city: 'Noida',
    state: 'UP',
    pincode: '201301',
    isAirConditioned: false,
    primaryColor: null,
    logoUrl: null,
    onlinePaymentEnabled: false,
    qrPrepaidRequired: false,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...overrides,
  };
}

function createMockRepo() {
  return {
    create: vi.fn<(data: NewCafe) => Promise<Cafe>>(),
    listByOwner: vi.fn<(ownerId: string) => Promise<Cafe[]>>(),
    findByIdAndOwner: vi.fn<(id: string, ownerId: string) => Promise<Cafe | null>>(),
    findBySlug: vi.fn<(slug: string) => Promise<Cafe | null>>(),
    update: vi.fn<(id: string, ownerId: string, patch: object) => Promise<Cafe | null>>(),
  } satisfies CafesRepository;
}

describe('cafes endpoints', () => {
  let app: FastifyInstance;
  let repo: ReturnType<typeof createMockRepo>;
  let ownerToken: string;
  let otherToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    repo = createMockRepo();
    await app.register(cafesRoutes, { repository: repo });
    await app.ready();

    ownerToken = app.jwt.sign(
      { sub: OWNER_ID, email: 'owner@sangam.in', aud: 'authenticated' },
      { expiresIn: '1h' },
    );
    otherToken = app.jwt.sign(
      { sub: OTHER_ID, email: 'other@sangam.in', aud: 'authenticated' },
      { expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    repo.create.mockReset();
    repo.listByOwner.mockReset();
    repo.findByIdAndOwner.mockReset();
    repo.update.mockReset();
  });

  // ─── POST /cafes ────────────────────────────────────────────────────────────

  describe('POST /cafes', () => {
    const validBody = {
      name: 'Sector 15 Cafe',
      addressLine1: 'Plot 1',
      city: 'Noida',
      state: 'UP',
      pincode: '201301',
    };

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/cafes',
        payload: validBody,
      });
      expect(response.statusCode).toBe(401);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('creates a cafe and returns 201', async () => {
      const created = makeCafe();
      repo.create.mockResolvedValue(created);

      const response = await app.inject({
        method: 'POST',
        url: '/cafes',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: validBody,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ cafe: created });
      expect(repo.create).toHaveBeenCalledTimes(1);
    });

    it('uses the authenticated user as ownerId', async () => {
      repo.create.mockResolvedValue(makeCafe());

      await app.inject({
        method: 'POST',
        url: '/cafes',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: validBody,
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: OWNER_ID }),
      );
    });

    it('auto-generates slug from name when none provided', async () => {
      repo.create.mockResolvedValue(makeCafe());

      await app.inject({
        method: 'POST',
        url: '/cafes',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { ...validBody, name: 'The Cozy Brew' },
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'the-cozy-brew' }),
      );
    });

    it('uses provided slug when given', async () => {
      repo.create.mockResolvedValue(makeCafe());

      await app.inject({
        method: 'POST',
        url: '/cafes',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { ...validBody, slug: 'custom-slug' },
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'custom-slug' }),
      );
    });

    it('returns 400 when required fields are missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/cafes',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid pincode', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/cafes',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { ...validBody, pincode: '12345' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid hex color', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/cafes',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { ...validBody, primaryColor: 'orange' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 409 when slug already exists', async () => {
      repo.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }));

      const response = await app.inject({
        method: 'POST',
        url: '/cafes',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: validBody,
      });

      expect(response.statusCode).toBe(409);
      const body = response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('SLUG_TAKEN');
      expect(body.error.message).toContain('sector-15-cafe');
    });

    it('rejects names that slugify to less than 2 characters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/cafes',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { ...validBody, name: '!!' },
      });

      expect(response.statusCode).toBe(400);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  // ─── GET /cafes ─────────────────────────────────────────────────────────────

  describe('GET /cafes', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({ method: 'GET', url: '/cafes' });
      expect(response.statusCode).toBe(401);
      expect(repo.listByOwner).not.toHaveBeenCalled();
    });

    it("returns the authenticated user's cafes", async () => {
      const cafes = [
        makeCafe({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Cafe A' }),
        makeCafe({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Cafe B' }),
      ];
      repo.listByOwner.mockResolvedValue(cafes);

      const response = await app.inject({
        method: 'GET',
        url: '/cafes',
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ cafes });
      expect(repo.listByOwner).toHaveBeenCalledWith(OWNER_ID);
    });

    it('scopes listing by authenticated user id', async () => {
      repo.listByOwner.mockResolvedValue([]);

      await app.inject({
        method: 'GET',
        url: '/cafes',
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(repo.listByOwner).toHaveBeenCalledWith(OTHER_ID);
      expect(repo.listByOwner).not.toHaveBeenCalledWith(OWNER_ID);
    });

    it('returns empty array when user has no cafes', async () => {
      repo.listByOwner.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/cafes',
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(response.json()).toEqual({ cafes: [] });
    });
  });

  // ─── GET /cafes/:id ─────────────────────────────────────────────────────────

  describe('GET /cafes/:id', () => {
    const validId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    it('returns 401 without authentication', async () => {
      const response = await app.inject({ method: 'GET', url: `/cafes/${validId}` });
      expect(response.statusCode).toBe(401);
    });

    it('returns the cafe when found and owned by user', async () => {
      const cafe = makeCafe();
      repo.findByIdAndOwner.mockResolvedValue(cafe);

      const response = await app.inject({
        method: 'GET',
        url: `/cafes/${validId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ cafe });
      expect(repo.findByIdAndOwner).toHaveBeenCalledWith(validId, OWNER_ID);
    });

    it('returns 404 when cafe not found', async () => {
      repo.findByIdAndOwner.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/cafes/${validId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: { code: 'NOT_FOUND', message: 'Cafe not found' },
      });
    });

    it('returns 404 (not 403) when cafe owned by another user — no existence leak', async () => {
      // Repository scopes by ownerId so it returns null even though the row
      // exists in the database under a different owner. The endpoint must
      // not differentiate "not found" from "not yours".
      repo.findByIdAndOwner.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/cafes/${validId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(404);
      expect(repo.findByIdAndOwner).toHaveBeenCalledWith(validId, OTHER_ID);
    });

    it('returns 400 for invalid uuid', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/cafes/not-a-uuid',
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(response.statusCode).toBe(400);
      expect(repo.findByIdAndOwner).not.toHaveBeenCalled();
    });
  });

  // ─── PATCH /cafes/:id ─────────────────────────────────────────────────────────

  describe('PATCH /cafes/:id', () => {
    const validId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    it('updates the cafe and returns it', async () => {
      const updated = makeCafe({ name: 'Renamed Cafe', logoUrl: 'https://x.test/logo.png' });
      repo.update.mockResolvedValue(updated);

      const response = await app.inject({
        method: 'PATCH',
        url: `/cafes/${validId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Renamed Cafe', logoUrl: 'https://x.test/logo.png' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().cafe.name).toBe('Renamed Cafe');
      expect(repo.update).toHaveBeenCalledWith(
        validId,
        OWNER_ID,
        expect.objectContaining({ name: 'Renamed Cafe' }),
      );
    });

    it('scopes the update to the authenticated owner', async () => {
      repo.update.mockResolvedValue(null); // not owned → repo returns null
      const response = await app.inject({
        method: 'PATCH',
        url: `/cafes/${validId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { name: 'Hijack' },
      });
      expect(response.statusCode).toBe(404);
      expect(repo.update).toHaveBeenCalledWith(validId, OTHER_ID, expect.any(Object));
    });

    it('allows clearing optional fields with null', async () => {
      repo.update.mockResolvedValue(makeCafe({ gstin: null }));
      const response = await app.inject({
        method: 'PATCH',
        url: `/cafes/${validId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { gstin: null },
      });
      expect(response.statusCode).toBe(200);
    });

    it('rejects an invalid pincode', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/cafes/${validId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { pincode: '12' },
      });
      expect(response.statusCode).toBe(400);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/cafes/${validId}`,
        payload: { name: 'X' },
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
