/**
 * Builds MeiliSearch filter expressions from structured tool arguments.
 * Port of the backend's EventgptOrchestratorService.buildSearchFilters so the
 * MCP server produces exactly the filter strings the backend already
 * sanitizes and executes. The backend additionally appends
 * `startDateTime >= now` when no start-date constraint is present, so
 * upcoming-only is guaranteed server-side.
 *
 * Tool arguments are chosen by an LLM that may be steered by untrusted content
 * (a user prompt, or event text the model just read), so every value is treated
 * as untrusted input and escaped here rather than relying on the backend.
 */

export interface SearchFilterArgs {
  city?: string;
  dateFrom?: string;
  dateTo?: string;
  categories?: string[];
  /**
   * Append `startDateTime >= now` when no explicit start date is given.
   * `/assistantSearch` did this server-side; `/facetedSearch` is generic, so
   * the tools opt in to keep the "upcoming events only" guarantee.
   */
  upcomingOnly?: boolean;
}

/** Longest value accepted into a filter expression. */
const MAX_FILTER_VALUE_LENGTH = 200;
/** Cap on how many category keys a single call may filter on. */
const MAX_CATEGORIES = 20;
/** Control characters have no meaning in a filter value; drop them. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/**
 * Escapes a value for interpolation into a double-quoted MeiliSearch filter
 * string. The backslash MUST be escaped before the quote: escaping only `"`
 * lets a value ending in a backslash turn the closing quote into an escaped
 * quote, breaking out of the string literal and injecting filter syntax.
 */
export function escapeFilterValue(value: string): string {
  return (
    String(value)
      // Truncate first so a slice can never cut an escape pair in half.
      .slice(0, MAX_FILTER_VALUE_LENGTH)
      .replace(CONTROL_CHARS, '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
  );
}

/** Parses an ISO datetime into Unix seconds, or null when unparseable. */
export function toUnixSeconds(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

export function buildSearchFilters(args: SearchFilterArgs): string[] {
  const filters: string[] = [];
  if (args.city) {
    filters.push(`venue.address.city = "${escapeFilterValue(args.city)}"`);
  }
  const from = toUnixSeconds(args.dateFrom);
  if (from !== null) {
    filters.push(`startDateTime >= ${from}`);
  } else if (args.upcomingOnly) {
    filters.push(`startDateTime >= ${Math.floor(Date.now() / 1000)}`);
  }
  const to = toUnixSeconds(args.dateTo);
  if (to !== null) {
    filters.push(`startDateTime < ${to}`);
  }
  if (Array.isArray(args.categories) && args.categories.length) {
    const quoted = args.categories
      .filter((category) => typeof category === 'string' && category.trim())
      .slice(0, MAX_CATEGORIES)
      .map((category) => `"${escapeFilterValue(category)}"`)
      .join(', ');
    if (quoted) {
      filters.push(`categories IN [${quoted}]`);
    }
  }
  return filters;
}
