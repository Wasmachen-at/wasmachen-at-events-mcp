import { z } from 'zod';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { assistantSearch } from '../api-client.js';
import { buildSearchFilters } from '../filters.js';
import { mapHitToEventSummary, summarizeEventsAsText } from '../mappers.js';
import type { EventSummary } from '../mappers.js';
import { buildSearchToolDescription, ensureMetadataFresh } from '../metadata.js';
import { widgetToolMeta } from '../widget-resource.js';
import { config } from '../config.js';
import {
  authorize,
  rateLimitedResult,
  recordUsage,
  unauthorizedResult,
  type AuthContext,
} from '../auth.js';

export const eventSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  url: z.string(),
  teaser: z.string().nullable(),
  imageUrl: z.string().nullable(),
  city: z.string().nullable(),
  venueName: z.string().nullable(),
  startDateTime: z.string().nullable(),
  endDateTime: z.string().nullable(),
  categories: z.array(z.string()),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

export function registerSearchEventsTool(
  server: McpServer,
  context: AuthContext = {},
): void {
  const toolConfig = {
    title: 'Search events on wasmachen.at',
    description: buildSearchToolDescription(),
    inputSchema: {
      query: z
        .string()
        .describe(
          'Natural-language description of the desired events, in German or English',
        ),
      city: z
        .string()
        .optional()
        .describe('Austrian city to filter to, e.g. "Wien", "Linz", "Graz"'),
      dateFrom: z
        .string()
        .optional()
        .describe('ISO datetime; only events starting at/after this time'),
      dateTo: z
        .string()
        .optional()
        .describe('ISO datetime; only events starting before this time'),
      categories: z
        .array(z.string())
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
    query,
    city,
    dateFrom,
    dateTo,
    categories,
    limit,
  }: {
    query: string;
    city?: string;
    dateFrom?: string;
    dateTo?: string;
    categories?: string[];
    limit?: number;
  }) => {
    const auth = await authorize(context.apiKey);
    if (!auth.ok) {
      return auth.rateLimited
        ? rateLimitedResult(auth.retryAfter)
        : unauthorizedResult();
    }
    ensureMetadataFresh();
    const filters = buildSearchFilters({ city, dateFrom, dateTo, categories });
    const response = await assistantSearch(query, filters, limit ?? 8);
    const events = (response.hits ?? [])
      .map(mapHitToEventSummary)
      .filter((event): event is EventSummary => event !== null);
    recordUsage(context.apiKey, 'search-events', events.length);
    return {
      content: [{ type: 'text' as const, text: summarizeEventsAsText(events) }],
      structuredContent: { events },
    };
  };

  if (config.enableWidget) {
    registerAppTool(
      server,
      'search-events',
      {
        ...toolConfig,
        _meta: widgetToolMeta(
          'Suche Events auf wasmachen.at…',
          'Events gefunden',
        ),
      },
      handler,
    );
  } else {
    server.registerTool('search-events', toolConfig, handler);
  }
}
