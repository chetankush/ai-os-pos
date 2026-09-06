import type { GstMode } from '@sangam/types';

/**
 * Rules that decide what a printed bill is *called* and what it must declare.
 *
 * These are legal requirements, not styling. Under GST a supplier who does not
 * collect tax — a composition dealer, or one making exempt supplies — must not
 * issue a document headed "Tax Invoice"; it has to be a "Bill of Supply".
 * Composition dealers additionally have to carry a declaration saying they
 * cannot collect tax. Printing the wrong header is the kind of thing that
 * surfaces during an audit, long after the bills are in customers' hands.
 */

export type BillDocumentTitle = 'TAX INVOICE' | 'BILL OF SUPPLY';

/** Modes that actually charge GST; the rest issue a Bill of Supply. */
const TAX_CHARGING_MODES: readonly GstMode[] = ['regular_5', 'regular_18'];

export function billDocumentTitle(gstMode: GstMode): BillDocumentTitle {
  return TAX_CHARGING_MODES.includes(gstMode) ? 'TAX INVOICE' : 'BILL OF SUPPLY';
}

/**
 * The declaration a composition dealer must print on every bill, per CGST
 * Rule 5(1)(f). Returns null for modes that don't need it.
 */
export function compositionDeclaration(gstMode: GstMode): string | null {
  if (gstMode !== 'composition') return null;
  return 'Composition taxable person, not eligible to collect tax on supplies';
}

// ─── Amount in words (Indian numbering) ──────────────────────────────────────

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
] as const;

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
] as const;

/** Words for 0–99. Empty string for 0 so callers can skip empty groups. */
function twoDigits(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n] ?? '';
  const tens = TENS[Math.floor(n / 10)] ?? '';
  const ones = ONES[n % 10] ?? '';
  return ones ? `${tens} ${ones}` : tens;
}

/** Words for 0–999. */
function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = twoDigits(n % 100);
  if (!hundreds) return rest;
  const head = `${ONES[hundreds]} Hundred`;
  return rest ? `${head} ${rest}` : head;
}

/**
 * Converts a whole number to words on the Indian scale — the groups are
 * crore, lakh, thousand, then the final three digits (unlike the Western
 * million/billion grouping).
 */
function wholeNumberInWords(n: number): string {
  if (n === 0) return 'Zero';

  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const rest = n % 1_000;

  if (crore) parts.push(`${wholeNumberInWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));

  return parts.join(' ');
}

/**
 * Renders a paise amount the way it appears on an Indian invoice, e.g.
 * 24150 -> "Two Hundred Forty One Rupees and Fifty Paise Only".
 *
 * Negative inputs are treated as their magnitude — a bill total is never
 * negative, and a refund slip labels the direction separately.
 */
export function amountInWords(paise: number): string {
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const paisePart = abs % 100;

  const rupeeWord = rupees === 1 ? 'Rupee' : 'Rupees';
  const head = `${wholeNumberInWords(rupees)} ${rupeeWord}`;

  if (paisePart === 0) return `${head} Only`;

  const paiseWord = paisePart === 1 ? 'Paisa' : 'Paise';
  return `${head} and ${wholeNumberInWords(paisePart)} ${paiseWord} Only`;
}
