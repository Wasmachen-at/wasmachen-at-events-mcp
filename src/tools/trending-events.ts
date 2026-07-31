import { z } from 'zod';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getPopularEvents } from '../api-client.js';
import { mapUnknownEventToSummary, summarizeEventsAsText } from '../mappers.js';
import type { EventSummary } from '../mappers.js';
import { eventSummarySchema } from './search-events.js';
import { getCategoryKeys, refreshMetadata } from '../metadata.js';
import { widgetToolMeta } from '../widget-resource.js';
import { config } from '../config.js';
import {
  authorize,
  rateLimitedResult,
  recordUsage,
  unauthorizedResult,
  type AuthContext,
} from '../auth.js';

/**
 * Interleaves per-category popularity lists round-robin (1st of each category,
 * then 2nd, …), de-duplicating by slug. This surfaces a diverse trending feed
 * rather than draining the first category before the next — the backend's
 * `popular/{category}` endpoint has no cross-category score to sort on.
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
      'Get currently popular/trending events on wasmachen.at, aggregated across ' +
      'categories. Optionally restrict to specific category keys. Never invent ' +
      'events - only reference events returned by this tool.',
    inputSchema: {
      categories: z
        .array(z.string())
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

    // Resolve the category set: caller-supplied, else the discovery snapshot.
    // The snapshot is warmed at boot, but await a refresh if it's still empty.
    let categoryKeys = categories?.length ? categories : getCategoryKeys();
    if (!categoryKeys.length) {
      await refreshMetadata();
      categoryKeys = getCategoryKeys();
    }

    const max = limit ?? 8;
    const lists = await Promise.all(
      categoryKeys.map(async (category) => {
        try {
          const raw = await getPopularEvents(category);
          return raw
            .map(mapUnknownEventToSummary)
            .filter((event): event is EventSummary => event !== null);
        } catch {
          // One failing category shouldn't sink the whole trending feed.
          return [];
        }
      }),
    );

    const events = mergeRoundRobin(lists, max);
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
