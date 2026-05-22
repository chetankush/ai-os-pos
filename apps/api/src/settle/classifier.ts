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

  // Ads / sponsored visibility — the highest-leverage dispute. Checked first so
  // an "ads ... promo" line isn't mistaken for a discount.
  if (
    has('advert', 'marketing', 'sponsor', 'promoted', 'listing', 'banner', 'boost') ||
    /\bads?\b/.test(l)
  ) {
    return 'ads';
  }
  // Penalties / fines / SLA breaches — often wrongful, and disputable. Checked
  // before cancellation so "cancellation penalty" is treated as a penalty.
  if (has('penalt', 'breach', 'rejection') || /\bsla\b/.test(l) || /\bfine\b/.test(l)) {
    return 'penalty';
  }
  if (has('commission', 'base service fee', 'take rate')) return 'commission';
  if (
    has('service fee', 'service &', 'platform fee', 'access fee', 'convenience fee', 'handling fee')
  ) {
    return 'service_fee';
  }
  if (
    has('discount', 'flat off', 'freebie', 'gold', 'pro membership', 'promo', 'offer', 'coupon', 'subsidy')
  ) {
    return 'discount';
  }
  if (has('payment', 'gateway', 'mechanism', 'collection charge', 'collection fee')) {
    return 'payment_gateway';
  }
  if (has('refund', 'compensation', 'recoup', 'complaint')) return 'refund';
  if (has('cancel')) return 'cancellation';
  if (has('tcs', 'tax collected')) return 'tcs';
  if (has('tds', '194o', '194 o')) return 'tds';
  if (has('gst')) return 'gst';
  if (has('packag')) return 'packaging';
  if (has('deliver', 'fulfil', 'logistics', 'rider', 'long distance', 'last mile')) {
    return 'delivery';
  }
  return 'other';
}

const LINE_RE =
  /^(.*?)[,\t:]\s*"?\s*(?:₹|rs\.?|inr)?\s*\(?-?\s*([\d,]+(?:\.\d+)?)\s*\)?\s*"?\s*$/i;

/**
 * Parses a "label,amount" CSV (amount in rupees) into normalized deductions.
 * - Splits on the trailing numeric token so labels may contain commas; accepts
 *   comma, tab, or colon as the label/amount separator.
 * - Strips ₹/Rs/INR, quotes, and thousands separators; treats negatives/parens
 *   as positive magnitudes (deductions are stored as positive).
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
