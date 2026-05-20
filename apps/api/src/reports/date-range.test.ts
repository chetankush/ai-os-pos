import { describe, expect, it } from 'vitest';
import { isValidIsoDate, istDayRange, istHourOf, istRange, todayIstDate } from './date-range.js';

describe('isValidIsoDate', () => {
  it('accepts a well-formed real date', () => {
    expect(isValidIsoDate('2026-05-20')).toBe(true);
  });

  it('rejects malformed strings', () => {
    expect(isValidIsoDate('2026-5-20')).toBe(false);
    expect(isValidIsoDate('20-05-2026')).toBe(false);
    expect(isValidIsoDate('not-a-date')).toBe(false);
    expect(isValidIsoDate('2026-05-20T00:00:00Z')).toBe(false);
  });

  it('rejects impossible calendar dates', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
  });
});

describe('istDayRange', () => {
  it('maps an IST business day to its UTC half-open window', () => {
    // 2026-05-20 00:00 IST == 2026-05-19 18:30 UTC; next day boundary same time.
    expect(istDayRange('2026-05-20')).toEqual({
      fromIso: '2026-05-19T18:30:00.000Z',
      toIso: '2026-05-20T18:30:00.000Z',
    });
  });
});

describe('istRange', () => {
  it('spans from the start of `from` to the end of `to` (IST)', () => {
    expect(istRange('2026-05-18', '2026-05-20')).toEqual({
      fromIso: '2026-05-17T18:30:00.000Z',
      toIso: '2026-05-20T18:30:00.000Z',
    });
  });

  it('handles a single-day range', () => {
    expect(istRange('2026-05-20', '2026-05-20')).toEqual(istDayRange('2026-05-20'));
  });
});

describe('istHourOf', () => {
  it('converts a UTC instant to the IST hour-of-day', () => {
    // 18:30 UTC == 00:00 IST (next day).
    expect(istHourOf('2026-05-19T18:30:00.000Z')).toBe(0);
    // 12:00 UTC == 17:30 IST.
    expect(istHourOf('2026-05-20T12:00:00.000Z')).toBe(17);
    // 03:30 UTC == 09:00 IST.
    expect(istHourOf('2026-05-20T03:30:00.000Z')).toBe(9);
  });
});

describe('todayIstDate', () => {
  it('returns the IST calendar date for a given instant', () => {
    // 2026-05-19 20:00 UTC is already 2026-05-20 01:30 IST.
    expect(todayIstDate(new Date('2026-05-19T20:00:00.000Z'))).toBe('2026-05-20');
    // 2026-05-20 17:00 UTC is still 2026-05-20 22:30 IST.
    expect(todayIstDate(new Date('2026-05-20T17:00:00.000Z'))).toBe('2026-05-20');
  });
});
