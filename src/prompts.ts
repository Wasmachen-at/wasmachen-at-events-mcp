import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * User-initiated prompt templates. In clients that surface them (e.g. Claude
 * Desktop slash-commands) these are the discoverability layer for the tools:
 * the server pre-computes the awkward bits (weekend date boundaries, sensible
 * defaults) and hands the model a clean instruction that maps onto a tool call.
 */

const TZ = 'Europe/Vienna';

/** Vienna wall-clock offset (ms to add to UTC) at a given instant — DST-aware. */
function tzOffsetMs(instant: Date): number {
  const utc = new Date(instant.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(instant.toLocaleString('en-US', { timeZone: TZ }));
  return local.getTime() - utc.getTime();
}

/** ISO (UTC) instant for Vienna-local midnight of the given Y-M-D. */
function viennaMidnightIso(year: number, month: number, day: number): string {
  const guessUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset = tzOffsetMs(new Date(guessUtc));
  return new Date(guessUtc - offset).toISOString();
}

/**
 * The upcoming weekend as [Saturday 00:00, Monday 00:00) in Vienna time. When
 * "now" is already Sat/Sun, returns the current weekend; from Monday on it
 * rolls to the next one.
 */
export function upcomingWeekend(now: Date): { dateFrom: string; dateTo: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const year = Number(part('year'));
  const month = Number(part('month'));
  const day = Number(part('day'));
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[
    part('weekday')
  ]!;

  // Sunday counts as the current weekend (Saturday was yesterday); otherwise
  // step forward to the coming Saturday.
  const daysToSat = dow === 0 ? -1 : 6 - dow;
  const sat = new Date(Date.UTC(year, month - 1, day) + daysToSat * 86400000);
  const mon = new Date(sat.getTime() + 2 * 86400000);
  const toIso = (d: Date) =>
    viennaMidnightIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return { dateFrom: toIso(sat), dateTo: toIso(mon) };
}

function userMessage(text: string) {
  return {
    messages: [
      { role: 'user' as const, content: { type: 'text' as const, text } },
    ],
  };
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'events_this_weekend',
    {
      title: 'Events this weekend',
      description:
        'Find events happening in Austria this coming weekend, optionally in a ' +
        'specific city.',
      argsSchema: {
        city: z
          .string()
          .optional()
          .describe('Optional city to focus on, e.g. "Wien", "Linz"'),
      },
    },
    ({ city }) => {
      const { dateFrom, dateTo } = upcomingWeekend(new Date());
      const where = city ? ` in ${city}` : '';
      const cityArg = city ? `, city="${city}"` : '';
      return userMessage(
        `Find events happening${where} this coming weekend on wasmachen.at. ` +
          `Call the search-events tool with dateFrom="${dateFrom}", ` +
          `dateTo="${dateTo}"${cityArg}, and a broad query. Present the results ` +
          `as a short list with each event's date, venue, and city.`,
      );
    },
  );

  server.registerPrompt(
    'events_near_me',
    {
      title: 'Events near a location',
      description:
        'Find upcoming events near a place, nearest first.',
      argsSchema: {
        location: z
          .string()
          .describe('Place to search around: city, address, or landmark'),
        radiusKm: z
          .string()
          .optional()
          .describe('Search radius in kilometres (default 5)'),
      },
    },
    ({ location, radiusKm }) => {
      const radius = Number(radiusKm);
      const radiusArg =
        Number.isFinite(radius) && radius > 0 ? `, radiusKm=${radius}` : '';
      return userMessage(
        `Find upcoming events near ${location} on wasmachen.at. Call the ` +
          `nearby-events tool with location="${location}"${radiusArg}. List the ` +
          `closest events first, each with its venue, city, and date.`,
      );
    },
  );
}
