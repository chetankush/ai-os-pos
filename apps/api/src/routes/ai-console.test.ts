import type {
  Cafe,
  MenuCategoryWithItems,
  MenuItem,
  Order,
  OrderStatsResponse,
  OrderStatus,
  OrderWithItems,
  PaymentMethod,
} from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentResult } from '../ai/agent.js';
import type { CafesRepository } from '../repositories/cafes.js';
import type { MenuRepository } from '../repositories/menu.js';
import type { OrdersRepository } from '../repositories/orders.js';
import { buildTestApp } from '../../test/helpers.js';
import { aiConsoleRoutes } from './ai-console.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const CAFE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ITEM_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

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

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: ITEM_ID,
    cafeId: CAFE_ID,
    categoryId: 'cat-1',
    name: 'Samosa',
    description: null,
    basePricePaise: 3000,
    imageUrl: null,
    isVegetarian: true,
    isVegan: false,
    containsEgg: false,
    spiceLevel: 1,
    isAvailable: true,
    sortOrder: 0,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

const MENU: MenuCategoryWithItems[] = [
  {
    id: 'cat-1',
    cafeId: CAFE_ID,
    name: 'Snacks',
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    items: [makeMenuItem(), makeMenuItem({ id: 'oos', name: 'Pakora', isAvailable: false })],
  },
];

function createMockCafesRepo(cafe: Cafe | null): CafesRepository {
  return {
    create: vi.fn(),
    listByOwner: vi.fn(),
    findByIdAndOwner: vi.fn().mockResolvedValue(cafe),
  } as unknown as CafesRepository;
}

function createMockOrdersRepo(): OrdersRepository {
  return {
    create: vi.fn(),
    listByCafe: vi.fn().mockResolvedValue([] as Order[]),
    findByIdAndCafe: vi.fn(),
    updateStatus: vi.fn(),
    todayStats: vi.fn<(cafeId: string) => Promise<OrderStatsResponse>>().mockResolvedValue({
      todayCount: 0,
      todayRevenuePaise: 0,
      todayGstPaise: 0,
      byStatus: { pending: 0, preparing: 0, ready: 0, completed: 0, cancelled: 0 },
      paymentBreakdownPaise: { cash: 0, upi: 0, card: 0, online: 0 },
    }),
    setPaymentPending: vi.fn(),
    markPaid: vi.fn(),
    markPaymentFailed: vi.fn(),
    topItemsToday: vi.fn().mockResolvedValue([]),
    itemSalesToday: vi.fn().mockResolvedValue({ name: '', qty: 0, revenuePaise: 0 }),
    findByOrderNumber: vi.fn().mockResolvedValue(null),
  } as unknown as OrdersRepository;
}

function createMockMenuRepo(): MenuRepository {
  return {
    getFullMenu: vi.fn().mockResolvedValue(MENU),
    categoryExists: vi.fn(),
    createCategory: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
  } as unknown as MenuRepository;
}

interface BuildOpts {
  cafe?: Cafe | null;
  deepseekKey?: string;
  runAgent?: () => Promise<AgentResult>;
}

async function buildApp(opts: BuildOpts = {}) {
  const env: NodeJS.ProcessEnv = { SUPABASE_JWT_SECRET: JWT_SECRET };
  if (opts.deepseekKey !== undefined) env.DEEPSEEK_API_KEY = opts.deepseekKey;

  const app = await buildTestApp(env);
  const runAgentStub =
    opts.runAgent ??
    vi.fn(async () => ({ reply: 'You made ₹2500 today.', toolsUsed: ['get_today_stats'] }));

  await app.register(aiConsoleRoutes, {
    cafesRepository: createMockCafesRepo(opts.cafe === undefined ? makeCafe() : opts.cafe),
    ordersRepository: createMockOrdersRepo(),
    menuRepository: createMockMenuRepo(),
    runAgent: runAgentStub as never,
  });
  await app.ready();
  const token = app.jwt.sign(
    { sub: OWNER_ID, email: 'owner@test.in', aud: 'authenticated' },
    { expiresIn: '1h' },
  );
  return { app, token, runAgentStub };
}

describe('POST /cafes/:cafeId/ai-console', () => {
  let app: FastifyInstance;
  let token: string;
  let runAgentStub: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    const built = await buildApp({ deepseekKey: 'sk-test' });
    app = built.app;
    token = built.token;
    runAgentStub = built.runAgentStub as ReturnType<typeof vi.fn>;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    runAgentStub.mockClear();
  });

  it('returns the agent reply + toolsUsed (200)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/cafes/${CAFE_ID}/ai-console`,
      headers: { authorization: `Bearer ${token}` },
      payload: { message: "what's today's revenue?" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      reply: 'You made ₹2500 today.',
      toolsUsed: ['get_today_stats'],
    });
    expect(runAgentStub).toHaveBeenCalledTimes(1);
  });

  it('requires authentication (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/cafes/${CAFE_ID}/ai-console`,
      payload: { message: 'hi' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an empty / over-long message (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/cafes/${CAFE_ID}/ai-console`,
      headers: { authorization: `Bearer ${token}` },
      payload: { message: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the cafe is not owned by the requester', async () => {
    const built = await buildApp({ cafe: null, deepseekKey: 'sk-test' });
    const res = await built.app.inject({
      method: 'POST',
      url: `/cafes/${CAFE_ID}/ai-console`,
      headers: { authorization: `Bearer ${built.token}` },
      payload: { message: 'hi' },
    });
    expect(res.statusCode).toBe(404);
    await built.app.close();
  });

  it('returns 503 AI_UNCONFIGURED when no DeepSeek key', async () => {
    const built = await buildApp({ deepseekKey: '' });
    const res = await built.app.inject({
      method: 'POST',
      url: `/cafes/${CAFE_ID}/ai-console`,
      headers: { authorization: `Bearer ${built.token}` },
      payload: { message: 'hi' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('AI_UNCONFIGURED');
    await built.app.close();
  });
});
