import type { MenuCategoryWithItems } from '@sangam/types';
import { describe, expect, it } from 'vitest';
import {
  OrderBuildError,
  buildBillNumber,
  buildOrder,
  computeBillAdjustments,
  financialYear,
  gstRateBpFor,
} from './build.js';

describe('gstRateBpFor', () => {
  it('regular_5 → 500 bp', () => {
    expect(gstRateBpFor('regular_5')).toBe(500);
  });
  it('regular_18 → 1800 bp', () => {
    expect(gstRateBpFor('regular_18')).toBe(1800);
  });
  it('composition → 0 (no GST on the invoice)', () => {
    expect(gstRateBpFor('composition')).toBe(0);
  });
  it('exempt → 0', () => {
    expect(gstRateBpFor('exempt')).toBe(0);
  });
});

describe('financialYear (Indian FY: Apr 1 – Mar 31)', () => {
  it('a date in May 2026 → 2026-27', () => {
    expect(financialYear(new Date('2026-05-20T00:00:00.000Z'))).toBe('2026-27');
  });
  it('a date in Feb 2027 → 2026-27', () => {
    expect(financialYear(new Date('2027-02-15T00:00:00.000Z'))).toBe('2026-27');
  });
  it('Apr 1 starts a new FY', () => {
    expect(financialYear(new Date('2026-04-01T12:00:00.000Z'))).toBe('2026-27');
  });
  it('Mar 31 is the last day of the prior FY', () => {
    expect(financialYear(new Date('2027-03-31T12:00:00.000Z'))).toBe('2026-27');
  });
  it('Jan belongs to the FY that started the previous April', () => {
    expect(financialYear(new Date('2027-01-10T12:00:00.000Z'))).toBe('2026-27');
  });
  it('handles a century rollover end-year (2099-00)', () => {
    expect(financialYear(new Date('2099-06-01T12:00:00.000Z'))).toBe('2099-00');
  });
});

describe('buildBillNumber', () => {
  it('formats INV/{fy}/{seq6} with zero padding', () => {
    expect(buildBillNumber('2026-27', 123)).toBe('INV/2026-27/000123');
  });
  it('pads the first serial', () => {
    expect(buildBillNumber('2026-27', 1)).toBe('INV/2026-27/000001');
  });
  it('does not truncate serials beyond 6 digits', () => {
    expect(buildBillNumber('2026-27', 1234567)).toBe('INV/2026-27/1234567');
  });
});

const MENU: MenuCategoryWithItems[] = [
  {
    id: 'cat-1',
    cafeId: 'cafe-1',
    name: 'Beverages',
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    items: [
      {
        id: 'item-1',
        cafeId: 'cafe-1',
        categoryId: 'cat-1',
        name: 'Cappuccino',
        description: null,
        basePricePaise: 15000,
        hsnCode: null,
        gstRateBpOverride: null,
        imageUrl: null,
        isVegetarian: true,
        isVegan: false,
        containsEgg: false,
        spiceLevel: 0,
        isAvailable: true,
        sortOrder: 0,
        createdAt: '2026-05-20T00:00:00.000Z',
        updatedAt: '2026-05-20T00:00:00.000Z',
      },
      {
        id: 'item-oos',
        cafeId: 'cafe-1',
        categoryId: 'cat-1',
        name: 'OOS Tea',
        description: null,
        basePricePaise: 10000,
        hsnCode: null,
        gstRateBpOverride: null,
        imageUrl: null,
        isVegetarian: true,
        isVegan: false,
        containsEgg: false,
        spiceLevel: 0,
        isAvailable: false,
        sortOrder: 1,
        createdAt: '2026-05-20T00:00:00.000Z',
        updatedAt: '2026-05-20T00:00:00.000Z',
      },
    ],
  },
];

describe('buildOrder GST math by gstMode', () => {
  it('regular_5 charges 5%', () => {
    const built = buildOrder({ gstMode: 'regular_5' }, MENU, [
      { menuItemId: 'item-1', quantity: 2 },
    ]);
    expect(built.gstRateBp).toBe(500);
    expect(built.subtotalPaise).toBe(30000);
    expect(built.taxPaise).toBe(1500);
    expect(built.totalPaise).toBe(31500);
  });

  it('regular_18 charges 18%', () => {
    const built = buildOrder({ gstMode: 'regular_18' }, MENU, [
      { menuItemId: 'item-1', quantity: 1 },
    ]);
    expect(built.gstRateBp).toBe(1800);
    expect(built.taxPaise).toBe(2700);
    expect(built.totalPaise).toBe(17700);
  });

  it('composition charges no GST on the bill', () => {
    const built = buildOrder({ gstMode: 'composition' }, MENU, [
      { menuItemId: 'item-1', quantity: 1 },
    ]);
    expect(built.gstRateBp).toBe(0);
    expect(built.taxPaise).toBe(0);
    expect(built.totalPaise).toBe(15000);
  });

  it('exempt charges no GST on the bill', () => {
    const built = buildOrder({ gstMode: 'exempt' }, MENU, [{ menuItemId: 'item-1', quantity: 1 }]);
    expect(built.gstRateBp).toBe(0);
    expect(built.taxPaise).toBe(0);
    expect(built.totalPaise).toBe(15000);
  });

  it('rejects an unknown item', () => {
    expect(() =>
      buildOrder({ gstMode: 'regular_5' }, MENU, [{ menuItemId: 'nope', quantity: 1 }]),
    ).toThrow(OrderBuildError);
  });

  it('rejects an unavailable item', () => {
    expect(() =>
      buildOrder({ gstMode: 'regular_5' }, MENU, [{ menuItemId: 'item-oos', quantity: 1 }]),
    ).toThrow(OrderBuildError);
  });

  it('with no adjustments, totals are unchanged (regression)', () => {
    const built = buildOrder({ gstMode: 'regular_5' }, MENU, [
      { menuItemId: 'item-1', quantity: 2 },
    ]);
    expect(built.discountPaise).toBe(0);
    expect(built.serviceChargePaise).toBe(0);
    expect(built.packagingChargePaise).toBe(0);
    expect(built.roundOffPaise).toBe(0);
    expect(built.totalPaise).toBe(31500);
  });
});

