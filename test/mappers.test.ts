import { describe, expect, it } from 'vitest';
import {
  mapHitToEventSummary,
  pickImageUrl,
  secondsToIso,
  summarizeEventsAsText,
} from '../src/mappers.js';
import type { MeiliEventHit } from '../src/api-client.js';

const START_ISO = '2026-07-25T18:00:00.000Z';
const START_SECONDS = Date.parse(START_ISO) / 1000;

describe('secondsToIso', () => {
  it('converts unix seconds to ISO strings', () => {
    expect(secondsToIso(START_SECONDS)).toBe(START_ISO);
  });

  it('returns null for empty-string dates (Meili unset marker)', () => {
    expect(secondsToIso('')).toBeNull();
    expect(secondsToIso(undefined)).toBeNull();
  });
});

describe('pickImageUrl', () => {
  it('prefers the small variant over the raw url', () => {
    expect(
      pickImageUrl([
        { url: 'https://img.example/original.jpg', variants: { small: 'https://img.example/small.jpg' } },
      ]),
    ).toBe('https://img.example/small.jpg');
  });

  it('falls back to the legacy url and handles array urls', () => {
    expect(pickImageUrl([{ url: ['https://img.example/a.jpg'] }])).toBe(
      'https://img.example/a.jpg',
    );
  });

  it('returns null when no media has a usable url', () => {
    expect(pickImageUrl([])).toBeNull();
    expect(pickImageUrl([{ url: '' }])).toBeNull();
    expect(pickImageUrl(undefined)).toBeNull();
  });
});

describe('mapHitToEventSummary', () => {
  const hit: MeiliEventHit = {
    id: 'event-1',
    name: 'Jazz Night',
    slug: 'jazz-night',
    teaser: 'An evening of jazz',
    categories: ['music.concert'],
    venue: { name: 'Posthof', address: { city: 'Linz' } },
    _geo: { lat: 48.3, lng: 14.3 },
    startDateTime: START_SECONDS,
    endDateTime: START_SECONDS + 3 * 3600,
    mediaObjects: [{ url: 'https://img.example/a.jpg' }],
  };

  it('maps a full hit to the card shape', () => {
    const summary = mapHitToEventSummary(hit);
    expect(summary).toMatchObject({
      id: 'event-1',
      name: 'Jazz Night',
      slug: 'jazz-night',
      teaser: 'An evening of jazz',
      imageUrl: 'https://img.example/a.jpg',
      city: 'Linz',
      venueName: 'Posthof',
      startDateTime: START_ISO,
      categories: ['music.concert'],
      latitude: 48.3,
      longitude: 14.3,
    });
    expect(summary?.url).toMatch(/\/event\/jazz-night$/);
  });

  it('fills nulls for missing optional fields', () => {
    const summary = mapHitToEventSummary({
      id: 'event-2',
      name: 'Mystery Event',
      slug: 'mystery-event',
      startDateTime: '',
    });
    expect(summary).toMatchObject({
      teaser: null,
      imageUrl: null,
      city: null,
      venueName: null,
      startDateTime: null,
      endDateTime: null,
      categories: [],
      latitude: null,
      longitude: null,
    });
  });

  it('returns null for hits without id or name', () => {
    expect(mapHitToEventSummary({ id: '', name: 'x', slug: 'x' })).toBeNull();
    expect(mapHitToEventSummary({ id: 'x', name: '', slug: 'x' })).toBeNull();
  });
});

describe('summarizeEventsAsText', () => {
  it('returns a friendly empty message', () => {
    expect(summarizeEventsAsText([])).toContain('Keine passenden Events');
  });

  it('lists events with name and url', () => {
    const summary = mapHitToEventSummary({
      id: 'event-1',
      name: 'Jazz Night',
      slug: 'jazz-night',
      startDateTime: START_SECONDS,
    });
    const text = summarizeEventsAsText([summary!]);
    expect(text).toContain('Found 1 events');
    expect(text).toContain('Jazz Night');
    expect(text).toContain('/event/jazz-night');
  });
});
