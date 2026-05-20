import type { SettleStatement } from '@sangam/types';
import { describe, expect, it } from 'vitest';
import { analyzeStatement } from './analyzer.js';

// A realistic Zomato week: ₹1,00,000 gross over 100 orders.
function baseStatement(overrides: Partial<SettleStatement> = {}): SettleStatement {
  return {
    platform: 'zomato',
    periodStart: '2026-05-04',
    periodEnd: '2026-05-10',
    orderCount: 100,
    grossSalesPaise: 100_000_00, // ₹1,00,000
    deductions: [
      { category: 'commission', label: 'Base service fee', amountPaise: 22_000_00 }, // 22%
      { category: 'payment_gateway', label: 'Payment mechanism fee', amountPaise: 2_500_00 },
      { category: 'ads', label: 'Ads — Hyperpure promo', amountPaise: 5_000_00 },
      { category: 'discount', label: 'Restaurant discount [Flat offs]', amountPaise: 3_000_00 },
      { category: 'refund', label: 'Customer compensation/recoupment', amountPaise: 1_500_00 },
      { category: 'tcs', label: 'Tax collected at source (TCS)', amountPaise: 245_00 },
      { category: 'tds', label: 'TDS 194O', amountPaise: 245_00 },
    ],
    ...overrides,
  };
}

