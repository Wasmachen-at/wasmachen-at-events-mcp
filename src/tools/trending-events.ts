import { z } from 'zod';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTrendingEvents } from '../api-client.js';
import { mapUnknownEventToSummary, summarizeEventsAsText } from '../mappers.js';
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

/** Backend caps `trending/{category}` results at 50 per call. */
const MAX_FETCH = 50;

/**
 * Interleaves per-category trending lists round-robin (1st of each category,
 * then 2nd, …), de-duplicating by slug. This surfaces a diverse trending feed
 * rather than draining the first category before the next — the backend's
 * `trending/{category}` endpoint scores within a category, not across them.
 */
function mergeRoundRobin(lists: EventSummary[][], limit: number): EventSummary[] {
  const merged: EventSummary[] = [];
  const seen = new Set<string>();
  const depth = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < depth && merged.length < limit; i++) {
    for (const list of lists) {
      const event = list[i];
      if (!event || seen.has(event.slug)) continue;
      seen.add(event.slug);
      merged.push(event);
      if (merged.length >= limit) break;
    }
  }
  return merged;
}

export function registerTrendingEventsTool(
  server: McpServer,
  context: AuthContext = {},
): void {
  const toolConfig = {
    title: 'Trending events on wasmachen.at',
    description:
      'Get currently trending events on wasmachen.at (7-day trend signal), ' +
      'aggregated across categories. Optionally restrict to specific category ' +
      'keys. Never invent events - only reference events returned by this tool.',
    inputSchema: {
      categories: z
        .array(z.string().max(100))
        .max(20)
        .optional()
        .describe(
          'Category keys to restrict trending to. Omit for all categories.',
        ),
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
    categories,
    limit,
  }: {
    categories?: string[];
    limit?: number;
  }) => {
    const auth = await authorize(context.apiKey);
    if (!auth.ok) {
      return auth.rateLimited
        ? rateLimitedResult(auth.retryAfter)
        : unauthorizedResult();
    }

    const max = limit ?? 8;
    let events: EventSummary[];

    if (categories?.length) {
      // Gorse's trending endpoint scores per category, so cross-category
      // aggregation still needs one call per category, merged round-robin.
      const perCategoryLimit = Math.min(Math.max(max * 3, max), MAX_FETCH);
      const lists = await Promise.all(
        categories.map(async (category) => {
          try {
            const raw = await getTrendingEvents(category, perCategoryLimit);
            return raw
              .map(mapUnknownEventToSummary)
              .filter((event): event is EventSummary => event !== null);
          } catch {
            // One failing category shouldn't sink the whole trending feed.
            return [];
          }
        }),
      );
      events = mergeRoundRobin(lists, max);
    } else {
      try {
        const raw = await getTrendingEvents('all', max);
        events = raw
          .map(mapUnknownEventToSummary)
          .filter((event): event is EventSummary => event !== null);
      } catch (error) {
        console.error('trending-events: backend request failed', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: 'The wasmachen.at trending feed is temporarily unavailable. Please try again.',
            },
          ],
          structuredContent: { events: [] },
          isError: true,
        };
      }
    }

    recordUsage(context.apiKey, 'trending-events', events.length);
    return {
      content: [{ type: 'text' as const, text: summarizeEventsAsText(events) }],
      structuredContent: { events },
    };
  };

  if (config.enableWidget) {
    registerAppTool(
      server,
      'trending-events',
      {
        ...toolConfig,
        _meta: widgetToolMeta('Suche Trending-Events…', 'Trending-Events gefunden'),
      },
      handler,
    );
  } else {
    server.registerTool('trending-events', toolConfig, handler);
  }
}
