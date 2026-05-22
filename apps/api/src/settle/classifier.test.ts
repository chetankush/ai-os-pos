import { describe, expect, it } from 'vitest';
import { classifyLabel, parseDeductionsCsv } from './classifier.js';

describe('classifyLabel', () => {
  it.each([
    ['Base service fee', 'commission'],
    ['Commission charge', 'commission'],
    ['Service fee', 'service_fee'],
    ['Platform fee', 'service_fee'],
    ['Ads — Hyperpure promo', 'ads'],
    ['Advertising spend', 'ads'],
    ['Marketing campaign', 'ads'],
    ['Restaurant discount [Flat offs, Freebies, Gold]', 'discount'],
    ['Offer funding', 'discount'],
    ['Payment mechanism fee', 'payment_gateway'],
    ['Payment gateway charge', 'payment_gateway'],
    ['Collection charges', 'payment_gateway'],
    ['Customer compensation/recoupment', 'refund'],
    ['Refund deduction', 'refund'],
    ['Customer complaint deduction', 'refund'],
    ['Order cancellation charge', 'cancellation'],
    ['Tax collected at source (TCS)', 'tcs'],
    ['TDS 194O', 'tds'],
    ['Total GST collected from customer', 'gst'],
    ['Packaging charge', 'packaging'],
    ['Delivery fee recovery', 'delivery'],
    ['Fulfilment fee', 'delivery'],
    ['Long distance fee', 'delivery'],
    ['Logistics support fee', 'delivery'],
    ['Something unknown', 'other'],
    // Broadened real-world coverage
    ['Sponsored listing', 'ads'],
    ['Visibility boost', 'ads'],
    ['Access fee', 'service_fee'],
    ['Convenience fee', 'service_fee'],
    ['Swiggy Gold', 'discount'],
    ['Coupon funding', 'discount'],
    ['Customer delivery charge subsidy', 'discount'],
    // Penalties (new category)
    ['Order rejection penalty', 'penalty'],
    ['SLA breach charge', 'penalty'],
    ['Late dispatch fine', 'penalty'],
  ])('classifies "%s" as %s', (label, expected) => {
    expect(classifyLabel(label)).toBe(expected);
  });

  it('prioritizes ads over discount when a label contains both', () => {
    expect(classifyLabel('Ads with promo discount')).toBe('ads');
  });

  it('prioritizes penalty over cancellation for "cancellation penalty"', () => {
    expect(classifyLabel('Cancellation penalty')).toBe('penalty');
  });

  it('prioritizes commission over generic service fee for "base service fee"', () => {
    expect(classifyLabel('Base service fee')).toBe('commission');
  });

  it('is case-insensitive', () => {
    expect(classifyLabel('COMMISSION')).toBe('commission');
  });
});

describe('parseDeductionsCsv', () => {
  it('parses label,amount lines and converts rupees to paise', () => {
    const csv = `Base service fee,22000
Ads promo,5000`;
    const out = parseDeductionsCsv(csv);
    expect(out).toEqual([
      { category: 'commission', label: 'Base service fee', amountPaise: 22_000_00 },
      { category: 'ads', label: 'Ads promo', amountPaise: 5_000_00 },
    ]);
  });

  it('skips a header row', () => {
    const csv = `label,amount
Commission,1000`;
    const out = parseDeductionsCsv(csv);
    expect(out).toHaveLength(1);
    expect(out[0]?.category).toBe('commission');
  });

  it('handles commas inside the label (splits on the trailing number)', () => {
    const csv = `Restaurant discount [Flat offs, Freebies, Gold],3000`;
    const out = parseDeductionsCsv(csv);
    expect(out).toHaveLength(1);
    expect(out[0]?.label).toBe('Restaurant discount [Flat offs, Freebies, Gold]');
    expect(out[0]?.category).toBe('discount');
    expect(out[0]?.amountPaise).toBe(3_000_00);
  });

  it('strips ₹ symbols and thousands separators in the amount', () => {
    const csv = `Commission,"₹22,000.50"`;
    const out = parseDeductionsCsv(csv);
    expect(out[0]?.amountPaise).toBe(22_000_50);
  });

  it('ignores blank lines and rows without a numeric amount', () => {
    const csv = `Commission,1000

Notes: please review
Ads,500`;
    const out = parseDeductionsCsv(csv);
    expect(out).toHaveLength(2);
  });

  it('treats negative/parenthesised amounts as positive magnitudes', () => {
    const csv = `Commission,-1000`;
    const out = parseDeductionsCsv(csv);
    expect(out[0]?.amountPaise).toBe(1_000_00);
  });

  it('accepts a colon separator and "Rs"/"INR" currency prefixes', () => {
    const csv = `Commission: Rs 22,000
Ads: INR 5000`;
    const out = parseDeductionsCsv(csv);
    expect(out).toEqual([
      { category: 'commission', label: 'Commission', amountPaise: 22_000_00 },
      { category: 'ads', label: 'Ads', amountPaise: 5_000_00 },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseDeductionsCsv('')).toEqual([]);
  });
});
