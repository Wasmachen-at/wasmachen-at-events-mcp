import { config } from './config.js';
import { AGENT_HEADER, currentAgent } from './agent-context.js';

/**
 * Thin fetch wrappers around the wasmachen.at public event API. Every call
 * carries a hard timeout so a slow response can never hang an MCP tool call.
 */

/**
 * Identifies every request as originating from the MCP server (i.e. an AI
 * agent). Sent on all backend calls via `apiFetch`; the backend can branch on
 * its presence (AI-agent traffic) or parse the value for client + version.
 */
const CLIENT_ID = 'wasmachen-events-mcp/1.0.0';

export interface MeiliEventHit {
  id: string;
  name: string;
  slug: string;
  teaser?: string | null;
  categories?: string[];
  venue?: {
    name?: string;
    url?: string;
    address?: {
      city?: string;
      street?: string;
      postalCode?: string;
      state?: string;
      country?: string;
    };
  };
  _geo?: { lat?: number; lng?: number };
  /** Unix seconds (MeiliSearch storage format), or '' when unset. */
  startDateTime?: number | string;
  endDateTime?: number | string;
  mediaObjects?: Array<Record<string, unknown>>;
}

export interface EventSearchResponse {
  hits: MeiliEventHit[];
  estimatedTotalHits?: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const agent = currentAgent();
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    headers: {
      'content-type': 'application/json',
      'x-wasmachen-client': CLIENT_ID,
      ...(agent ? { [AGENT_HEADER]: agent } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Backend request ${path} failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Plain MeiliSearch faceted search — keyword `searchString` + Meili filter
 * expressions, no AI/embedding step (unlike `/assistantSearch`, which spends AI
 * credits interpreting free text). The MCP client is itself an LLM, so it
 * supplies the keywords and structured filters and we search directly. Returns
 * the full card projection (geo, media, teaser, categories).
 */
export function facetedSearch(
  searchString: string,
  filters: string[],
  limit: number,
  sort: string[] = [],
): Promise<EventSearchResponse> {
  return apiFetch<EventSearchResponse>('/api/events/facetedSearch', {
    method: 'POST',
    body: JSON.stringify({
      searchString,
      facets: [],
      filters,
      sort,
      offset: 0,
      limit,
    }),
  });
}

export interface NominatimPlace {
  lat: string;
  lon: string;
  display_name?: string;
  name?: string;
  addresstype?: string;
}

/**
 * Geocodes a free-text place name (city, address, landmark) to coordinates via
 * the backend's Nominatim proxy. Used by `nearby-events` to turn a location
 * name into the centre point of a geo-radius search.
 */
export function geoSearch(query: string, limit = 1): Promise<NominatimPlace[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: String(limit),
  });
  return apiFetch<NominatimPlace[]>(`/api/geo/search?${params.toString()}`);
}

/**
 * Popularity-ranked events for a single category key. Shape is a plain event
 * array (mapped defensively downstream). Returns `[]` when the backend has no
 * popularity signal for the category.
 */
export function getPopularEvents(category: string): Promise<unknown[]> {
  return apiFetch<unknown[]>(
    `/api/events/popular/${encodeURIComponent(category)}`,
  );
}

export function getEventBySlug(slug: string): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(
    `/api/events/slug/${encodeURIComponent(slug)}`,
  );
}

export function getCitiesWithEvents(): Promise<
  Array<{ city: string; postalCode: string; count: number }>
> {
  return apiFetch<Array<{ city: string; postalCode: string; count: number }>>(
    '/api/events/cities-with-events',
  );
}

export function getCategories(): Promise<
  Array<{ name: string; i18nKey: string; hidden?: boolean }>
> {
  return apiFetch<Array<{ name: string; i18nKey: string; hidden?: boolean }>>(
    '/api/category',
  );
}

export interface AgentCategory {
  id: string;
  name: string;
  i18nKey: string;
  translations: Record<string, string>;
  subCategories?: AgentCategory[];
}

/**
 * Agent-facing category vocabulary: top-level categories only, hidden
 * categories excluded at every level, translations included. Richer than
 * `getCategories` (hierarchy + translations) but only exposes what agents may
 * use as search filters.
 */
export function getCategoriesForAgents(): Promise<AgentCategory[]> {
  return apiFetch<AgentCategory[]>('/api/category/agent-list');
}

/**
 * Gorse-backed 7-day trending events for a category (or `all`). Returns full
 * event documents, like `getPopularEvents`.
 */
export function getTrendingEvents(
  category: string,
  limit?: number,
): Promise<unknown[]> {
  const query = limit ? `?limit=${encodeURIComponent(String(limit))}` : '';
  return apiFetch<unknown[]>(
    `/api/events/trending/${encodeURIComponent(category)}${query}`,
  );
}

export interface TicketInfoTier {
  label?: string | null;
  price: number;
  saleStartDate?: string | null;
  saleEndDate?: string | null;
}

export interface TicketInfoTicket {
  name: string;
  description?: string;
  type: 'paid' | 'free' | 'donation' | 'tiered';
  price: number;
  currency: string;
  quantityAvailable?: number | null;
  minPerOrder?: number;
  maxPerOrder?: number;
  saleStartDate?: string | null;
  saleEndDate?: string | null;
  tiers?: TicketInfoTier[];
}

export interface TicketInfoResponse {
  /** Backend-defined; 'external_link' and 'none' are the only stable values we branch on. */
  source: 'external_link' | 'none' | string;
  eventSlug: string;
  eventName: string;
  startDateTime: string;
  tickets: TicketInfoTicket[];
  ticketUrl?: string;
  actionType?: string;
}

/**
 * Unified ticket/price/availability summary for an event: detailed product
 * data when the event sells through the platform directly, otherwise whatever
 * external ticket link the event carries (or `source: 'none'` when neither
 * applies).
 */
export function getTicketInfo(slug: string): Promise<TicketInfoResponse> {
  return apiFetch<TicketInfoResponse>(
    `/api/public/events/${encodeURIComponent(slug)}/ticket-info`,
  );
}
