import { getCategories, getCitiesWithEvents } from './api-client.js';

/**
 * Discovery metadata baked into the search tool description so the model can
 * pick valid cities and category keys without extra discovery tools. Warmed at
 * boot and refreshed hourly; failures leave the previous snapshot in place.
 */

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const MAX_CITIES = 15;
const MAX_CATEGORY_KEYS = 60;
const MAX_LABEL_LENGTH = 60;

/**
 * These values are interpolated into the tool description, which the model
 * reads as instructions. Keeping them to short, single-line, punctuation-free
 * labels means a compromised or mistakenly-populated backend row can't smuggle
 * directives into the prompt.
 */
function sanitizeLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value
    .slice(0, MAX_LABEL_LENGTH)
    .replace(/[^\p{L}\p{N} .,'’&/()\-_]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || null;
}

let topCities: string[] = [];
let categoryKeys: string[] = [];
let lastRefresh = 0;

export async function refreshMetadata(): Promise<void> {
  try {
    const [cities, categories] = await Promise.all([
      getCitiesWithEvents(),
      getCategories(),
    ]);

    // cities-with-events groups by city+postalCode, so the same city repeats.
    const countsByCity = new Map<string, number>();
    for (const entry of cities) {
      const city = sanitizeLabel(entry?.city);
      if (!city) continue;
      const count = Number(entry.count);
      countsByCity.set(
        city,
        (countsByCity.get(city) ?? 0) + (Number.isFinite(count) ? count : 0),
      );
    }
    topCities = [...countsByCity.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_CITIES)
      .map(([city]) => city);

    categoryKeys = categories
      .filter((category) => !category?.hidden)
      .map((category) => sanitizeLabel(category?.i18nKey))
      .filter((key): key is string => key !== null)
      .slice(0, MAX_CATEGORY_KEYS);

    lastRefresh = Date.now();
  } catch (error) {
    console.warn('Failed to refresh discovery metadata; keeping previous snapshot', error);
  }
}

export function ensureMetadataFresh(): void {
  if (Date.now() - lastRefresh > REFRESH_INTERVAL_MS) {
    void refreshMetadata();
  }
}

export function getTopCities(): string[] {
  return topCities;
}

export function getCategoryKeys(): string[] {
  return categoryKeys;
}

export function buildSearchToolDescription(): string {
  const cityHint = topCities.length
    ? ` Cities with the most events: ${topCities.join(', ')}.`
    : '';
  const categoryHint = categoryKeys.length
    ? ` Valid category keys: ${categoryKeys.join(', ')}.`
    : '';
  return (
    'Search for real events in Austria on wasmachen.at using keyword search plus ' +
    'optional structured filters. Provide concise keywords (event type, artist, ' +
    'topic) in `query`, and use the city/date/category filters for anything ' +
    'structured rather than putting it in the query text. Results are upcoming ' +
    'events only. Never invent events - only reference events returned by this ' +
    'tool.' +
    cityHint +
    categoryHint
  );
}
