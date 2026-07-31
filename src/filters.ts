/**
 * Builds MeiliSearch filter expressions from structured tool arguments.
 * Port of the backend's EventgptOrchestratorService.buildSearchFilters so the
 * MCP server produces exactly the filter strings the backend already
 * sanitizes and executes. The backend additionally appends
 * `startDateTime >= now` when no start-date constraint is present, so
 * upcoming-only is guaranteed server-side.
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

export function escapeFilterValue(value: string): string {
  return String(value).replace(/"/g, '\\"');
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
      .map((category) => `"${escapeFilterValue(category)}"`)
      .join(', ');
    filters.push(`categories IN [${quoted}]`);
  }
  return filters;
}
