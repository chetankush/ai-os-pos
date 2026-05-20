import type {
  Cafe,
  OrderWithItems,
  RestaurantTable,
  TableSession,
  TableSessionDetail,
  TableWithStatus,
} from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';
import type { CafesRepository } from '../repositories/cafes.js';
import type { NewTableSession, TableSessionsRepository } from '../repositories/table-sessions.js';
import { tableSessionsRoutes } from './table-sessions.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TABLE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SESSION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ORDER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

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

function makeTable(overrides: Partial<RestaurantTable> = {}): RestaurantTable {
  return {
    id: TABLE_ID,
    cafeId: CAFE_ID,
    label: 'T1',
    area: null,
    shape: 'square',
    seats: 4,
    x: 0,
    y: 0,
    sortOrder: 0,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

function makeSession(overrides: Partial<TableSession> = {}): TableSession {
  return {
    id: SESSION_ID,
    cafeId: CAFE_ID,
    tableId: TABLE_ID,
    status: 'open',
    guestName: null,
    guestPhone: null,
    partySize: null,
    openedAt: '2026-05-20T00:00:00.000Z',
    closedAt: null,
    ...overrides,
  };
}

function makeOrderWithItems(overrides: Partial<OrderWithItems> = {}): OrderWithItems {
  return {
    id: ORDER_ID,
    cafeId: CAFE_ID,
    orderNumber: 'S-AAA111',
    status: 'ready',
    source: 'counter',
    tableLabel: null,
    tableSessionId: SESSION_ID,
    customerName: null,
    customerPhone: null,
    notes: null,
    subtotalPaise: 30000,
    taxPaise: 1500,
    totalPaise: 31500,
    gstRateBp: 500,
    paymentMethod: null,
    paymentStatus: 'unpaid',
    providerOrderId: null,
    providerPaymentId: null,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    paidAt: null,
    items: [],
    ...overrides,
  };
}

function makeDetail(overrides: Partial<TableSessionDetail> = {}): TableSessionDetail {
  return {
    session: makeSession(),
    table: makeTable(),
    orders: [makeOrderWithItems()],
    subtotalPaise: 30000,
    taxPaise: 1500,
    totalPaise: 31500,
    ...overrides,
  };
}

function createMockSessionsRepo() {
  return {
    open: vi.fn<(data: NewTableSession) => Promise<TableSession>>(),
    findOpenByTable: vi.fn<(tableId: string, cafeId: string) => Promise<TableSession | null>>(),
    findByIdAndCafe: vi.fn<(id: string, cafeId: string) => Promise<TableSession | null>>(),
    getDetail: vi.fn<(id: string, cafeId: string) => Promise<TableSessionDetail | null>>(),
    floor: vi.fn<(cafeId: string) => Promise<TableWithStatus[]>>(),
    settle:
      vi.fn<
        (
          id: string,
          cafeId: string,
          paymentMethod: 'cash' | 'upi' | 'card' | 'online',
        ) => Promise<TableSessionDetail | null>
      >(),
    close: vi.fn<(id: string, cafeId: string) => Promise<TableSession | null>>(),
  } satisfies TableSessionsRepository;
}

function createMockTablesRepo(table: RestaurantTable | null) {
  return {
    list: vi.fn(),
    create: vi.fn(),
    findByIdAndCafe: vi.fn().mockResolvedValue(table),
    update: vi.fn(),
    delete: vi.fn(),
  };
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

describe('table-sessions endpoints', () => {
  let app: FastifyInstance;
  let sessionsRepo: ReturnType<typeof createMockSessionsRepo>;
  let tablesRepo: ReturnType<typeof createMockTablesRepo>;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    sessionsRepo = createMockSessionsRepo();
    tablesRepo = createMockTablesRepo(makeTable());
    await app.register(tableSessionsRoutes, {
      repository: sessionsRepo,
      tablesRepository: tablesRepo as never,
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
    sessionsRepo.open.mockReset();
    sessionsRepo.findOpenByTable.mockReset();
    sessionsRepo.findByIdAndCafe.mockReset();
    sessionsRepo.getDetail.mockReset();
    sessionsRepo.floor.mockReset();
    sessionsRepo.settle.mockReset();
    sessionsRepo.close.mockReset();
    tablesRepo.findByIdAndCafe.mockReset();
    tablesRepo.findByIdAndCafe.mockResolvedValue(makeTable());
  });

  describe('GET /cafes/:cafeId/floor', () => {
    it('returns tables with live status', async () => {
      const tableWithStatus: TableWithStatus = {
        ...makeTable(),
        liveStatus: 'occupied',
        session: makeSession(),
        orderCount: 1,
        runningTotalPaise: 31500,
      };
      sessionsRepo.floor.mockResolvedValueOnce([tableWithStatus]);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/floor`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().tables).toHaveLength(1);
      expect(res.json().tables[0].liveStatus).toBe('occupied');
      expect(res.json().tables[0].runningTotalPaise).toBe(31500);
    });
  });

  describe('POST /cafes/:cafeId/table-sessions', () => {
    it('opens a session for a free table', async () => {
      sessionsRepo.findOpenByTable.mockResolvedValueOnce(null);
      sessionsRepo.open.mockResolvedValueOnce(makeSession({ partySize: 2 }));
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/table-sessions`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { tableId: TABLE_ID, partySize: 2, guestName: 'Asha' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().session.id).toBe(SESSION_ID);
    });

    it('returns 404 when the table is not in the cafe', async () => {
      tablesRepo.findByIdAndCafe.mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/table-sessions`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { tableId: TABLE_ID },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 409 SESSION_ALREADY_OPEN when an open session exists', async () => {
      sessionsRepo.findOpenByTable.mockResolvedValueOnce(makeSession());
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/table-sessions`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { tableId: TABLE_ID },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('SESSION_ALREADY_OPEN');
    });
  });

  describe('GET /cafes/:cafeId/table-sessions/:sessionId', () => {
    it('returns the session detail with totals', async () => {
      sessionsRepo.getDetail.mockResolvedValueOnce(makeDetail());
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/table-sessions/${SESSION_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().session.totalPaise).toBe(31500);
      expect(res.json().session.orders).toHaveLength(1);
    });

    it('returns 404 when the session is missing', async () => {
      sessionsRepo.getDetail.mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'GET',
        url: `/cafes/${CAFE_ID}/table-sessions/${SESSION_ID}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /cafes/:cafeId/table-sessions/:sessionId/settle', () => {
    it('settles the session and returns paid orders', async () => {
      const settled = makeDetail({
        session: makeSession({ status: 'closed', closedAt: '2026-05-20T01:00:00.000Z' }),
        orders: [
          makeOrderWithItems({
            status: 'completed',
            paymentStatus: 'paid',
            paymentMethod: 'cash',
          }),
        ],
      });
      sessionsRepo.settle.mockResolvedValueOnce(settled);
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/table-sessions/${SESSION_ID}/settle`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { paymentMethod: 'cash' },
      });
      expect(res.statusCode).toBe(200);
      expect(sessionsRepo.settle).toHaveBeenCalledWith(SESSION_ID, CAFE_ID, 'cash');
      expect(res.json().session.session.status).toBe('closed');
      expect(res.json().session.orders[0].paymentStatus).toBe('paid');
      expect(res.json().session.orders[0].status).toBe('completed');
    });

    it('returns 404 when the session is missing', async () => {
      sessionsRepo.settle.mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/table-sessions/${SESSION_ID}/settle`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { paymentMethod: 'upi' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects an invalid payment method', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/table-sessions/${SESSION_ID}/settle`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { paymentMethod: 'bitcoin' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /cafes/:cafeId/table-sessions/:sessionId/close', () => {
    it('closes (abandons) a session', async () => {
      sessionsRepo.close.mockResolvedValueOnce(
        makeSession({ status: 'closed', closedAt: '2026-05-20T01:00:00.000Z' }),
      );
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/table-sessions/${SESSION_ID}/close`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().session.status).toBe('closed');
    });

    it('returns 404 when the session is missing', async () => {
      sessionsRepo.close.mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'POST',
        url: `/cafes/${CAFE_ID}/table-sessions/${SESSION_ID}/close`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
