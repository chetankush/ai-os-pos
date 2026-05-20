import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';

describe('settle endpoints', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    // buildApp auto-registers settleRoutes (it only needs auth, which the
    // JWT secret provides) — so we don't register it again here.
    app = await buildTestApp({ SUPABASE_JWT_SECRET: JWT_SECRET });
    await app.ready();
    token = app.jwt.sign({ sub: OWNER_ID, email: 'owner@test.in', aud: 'authenticated' }, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await app.close();
  });

  const validBody = {
    platform: 'zomato' as const,
    periodStart: '2026-05-04',
    periodEnd: '2026-05-10',
    orderCount: 100,
    grossSalesRupees: 100000,
    deductionsCsv: [
      'Base service fee,22000',
      'Ads promo,5000',
      'Restaurant discount [Flat offs, Freebies, Gold],3000',
      'Customer compensation/recoupment,1500',
    ].join('\n'),
    config: { contractedCommissionRatePct: 20, adsConsented: false },
  };

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/settle/analyze',
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('analyzes a statement and returns the report with disputable total', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/settle/analyze',
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });

    expect(res.statusCode).toBe(200);
    const { report } = res.json();
    // ads 5000 + commission excess 2000 + discount 3000 + refund 1500 = 11500
    expect(report.disputablePaise).toBe(11_500_00);
    expect(report.platform).toBe('zomato');
    expect(report.whatsappSummary).toContain('disputable');
  });

  it('parses commas-in-label deduction lines correctly', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/settle/analyze',
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    const { report } = res.json();
    const discount = report.findings.find((f: { code: string }) => f.code === 'DISCOUNT_REVIEW');
    expect(discount.amountPaise).toBe(3_000_00);
  });

  it('rejects an empty/garbage deductions input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/settle/analyze',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...validBody, deductionsCsv: 'just some notes with no numbers' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('NO_DEDUCTIONS');
  });

  it('validates the body (bad platform)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/settle/analyze',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...validBody, platform: 'ubereats' },
    });
    expect(res.statusCode).toBe(400);
  });
});
