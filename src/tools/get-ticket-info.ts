import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTicketInfo } from '../api-client.js';
import {
  authorize,
  rateLimitedResult,
  recordUsage,
  unauthorizedResult,
  type AuthContext,
} from '../auth.js';

function toIso(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

const ticketTierSchema = z.object({
  label: z.string().nullable(),
  price: z.number(),
  saleStartDate: z.string().nullable(),
  saleEndDate: z.string().nullable(),
});

const ticketSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(['paid', 'free', 'donation', 'tiered']),
  price: z.number(),
  currency: z.string(),
  quantityAvailable: z.number().nullable(),
  minPerOrder: z.number().nullable(),
  maxPerOrder: z.number().nullable(),
  saleStartDate: z.string().nullable(),
  saleEndDate: z.string().nullable(),
  tiers: z.array(ticketTierSchema),
});

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export function registerGetTicketInfoTool(
  server: McpServer,
  context: AuthContext = {},
): void {
  const toolConfig = {
    title: 'Get ticket info for an event',
    description:
      'Get ticket price, availability and purchase link for a wasmachen.at ' +
      'event by its slug. Returns detailed ticket types when the event sells ' +
      'through the platform, otherwise an external ticket link if one exists. ' +
      'Use the slug values returned by search-events.',
    inputSchema: {
      slug: z
        .string()
        .min(1)
        .max(200)
        // Slugs are URL path segments; constraining the shape here keeps a
        // model-supplied value from probing other backend paths.
        .regex(/^[A-Za-z0-9._~-]+$/, 'Slug may only contain letters, digits, . _ ~ -')
        .describe('Event slug from a previous search-events result'),
    },
    outputSchema: {
      source: z.enum(['native', 'external_link', 'none']),
      eventSlug: z.string(),
      eventName: z.string(),
      startDateTime: z.string().nullable(),
      ticketUrl: z.string().nullable(),
      actionType: z.string().nullable(),
      tickets: z.array(ticketSchema),
    },
  };

  const handler = async ({ slug }: { slug: string }) => {
    const auth = await authorize(context.apiKey);
    if (!auth.ok) {
      return auth.rateLimited
        ? rateLimitedResult(auth.retryAfter)
        : unauthorizedResult();
    }

    let raw;
    try {
      raw = await getTicketInfo(slug);
    } catch {
      return {
        content: [
          { type: 'text' as const, text: `No event found for slug "${slug}".` },
        ],
        structuredContent: {
          source: 'none' as const,
          eventSlug: slug,
          eventName: '',
          startDateTime: null,
          ticketUrl: null,
          actionType: null,
          tickets: [],
        },
        isError: true,
      };
    }

    const tickets = (raw.tickets ?? []).map((ticket) => ({
      name: ticket.name,
      description: ticket.description ?? null,
      type: ticket.type,
      price: ticket.price,
      currency: ticket.currency,
      quantityAvailable:
        typeof ticket.quantityAvailable === 'number'
          ? ticket.quantityAvailable
          : null,
      minPerOrder: typeof ticket.minPerOrder === 'number' ? ticket.minPerOrder : null,
      maxPerOrder: typeof ticket.maxPerOrder === 'number' ? ticket.maxPerOrder : null,
      saleStartDate: toIso(ticket.saleStartDate),
      saleEndDate: toIso(ticket.saleEndDate),
      tiers: (ticket.tiers ?? []).map((tier) => ({
        label: tier.label ?? null,
        price: tier.price,
        saleStartDate: toIso(tier.saleStartDate),
        saleEndDate: toIso(tier.saleEndDate),
      })),
    }));

    // Any source other than these two known fallbacks means the event sells
    // through the platform directly with detailed ticket data.
    const isNative = raw.source !== 'external_link' && raw.source !== 'none';
    const structuredContent = {
      source: (isNative ? 'native' : raw.source) as
        | 'native'
        | 'external_link'
        | 'none',
      eventSlug: raw.eventSlug,
      eventName: raw.eventName,
      startDateTime: toIso(raw.startDateTime),
      ticketUrl: raw.ticketUrl ?? null,
      actionType: raw.actionType ?? null,
      tickets,
    };

    const textLines = [raw.eventName];
    if (structuredContent.startDateTime) {
      textLines.push(`Start: ${structuredContent.startDateTime}`);
    }
    if (isNative && tickets.length) {
      for (const ticket of tickets) {
        const availability =
          ticket.quantityAvailable === null
            ? ''
            : ` (${ticket.quantityAvailable} available)`;
        const price =
          ticket.type === 'free'
            ? 'Free'
            : ticket.type === 'donation'
              ? 'Donation'
              : formatMoney(ticket.price, ticket.currency);
        textLines.push(`- ${ticket.name}: ${price}${availability}`);
      }
      if (structuredContent.ticketUrl) {
        textLines.push(`Buy: ${structuredContent.ticketUrl}`);
      }
    } else if (structuredContent.ticketUrl) {
      textLines.push(`Tickets: ${structuredContent.ticketUrl}`);
    } else {
      textLines.push('No ticket information available for this event.');
    }

    recordUsage(context.apiKey, 'get-ticket-info', tickets.length);
    return {
      content: [{ type: 'text' as const, text: textLines.join('\n') }],
      structuredContent,
    };
  };

  server.registerTool('get-ticket-info', toolConfig, handler);
}