describe('computeBillAdjustments (discounts, charges, round-off)', () => {
  // subtotal 30000 (₹300) at 5% GST unless noted.
  it('applies a percent discount pre-tax', () => {
    const a = computeBillAdjustments(30000, 500, { discount: { type: 'percent', value: 10 } });
    expect(a.discountPaise).toBe(3000); // 10% of 300
    expect(a.taxPaise).toBe(1350); // 5% of 270
    expect(a.totalPaise).toBe(28350);
  });

  it('applies a flat discount pre-tax', () => {
    const a = computeBillAdjustments(30000, 500, { discount: { type: 'flat', value: 5000 } });
    expect(a.discountPaise).toBe(5000);
    expect(a.taxPaise).toBe(1250); // 5% of 250
    expect(a.totalPaise).toBe(26250);
  });

  it('clamps a flat discount to never exceed the subtotal', () => {
    const a = computeBillAdjustments(30000, 500, { discount: { type: 'flat', value: 99999 } });
    expect(a.discountPaise).toBe(30000);
    expect(a.taxPaise).toBe(0);
    expect(a.totalPaise).toBe(0);
  });

  it('keeps the discount reason (trimmed)', () => {
    const a = computeBillAdjustments(30000, 500, {
      discount: { type: 'flat', value: 1000, reason: '  regular customer  ' },
    });
    expect(a.discountReason).toBe('regular customer');
  });

  it('adds a service charge to the taxable base (GST applies on it)', () => {
    const a = computeBillAdjustments(30000, 500, { serviceChargeBp: 1000 }); // 10%
    expect(a.serviceChargePaise).toBe(3000);
    expect(a.taxPaise).toBe(1650); // 5% of 33000
    expect(a.totalPaise).toBe(34650);
  });

  it('adds a flat packaging charge to the taxable base', () => {
    const a = computeBillAdjustments(30000, 500, { packagingChargePaise: 2000 });
    expect(a.packagingChargePaise).toBe(2000);
    expect(a.taxPaise).toBe(1600); // 5% of 32000
    expect(a.totalPaise).toBe(33600);
  });

  it('rounds the payable to the nearest rupee and records the delta', () => {
    // 15000 + 5% = 15750 (₹157.50) → nearest rupee ₹158 → +50
    const a = computeBillAdjustments(15000, 500, { roundOff: true });
    expect(a.roundOffPaise).toBe(50);
    expect(a.totalPaise).toBe(15800);
  });

  it('charges no GST in composition mode but still adds service/packaging', () => {
    const a = computeBillAdjustments(30000, 0, {
      serviceChargeBp: 1000,
      packagingChargePaise: 2000,
    });
    expect(a.taxPaise).toBe(0);
    expect(a.totalPaise).toBe(35000); // 30000 + 3000 + 2000
  });

  it('combines discount + service + packaging + round-off consistently', () => {
    const a = computeBillAdjustments(30000, 500, {
      discount: { type: 'percent', value: 10 }, // -3000 → net 27000
      serviceChargeBp: 1000, // 10% of 27000 = 2700
      packagingChargePaise: 1000,
      roundOff: true,
    });
    // base = 27000 + 2700 + 1000 = 30700; tax 5% = 1535; pre = 32235 → round ₹322 = 32200 → -35
    expect(a.discountPaise).toBe(3000);
    expect(a.serviceChargePaise).toBe(2700);
    expect(a.taxPaise).toBe(1535);
    expect(a.roundOffPaise).toBe(-35);
    expect(a.totalPaise).toBe(32200);
  });

  it('is a no-op with no adjustments', () => {
    const a = computeBillAdjustments(30000, 500);
    expect(a.discountPaise).toBe(0);
    expect(a.taxPaise).toBe(1500);
    expect(a.roundOffPaise).toBe(0);
    expect(a.totalPaise).toBe(31500);
  });
});
