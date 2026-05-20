/**
 * Pure date helpers for reporting. Business days + hours are reckoned in IST
 * (Asia/Kolkata, a fixed UTC+5:30 offset — India has no DST), so a Z-report
 * for "2026-05-20" covers 00:00–24:00 IST that day, translated to a UTC
 * timestamp range we can hand to a `createdAt >= from AND < to` SQL filter.
 */

/** IST is a fixed +5:30 offset (330 minutes). No daylight saving in India. */
export const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a strictly-formatted YYYY-MM-DD that is also a real calendar date. */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Round-trip via UTC to reject e.g. 2026-02-30.
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Today's business day as an IST YYYY-MM-DD string. */
export function todayIstDate(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

/**
 * UTC instant range for one IST business day (half-open: [from, to)).
 * `from` is that date 00:00 IST; `to` is the next date 00:00 IST.
 */
export function istDayRange(date: string): { fromIso: string; toIso: string } {
  const startUtcMs = Date.parse(`${date}T00:00:00.000Z`) - IST_OFFSET_MS;
  return {
    fromIso: new Date(startUtcMs).toISOString(),
    toIso: new Date(startUtcMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * UTC instant range spanning a closed IST date range [from .. to] inclusive of
 * the whole `to` day. Returns a half-open [fromIso, toIso) UTC window.
 */
export function istRange(from: string, to: string): { fromIso: string; toIso: string } {
  const { fromIso } = istDayRange(from);
  const { toIso } = istDayRange(to);
  return { fromIso, toIso };
}

/**
 * Hour-of-day (0–23) in IST for a UTC timestamp. Used to bucket orders into the
 * local trading hour even though `createdAt` is stored in UTC.
 */
export function istHourOf(utcIso: string): number {
  const ist = new Date(Date.parse(utcIso) + IST_OFFSET_MS);
  return ist.getUTCHours();
}
