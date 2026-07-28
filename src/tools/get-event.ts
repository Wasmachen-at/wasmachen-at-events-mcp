import { z } from 'zod';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getEventBySlug } from '../api-client.js';
import { config } from '../config.js';
import { pickImageUrl } from '../mappers.js';
import type { EventSummary } from '../mappers.js';
import { eventSummarySchema } from './search-events.js';
import { widgetToolMeta } from '../widget-resource.js';
import {
  authorize,
  rateLimitedResult,
  recordUsage,
  unauthorizedResult,
  type AuthContext,
} from '../auth.js';

const MAX_DESCRIPTION_LENGTH = 1200;

function toIso(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function stripHtml(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > MAX_DESCRIPTION_LENGTH
    ? `${text.slice(0, MAX_DESCRIPTION_LENGTH)}…`
    : text;
}

/** Maps a full event (from the public slug endpoint) to the card shape. */
function mapFullEventToSummary(event: Record<string, any>): EventSummary | null {
  const id = event?._id ?? event?.id;
  if (!id || !event?.name || !event?.slug) return null;
  return {
    id: String(id),
    name: event.name,
    slug: event.slug,
    url: `${config.siteUrl}/event/${event.slug}`,
    teaser: event.teaser ?? null,
    imageUrl: pickImageUrl(event.mediaObjects),
    city: event.venue?.address?.city ?? null,
    venueName: event.venue?.name ?? null,
    startDateTime: toIso(event.startDateTime),
    endDateTime: toIso(event.endDateTime),
    categories: event.categories ?? [],
    latitude: typeof event.geo?.latitude === 'number' ? event.geo.latitude : null,
    longitude: typeof event.geo?.longitude === 'number' ? event.geo.longitude : null,
  };
}

export function registerGetEventTool(
  server: McpServer,
  context: AuthContext = {},
): void {
  const toolConfig = {
    title: 'Get event details',
    description:
      'Fetch full details for a single wasmachen.at event by its slug. Use the ' +
      'slug values returned by search-events.',
    inputSchema: {
      slug: z.string().describe('Event slug from a previous search-events result'),
    },
    outputSchema: {
      events: z.array(eventSummarySchema),
      detail: z
        .object({
          description: z.string().nullable(),
          street: z.string().nullable(),
          postalCode: z.string().nullable(),
          web: z.string().nullable(),
        })
        .optional(),
    },
  };

  const handler = async ({ slug }: { slug: string }) => {
    const auth = await authorize(context.apiKey);
    if (!auth.ok) {
      return auth.rateLimited
        ? rateLimitedResult(auth.retryAfter)
        : unauthorizedResult();
    }
    let event: Record<string, any>;
    try {
      event = await getEventBySlug(slug);
    } catch {
      return {
        content: [
          { type: 'text' as const, text: `No event found for slug "${slug}".` },
        ],
        structuredContent: { events: [] },
        isError: true,
      };
    }

    const summary = mapFullEventToSummary(event);
    if (!summary) {
      return {
        content: [
          { type: 'text' as const, text: `No event found for slug "${slug}".` },
        ],
        structuredContent: { events: [] },
        isError: true,
      };
    }

    const detail = {
      description: stripHtml(event.description),
      street: event.venue?.address?.street ?? null,
      postalCode: event.venue?.address?.postalCode ?? null,
      web: typeof event.web === 'string' && event.web.trim() ? event.web : null,
    };

    const textParts = [
      summary.name,
      summary.startDateTime ? `Start: ${summary.startDateTime}` : null,
      summary.venueName
        ? `Venue: ${summary.venueName}${summary.city ? `, ${summary.city}` : ''}`
        : summary.city,
      detail.description,
      `Link: ${summary.url}`,
    ].filter(Boolean);

    recordUsage(context.apiKey, 'get-event', 1);
    return {
      content: [{ type: 'text' as const, text: textParts.join('\n') }],
      structuredContent: { events: [summary], detail },
    };
  };

  if (config.enableWidget) {
    registerAppTool(
      server,
      'get-event',
      {
        ...toolConfig,
        _meta: widgetToolMeta('Lade Event-Details…', 'Event-Details geladen'),
      },
      handler,
    );
  } else {
    server.registerTool('get-event', toolConfig, handler);
  }
}
