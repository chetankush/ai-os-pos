import type { SettleCategory, SettleDeduction } from '@sangam/types';

/**
 * Maps a raw statement line label to a normalized category using keyword
 * matching. Order matters: more specific / higher-priority categories are
 * checked first (e.g. "Base service fee" is commission, not a generic fee;
 * an "ads ... promo" line is ads, not discount).
 *
 * Calibrated against documented Zomato/Swiggy settlement column names; will
 * be refined once we have real exports to test against.
 */
export function classifyLabel(label: string): SettleCategory {
  const l = label.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => l.includes(n));

  if (has('advert', 'marketing', 'sponsor') || /\bads?\b/.test(l)) return 'ads';
  if (has('commission', 'base service fee')) return 'commission';
  if (has('service fee', 'service &', 'platform fee')) return 'service_fee';
  if (has('discount', 'flat off', 'freebie', 'gold', 'promo', 'offer')) {
    return 'discount';
  }
  if (has('payment', 'gateway', 'mechanism')) return 'payment_gateway';
  if (has('refund', 'compensation', 'recoup')) return 'refund';
  if (has('cancel')) return 'cancellation';
  if (has('tcs', 'tax collected')) return 'tcs';
  if (has('tds', '194o', '194 o')) return 'tds';
  if (has('gst')) return 'gst';
  if (has('packag')) return 'packaging';
  if (has('deliver', 'fulfil')) return 'delivery';
  return 'other';
}

const LINE_RE =
  /^(.*?)[,\t]\s*"?\s*₹?\s*\(?-?\s*([\d,]+(?:\.\d+)?)\s*\)?\s*"?\s*$/;

/**
 * Parses a "label,amount" CSV (amount in rupees) into normalized deductions.
 * - Splits on the trailing numeric token so labels may contain commas.
 * - Strips ₹, quotes, and thousands separators; treats negatives/parens as
 *   positive magnitudes (deductions are stored as positive).
 * - Skips header rows and any line without a numeric amount.
 */
export function parseDeductionsCsv(csv: string): SettleDeduction[] {
  const out: SettleDeduction[] = [];
  for (const raw of csv.split('\n')) {
    const line = raw.replace(/\r$/, '').trim();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const label = m[1]!.trim().replace(/^"|"$/g, '');
    const amount = Number.parseFloat(m[2]!.replace(/,/g, ''));
    if (!Number.isFinite(amount)) continue;
    const amountPaise = Math.round(Math.abs(amount) * 100);
    if (amountPaise === 0) continue;
    out.push({ category: classifyLabel(label), label, amountPaise });
  }
  return out;
}
