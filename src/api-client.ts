import { config } from './config.js';

/**
 * Thin fetch wrappers around the wasmachen.at public event API. Every call
 * carries a hard timeout so a slow response can never hang an MCP tool call.
 */

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

export interface AssistantSearchResponse {
  hits: MeiliEventHit[];
  estimatedTotalHits?: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Backend request ${path} failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export function assistantSearch(
  searchString: string,
  filters: string[],
  limit: number,
): Promise<AssistantSearchResponse> {
  return apiFetch<AssistantSearchResponse>('/api/events/assistantSearch', {
    method: 'POST',
    body: JSON.stringify({ searchString, filters, limit }),
  });
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
