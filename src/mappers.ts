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
