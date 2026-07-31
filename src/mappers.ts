import type { MeiliEventHit } from './api-client.js';
import { config } from './config.js';

/**
 * The card-shaped event summary returned to the model (structuredContent) and
 * rendered by the widget. Mirrors the wasmachen.at event summary used by the
 * in-app assistant, extended with url/venueName/coordinates for the widget's
 * link-outs and map view.
 */
export interface EventSummary {
  id: string;
  name: string;
  slug: string;
  url: string;
  teaser: string | null;
  imageUrl: string | null;
  city: string | null;
  venueName: string | null;
  startDateTime: string | null;
  endDateTime: string | null;
  categories: string[];
  latitude: number | null;
  longitude: number | null;
}

/** MeiliSearch stores dates as Unix seconds; '' when unset. */
export function secondsToIso(value?: number | string): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

/**
 * Resolves a card image from mediaObjects: prefers the small CDN variant
 * (cards render ~300px wide), then any resolved url. Media can come from
 * arbitrary external hosts, so the widget still needs an onerror fallback.
 */
export function pickImageUrl(
  mediaObjects?: Array<Record<string, unknown>>,
): string | null {
  if (!Array.isArray(mediaObjects)) return null;
  for (const media of mediaObjects) {
    const variants = media?.variants as Record<string, unknown> | undefined;
    const candidates = [
      variants?.small,
      variants?.large,
      variants?.original,
      Array.isArray(media?.url) ? media.url[0] : media?.url,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length) {
        return candidate.trim();
      }
    }
  }
  return null;
}

export function mapHitToEventSummary(hit: MeiliEventHit): EventSummary | null {
  if (!hit || !hit.id || !hit.name) return null;
  return {
    id: hit.id,
    name: hit.name,
    slug: hit.slug,
    url: `${config.siteUrl}/event/${hit.slug}`,
    teaser: hit.teaser ?? null,
    imageUrl: pickImageUrl(hit.mediaObjects),
    city: hit.venue?.address?.city ?? null,
    venueName: hit.venue?.name ?? null,
    startDateTime: secondsToIso(hit.startDateTime),
    endDateTime: secondsToIso(hit.endDateTime),
    categories: hit.categories ?? [],
    latitude: typeof hit._geo?.lat === 'number' ? hit._geo.lat : null,
    longitude: typeof hit._geo?.lng === 'number' ? hit._geo.lng : null,
  };
}

/**
 * Great-circle distance between two coordinates, in kilometres. Used to
 * distance-sort nearby-events results (the search endpoint has no geo `sort`).
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Coerces a date that may be Unix seconds, ISO string, or Date to ISO. */
function anyToIso(value: unknown): string | null {
  if (typeof value === 'number') return secondsToIso(value);
  if (typeof value === 'string' && value.trim()) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  return null;
}

/**
 * Tolerant mapper for event documents whose shape isn't guaranteed — the
 * `popular/{category}` endpoint returns plain event docs (id/geo/venue) rather
 * than MeiliSearch hits (_id/_geo). Handles either.
 */
export function mapUnknownEventToSummary(raw: unknown): EventSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const event = raw as Record<string, any>;
  const id = event._id ?? event.id;
  if (!id || !event.name || !event.slug) return null;
  const lat = event._geo?.lat ?? event.geo?.latitude;
  const lng = event._geo?.lng ?? event.geo?.longitude;
  return {
    id: String(id),
    name: event.name,
    slug: event.slug,
    url: `${config.siteUrl}/event/${event.slug}`,
    teaser: event.teaser ?? null,
    imageUrl: pickImageUrl(event.mediaObjects),
    city: event.venue?.address?.city ?? null,
    venueName: event.venue?.name ?? null,
    startDateTime: anyToIso(event.startDateTime),
    endDateTime: anyToIso(event.endDateTime),
    categories: Array.isArray(event.categories) ? event.categories : [],
    latitude: typeof lat === 'number' ? lat : null,
    longitude: typeof lng === 'number' ? lng : null,
  };
}

/** Short text list the model (and text-only MCP clients) can read directly. */
export function summarizeEventsAsText(events: EventSummary[]): string {
  if (!events.length) {
    return 'Keine passenden Events gefunden. / No matching events found.';
  }
  const lines = events.map((event) => {
    const parts = [event.name];
    if (event.startDateTime) parts.push(event.startDateTime.slice(0, 16));
    if (event.venueName) parts.push(event.venueName);
    if (event.city) parts.push(event.city);
    return `- ${parts.join(' | ')} (${event.url})`;
  });
  return `Found ${events.length} events:\n${lines.join('\n')}`;
}
