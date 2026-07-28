import { config } from './config.js';

/**
 * Per-call authorization + usage reporting. A key is optional:
 *  - No key → anonymous access is allowed (unless REQUIRE_API_KEY=true). The
 *    per-IP rate limit on the HTTP server is the anonymous abuse guard.
 *  - A key → the MCP server calls the backend's `authorize` endpoint, which
 *    validates it and consumes one unit of its per-minute budget (enforced in
 *    the backend/Redis, so it holds for every client including npx). A valid
 *    key also gets its usage tracked.
 * The API key itself is the credential — no shared secret to distribute.
 */

export interface AuthContext {
  /** The raw API key for the current request/session (may be undefined). */
  apiKey?: string;
}

export type AuthResult =
  | { ok: true; keyed: boolean; label?: string }
  | { ok: false; rateLimited: boolean; retryAfter?: number };

function authHeaders(rawKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${rawKey}`,
  };
}

export async function authorize(rawKey?: string): Promise<AuthResult> {
  if (!rawKey) {
    // Anonymous: allowed unless a key is explicitly required.
    return config.requireApiKey
      ? { ok: false, rateLimited: false }
      : { ok: true, keyed: false };
  }

  try {
    const response = await fetch(`${config.apiUrl}/api/mcp-api-keys/authorize`, {
      method: 'POST',
      headers: authHeaders(rawKey),
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
    if (response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        label?: string;
      };
      return { ok: true, keyed: true, label: body.label };
    }
    if (response.status === 429) {
      const body = (await response.json().catch(() => ({}))) as {
        retryAfter?: number;
      };
      return { ok: false, rateLimited: true, retryAfter: body.retryAfter };
    }
    // A key was provided but is invalid/revoked — reject rather than silently
    // falling back to anonymous, so a mistyped key is obvious.
    return { ok: false, rateLimited: false };
  } catch {
    // Fail closed for keyed requests: if we can't reach the backend, deny.
    return { ok: false, rateLimited: false };
  }
}

/** Fire-and-forget usage log; recorded whenever a key is present. */
export function recordUsage(
  rawKey: string | undefined,
  tool: string,
  resultCount?: number,
): void {
  if (!rawKey) {
    return;
  }
  void fetch(`${config.apiUrl}/api/mcp-api-keys/usage`, {
    method: 'POST',
    headers: authHeaders(rawKey),
    body: JSON.stringify({ tool, resultCount }),
    signal: AbortSignal.timeout(config.upstreamTimeoutMs),
  }).catch(() => {
    /* usage tracking is best-effort */
  });
}

/** Standard MCP tool-error result for an unauthorized call. */
export function unauthorizedResult() {
  return {
    content: [
      {
        type: 'text' as const,
        text:
          'Unauthorized: the provided wasmachen.at API key is invalid or ' +
          'revoked (or a key is required for this server). Generate one in your ' +
          'wasmachen.at profile under Developer, or omit it for anonymous access.',
      },
    ],
    structuredContent: { events: [] },
    isError: true,
  };
}

/** MCP tool-error result when the key is over its per-minute rate limit. */
export function rateLimitedResult(retryAfter?: number) {
  const wait = retryAfter && retryAfter > 0 ? ` Try again in ${retryAfter}s.` : '';
  return {
    content: [
      {
        type: 'text' as const,
        text: `Rate limit reached for this API key.${wait}`,
      },
    ],
    structuredContent: { events: [] },
    isError: true,
  };
}