describe('analyzeStatement', () => {
  describe('totals + take rate', () => {
    it('sums deductions and computes effective take rate on gross sales', () => {
      const r = analyzeStatement(baseStatement(), {});
      // 2200000+250000+500000+300000+150000+24500+24500 = 3449000
      expect(r.totalDeductionsPaise).toBe(34_490_00);
      // 3449000 / 10000000 * 100 = 34.49 → 34.5
      expect(r.effectiveTakeRatePct).toBe(34.5);
    });

    it('derives net payout when not provided', () => {
      const r = analyzeStatement(baseStatement(), {});
      expect(r.netPayoutPaise).toBe(100_000_00 - 34_490_00);
    });

    it('uses the platform-reported net payout when provided', () => {
      const r = analyzeStatement(baseStatement({ netPayoutPaise: 60_000_00 }), {});
      expect(r.netPayoutPaise).toBe(60_000_00);
    });
  });

  describe('UNAUTHORIZED_ADS', () => {
    it('flags the full ad spend as disputable when ads were not consented', () => {
      const r = analyzeStatement(baseStatement(), { adsConsented: false });
      const f = r.findings.find((x) => x.code === 'UNAUTHORIZED_ADS');
      expect(f).toBeDefined();
      expect(f?.amountPaise).toBe(5_000_00);
      expect(f?.disputable).toBe(true);
      expect(f?.severity).toBe('high');
    });

    it('does not flag ads when the owner consented', () => {
      const r = analyzeStatement(baseStatement(), { adsConsented: true });
      expect(r.findings.find((x) => x.code === 'UNAUTHORIZED_ADS')).toBeUndefined();
    });

    it('treats missing adsConsented as not consented (flags)', () => {
      const r = analyzeStatement(baseStatement(), {});
      expect(r.findings.find((x) => x.code === 'UNAUTHORIZED_ADS')).toBeDefined();
    });
  });

  describe('COMMISSION_OVERCHARGE', () => {
    it('flags the excess over the contracted rate', () => {
      const r = analyzeStatement(baseStatement(), { contractedCommissionRatePct: 20 });
      const f = r.findings.find((x) => x.code === 'COMMISSION_OVERCHARGE');
      expect(f).toBeDefined();
      // actual 22% of 100000 = 22000; contracted 20% = 20000; excess = 2000 → paise
      expect(f?.amountPaise).toBe(2_000_00);
      expect(f?.disputable).toBe(true);
    });

    it('does not flag when commission is within the contracted rate', () => {
      const r = analyzeStatement(baseStatement(), { contractedCommissionRatePct: 25 });
      expect(r.findings.find((x) => x.code === 'COMMISSION_OVERCHARGE')).toBeUndefined();
    });

    it('does not flag when no contracted rate is provided', () => {
      const r = analyzeStatement(baseStatement(), {});
      expect(r.findings.find((x) => x.code === 'COMMISSION_OVERCHARGE')).toBeUndefined();
    });

    it('tolerates rounding within 0.5 percentage points', () => {
      const r = analyzeStatement(baseStatement(), { contractedCommissionRatePct: 21.6 });
      // 22% vs 21.6% = 0.4pp, within tolerance → no flag
      expect(r.findings.find((x) => x.code === 'COMMISSION_OVERCHARGE')).toBeUndefined();
    });
  });

  describe('DISCOUNT_REVIEW', () => {
    it('flags discounts for review when not approved', () => {
      const r = analyzeStatement(baseStatement(), { discountsApproved: false });
      const f = r.findings.find((x) => x.code === 'DISCOUNT_REVIEW');
      expect(f?.amountPaise).toBe(3_000_00);
      expect(f?.disputable).toBe(true);
      expect(f?.severity).toBe('medium');
    });

    it('does not flag discounts the owner approved', () => {
      const r = analyzeStatement(baseStatement(), { discountsApproved: true });
      expect(r.findings.find((x) => x.code === 'DISCOUNT_REVIEW')).toBeUndefined();
    });
  });

  describe('REFUND_DEDUCTION', () => {
    it('flags refund/recoupment deductions as disputable', () => {
      const r = analyzeStatement(baseStatement(), {});
      const f = r.findings.find((x) => x.code === 'REFUND_DEDUCTION');
      expect(f?.amountPaise).toBe(1_500_00);
      expect(f?.disputable).toBe(true);
    });
  });

  describe('HIGH_TAKE_RATE', () => {
    it('flags (non-disputable) when effective take rate exceeds 35%', () => {
      const high = baseStatement({
        deductions: [
          { category: 'commission', label: 'commission', amountPaise: 40_000_00 },
        ],
      });
      const r = analyzeStatement(high, {});
      const f = r.findings.find((x) => x.code === 'HIGH_TAKE_RATE');
      expect(f).toBeDefined();
      expect(f?.disputable).toBe(false);
    });

    it('does not flag a normal take rate', () => {
      const normal = baseStatement({
        deductions: [
          { category: 'commission', label: 'commission', amountPaise: 25_000_00 },
        ],
      });
      const r = analyzeStatement(normal, {});
      expect(r.findings.find((x) => x.code === 'HIGH_TAKE_RATE')).toBeUndefined();
    });
  });

  describe('TCS_MISMATCH / TDS_MISMATCH', () => {
    it('flags (non-disputable) when the tax deviates >25% from ~1% of service fees', () => {
      // commission 20000 → expected tax ≈ 200; actual TCS 500 deviates 150%.
      const stmt = baseStatement({
        deductions: [
          { category: 'commission', label: 'commission', amountPaise: 20_000_00 },
          { category: 'tcs', label: 'TCS', amountPaise: 500_00 },
        ],
      });
      const r = analyzeStatement(stmt, {});
      const f = r.findings.find((x) => x.code === 'TCS_MISMATCH');
      expect(f).toBeDefined();
      expect(f?.disputable).toBe(false);
    });

    it('does not flag tax that is within tolerance of the expected ~1%', () => {
      // commission 20000 → expected tax ≈ 200; actual TCS 200 is on target.
      const stmt = baseStatement({
        deductions: [
          { category: 'commission', label: 'commission', amountPaise: 20_000_00 },
          { category: 'tcs', label: 'TCS', amountPaise: 200_00 },
        ],
      });
      const r = analyzeStatement(stmt, {});
      expect(r.findings.find((x) => x.code === 'TCS_MISMATCH')).toBeUndefined();
    });
  });

  describe('disputable total + mandatory split', () => {
    it('sums only disputable findings into disputablePaise', () => {
      const r = analyzeStatement(baseStatement(), {
        contractedCommissionRatePct: 20,
        adsConsented: false,
        discountsApproved: false,
      });
      // ads 5000 + commission excess 2000 + discount 3000 + refund 1500 = 11500
      expect(r.disputablePaise).toBe(11_500_00);
    });

    it('classifies commission/pg/tcs/tds as mandatory (not recoverable)', () => {
      const r = analyzeStatement(baseStatement(), { contractedCommissionRatePct: 22 });
      // mandatory = commission 22000 + pg 2500 + tcs 245 + tds 245 = 24990
      expect(r.mandatoryDeductionsPaise).toBe(24_990_00);
    });
  });

  describe('whatsappSummary', () => {
    it('produces a plain-text summary with the disputable headline', () => {
      const r = analyzeStatement(baseStatement(), {
        contractedCommissionRatePct: 20,
        adsConsented: false,
      });
      expect(r.whatsappSummary).toContain('Zomato');
      expect(r.whatsappSummary).toContain('disputable');
      // ₹11,500 disputable formatted in en-IN
      expect(r.whatsappSummary).toMatch(/11,500/);
    });
  });

  describe('edge cases', () => {
    it('handles a clean statement with zero disputable money', () => {
      const clean = baseStatement({
        deductions: [
          { category: 'commission', label: 'commission', amountPaise: 20_000_00 },
        ],
      });
      const r = analyzeStatement(clean, { contractedCommissionRatePct: 20, adsConsented: true });
      expect(r.disputablePaise).toBe(0);
      expect(r.findings.filter((f) => f.disputable)).toHaveLength(0);
    });

    it('does not divide by zero on empty gross sales', () => {
      const empty = baseStatement({ grossSalesPaise: 0, deductions: [] });
      const r = analyzeStatement(empty, {});
      expect(r.effectiveTakeRatePct).toBe(0);
    });
  });
});
