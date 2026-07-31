import { z } from 'zod';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { facetedSearch, geoSearch } from '../api-client.js';
import { buildSearchFilters } from '../filters.js';
import {
  haversineKm,
  mapHitToEventSummary,
  summarizeEventsAsText,
} from '../mappers.js';
import type { EventSummary } from '../mappers.js';
import { eventSummarySchema } from './search-events.js';
import { widgetToolMeta } from '../widget-resource.js';
import { config } from '../config.js';
import {
  authorize,
  rateLimitedResult,
  recordUsage,
  unauthorizedResult,
  type AuthContext,
} from '../auth.js';

/** Over-fetch cap: pull extra within the radius, then sort by distance. */
const MAX_FETCH = 30;

export function registerNearbyEventsTool(
  server: McpServer,
  context: AuthContext = {},
): void {
  const toolConfig = {
    title: 'Find events near a location',
    description:
      'Find upcoming events near a place, sorted nearest first. Provide either ' +
      'a location name (city, address, or landmark, e.g. "Karlsplatz, Wien") ' +
      'or explicit latitude/longitude. Optionally narrow with a natural-language ' +
      'query and/or category keys. Never invent events - only reference events ' +
      'returned by this tool.',
    inputSchema: {
      location: z
        .string()
        .max(200)
        .optional()
        .describe(
          'Place to search around: city, address, or landmark. Geocoded to ' +
            'coordinates. Omit if you pass latitude/longitude directly.',
        ),
      latitude: z
        .number()
        .min(-90)
        .max(90)
        .optional()
        .describe('Latitude of the search centre (use with longitude)'),
      longitude: z
        .number()
        .min(-180)
        .max(180)
        .optional()
        .describe('Longitude of the search centre (use with latitude)'),
      radiusKm: z
        .number()
        .min(0.1)
        .max(100)
        .optional()
        .describe('Search radius in kilometres, default 5'),
      query: z
        .string()
        .max(300)
        .optional()
        .describe('Optional natural-language refinement, in German or English'),
      categories: z
        .array(z.string().max(100))
        .max(20)
        .optional()
        .describe('Category keys to filter to, if the user names a category'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Max results, default 8'),
    },
    outputSchema: {
      events: z.array(eventSummarySchema),
    },
  };

  const handler = async ({
    location,
    latitude,
    longitude,
    radiusKm,
    query,
    categories,
    limit,
  }: {
    location?: string;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    query?: string;
    categories?: string[];
    limit?: number;
  }) => {
    const auth = await authorize(context.apiKey);
    if (!auth.ok) {
      return auth.rateLimited
        ? rateLimitedResult(auth.retryAfter)
        : unauthorizedResult();
    }

    // Resolve the search centre: explicit coordinates win; otherwise geocode
    // the location name via the backend's Nominatim proxy.
    let centreLat = latitude;
    let centreLng = longitude;
    if (centreLat === undefined || centreLng === undefined) {
      if (!location) {
        return errorResult(
          'Provide a location name, or both latitude and longitude.',
        );
      }
      try {
        const [place] = await geoSearch(location, 1);
        if (!place) {
          return errorResult(`Could not geocode location "${location}".`);
        }
        centreLat = Number(place.lat);
        centreLng = Number(place.lon);
      } catch {
        return errorResult(`Failed to geocode location "${location}".`);
      }
    }
    if (!Number.isFinite(centreLat) || !Number.isFinite(centreLng)) {
      return errorResult('Resolved an invalid search centre.');
    }

    const max = limit ?? 8;
    const radius = radiusKm ?? 5;
    const filters = buildSearchFilters({ categories, upcomingOnly: true });
    filters.push(`_geoRadius(${centreLat}, ${centreLng}, ${Math.round(radius * 1000)})`);

    let response;
    try {
      response = await facetedSearch(
        query ?? '',
        filters,
        Math.min(Math.max(max * 3, max), MAX_FETCH),
      );
    } catch (error) {
      // Never surface the upstream URL/status to the caller; log it instead.
      console.error('nearby-events: backend search failed', error);
      return errorResult(
        'The wasmachen.at event search is temporarily unavailable. Please try again.',
      );
    }

    const events = (response.hits ?? [])
      .map(mapHitToEventSummary)
      .filter((event): event is EventSummary => event !== null)
      .map((event) => ({
        event,
        distanceKm:
          event.latitude !== null && event.longitude !== null
            ? haversineKm(centreLat!, centreLng!, event.latitude, event.longitude)
            : Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, max)
      .map(({ event }) => event);

    recordUsage(context.apiKey, 'nearby-events', events.length);
    return {
      content: [{ type: 'text' as const, text: summarizeEventsAsText(events) }],
      structuredContent: { events },
    };
  };

  if (config.enableWidget) {
    registerAppTool(
      server,
      'nearby-events',
      {
        ...toolConfig,
        _meta: widgetToolMeta('Suche Events in der Nähe…', 'Events in der Nähe gefunden'),
      },
      handler,
    );
  } else {
    server.registerTool('nearby-events', toolConfig, handler);
  }
}

function errorResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: { events: [] },
    isError: true,
  };
}
