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
