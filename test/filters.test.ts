import { describe, expect, it } from 'vitest';
import {
  buildSearchFilters,
  escapeFilterValue,
  toUnixSeconds,
} from '../src/filters.js';

describe('escapeFilterValue', () => {
  it('escapes double quotes', () => {
    expect(escapeFilterValue('Cafe "Central"')).toBe('Cafe \\"Central\\"');
  });

  it('stringifies non-string input', () => {
    expect(escapeFilterValue(42 as unknown as string)).toBe('42');
  });

  it('escapes backslashes before quotes so a value cannot break out', () => {
    // A trailing backslash would otherwise escape the filter's closing quote.
    expect(escapeFilterValue('Wien\\')).toBe('Wien\\\\');
    expect(escapeFilterValue('a\\"b')).toBe('a\\\\\\"b');
  });

  it('strips control characters', () => {
    expect(escapeFilterValue('Wien\n\u0000 Linz')).toBe('Wien Linz');
  });

  it('caps the value length', () => {
    expect(escapeFilterValue('x'.repeat(500))).toHaveLength(200);
  });
});

describe('toUnixSeconds', () => {
  it('converts ISO datetimes to unix seconds', () => {
    const iso = '2026-07-25T18:00:00.000Z';
    expect(toUnixSeconds(iso)).toBe(Date.parse(iso) / 1000);
  });

  it('returns null for missing or invalid input', () => {
    expect(toUnixSeconds(undefined)).toBeNull();
    expect(toUnixSeconds('')).toBeNull();
    expect(toUnixSeconds('not-a-date')).toBeNull();
  });
});

describe('buildSearchFilters', () => {
  it('returns no filters for empty args', () => {
    expect(buildSearchFilters({})).toEqual([]);
  });

  it('builds a quoted city filter', () => {
    expect(buildSearchFilters({ city: 'Linz' })).toEqual([
      'venue.address.city = "Linz"',
    ]);
  });

  it('escapes quotes inside the city name', () => {
    expect(buildSearchFilters({ city: 'Sankt "X"' })).toEqual([
      'venue.address.city = "Sankt \\"X\\""',
    ]);
  });

  it('keeps an injected filter expression inside the quoted string', () => {
    // Trailing backslash + injected clause: the classic breakout attempt.
    const [filter] = buildSearchFilters({ city: 'Wien\\" OR startDateTime > 0' });
    // Every quote in the payload stays escaped, so the only unescaped quotes
    // are the two the template itself contributes.
    expect(filter.replace(/\\\\/g, '').replace(/\\"/g, '')).toBe(
      'venue.address.city = "Wien OR startDateTime > 0"',
    );
  });

  it('caps how many categories a single call can filter on', () => {
    const many = Array.from({ length: 50 }, (_, i) => `cat${i}`);
    const [filter] = buildSearchFilters({ categories: many });
    expect(filter.match(/"/g)).toHaveLength(40); // 20 keys x 2 quotes
  });

  it('drops non-string and blank category entries', () => {
    expect(
      buildSearchFilters({
        categories: ['music.concert', '  ', 7 as unknown as string],
      }),
    ).toEqual(['categories IN ["music.concert"]']);
  });

  it('builds date range filters in unix seconds', () => {
    const dateFrom = '2026-07-25T00:00:00.000Z';
    const dateTo = '2026-07-27T00:00:00.000Z';
    expect(buildSearchFilters({ dateFrom, dateTo })).toEqual([
      `startDateTime >= ${Date.parse(dateFrom) / 1000}`,
      `startDateTime < ${Date.parse(dateTo) / 1000}`,
    ]);
  });

  it('drops unparseable dates instead of emitting NaN', () => {
    expect(buildSearchFilters({ dateFrom: 'tomorrow-ish' })).toEqual([]);
  });

  it('builds an IN filter for categories', () => {
    expect(
      buildSearchFilters({ categories: ['music.concert', 'art.exhibition'] }),
    ).toEqual(['categories IN ["music.concert", "art.exhibition"]']);
  });

  it('ignores an empty categories array', () => {
    expect(buildSearchFilters({ categories: [] })).toEqual([]);
  });

  it('combines all filters', () => {
    const filters = buildSearchFilters({
      city: 'Wien',
      dateFrom: '2026-07-25T00:00:00.000Z',
      categories: ['music.concert'],
    });
    expect(filters).toHaveLength(3);
    expect(filters[0]).toContain('venue.address.city');
    expect(filters[1]).toContain('startDateTime >=');
    expect(filters[2]).toContain('categories IN');
  });
});
