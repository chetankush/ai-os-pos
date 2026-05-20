import type { MenuCategoryWithItems } from '@sangam/types';
import { describe, expect, it } from 'vitest';
import {
  OrderBuildError,
  buildBillNumber,
  buildOrder,
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
    const built = buildOrder({ gstMode: 'exempt' }, MENU, [
      { menuItemId: 'item-1', quantity: 1 },
    ]);
    expect(built.gstRateBp).toBe(0);
    expect(built.taxPaise).toBe(0);
    expect(built.totalPaise).toBe(15000);
  });

  it('rejects an unknown item', () => {
    expect(() => buildOrder({ gstMode: 'regular_5' }, MENU, [{ menuItemId: 'nope', quantity: 1 }])).toThrow(
      OrderBuildError,
    );
  });

  it('rejects an unavailable item', () => {
    expect(() =>
      buildOrder({ gstMode: 'regular_5' }, MENU, [{ menuItemId: 'item-oos', quantity: 1 }]),
    ).toThrow(OrderBuildError);
  });
});
