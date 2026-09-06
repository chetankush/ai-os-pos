import { describe, expect, it } from 'vitest';
import { amountInWords, billDocumentTitle, compositionDeclaration } from './bill-document';

describe('billDocumentTitle', () => {
  // A composition dealer or an exempt supplier may not issue a "Tax Invoice" —
  // GST law requires a "Bill of Supply" because no tax is collected.
  it('is TAX INVOICE for the GST-charging modes', () => {
    expect(billDocumentTitle('regular_5')).toBe('TAX INVOICE');
    expect(billDocumentTitle('regular_18')).toBe('TAX INVOICE');
  });

  it('is BILL OF SUPPLY when no tax is collected', () => {
    expect(billDocumentTitle('composition')).toBe('BILL OF SUPPLY');
    expect(billDocumentTitle('exempt')).toBe('BILL OF SUPPLY');
  });
});

describe('compositionDeclaration', () => {
  it('is required only for composition dealers', () => {
    expect(compositionDeclaration('composition')).toMatch(/composition taxable person/i);
    expect(compositionDeclaration('composition')).toMatch(/not eligible to collect tax/i);
  });

  it('is absent for every other mode', () => {
    expect(compositionDeclaration('regular_5')).toBeNull();
    expect(compositionDeclaration('regular_18')).toBeNull();
    expect(compositionDeclaration('exempt')).toBeNull();
  });
});

describe('amountInWords', () => {
  it('writes whole rupees', () => {
    expect(amountInWords(0)).toBe('Zero Rupees Only');
    expect(amountInWords(100)).toBe('One Rupee Only');
    expect(amountInWords(20000)).toBe('Two Hundred Rupees Only');
    expect(amountInWords(24100)).toBe('Two Hundred Forty One Rupees Only');
  });

  it('writes paise when present', () => {
    expect(amountInWords(24150)).toBe('Two Hundred Forty One Rupees and Fifty Paise Only');
    expect(amountInWords(101)).toBe('One Rupee and One Paisa Only');
  });

  it('uses the Indian lakh/crore scale', () => {
    expect(amountInWords(100000_00)).toBe('One Lakh Rupees Only');
    expect(amountInWords(1250000_00)).toBe('Twelve Lakh Fifty Thousand Rupees Only');
    expect(amountInWords(10000000_00)).toBe('One Crore Rupees Only');
  });

  it('handles the teens and tens correctly', () => {
    expect(amountInWords(1300)).toBe('Thirteen Rupees Only');
    expect(amountInWords(9000)).toBe('Ninety Rupees Only');
    expect(amountInWords(1900)).toBe('Nineteen Rupees Only');
  });

  it('never returns a negative amount in words', () => {
    expect(amountInWords(-500)).toBe('Five Rupees Only');
  });
});
