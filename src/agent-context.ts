import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Who is actually on the other end of the MCP connection (ChatGPT, Claude,
 * Cursor, …). Forwarded to the backend as `x-wasmachen-agent` on every API
 * call so the admin can break agent traffic down by AI client; the backend
 * turns the raw value into a friendly name and shows "Unknown" when it can't.
 *
 * - HTTP (stateless): the caller's User-Agent, scoped to the request with
 *   AsyncLocalStorage because tool handlers don't see the HTTP request.
 * - stdio: the `clientInfo` the client sent in `initialize` (one client per
 *   process, so a process-wide default is enough).
 */
export const AGENT_HEADER = 'x-wasmachen-agent';

const MAX_LENGTH = 200;
const storage = new AsyncLocalStorage<string | undefined>();
let processAgent: string | undefined;

/** Printable ASCII only (header-safe), trimmed and capped. */
export function sanitizeAgent(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .slice(0, MAX_LENGTH);
  return cleaned || undefined;
}

/**
 * Agent identifier for an HTTP /mcp request. ChatGPT tags tool calls with
 * `openai/*` keys in `params._meta`; that is a stronger signal than the
 * User-Agent, so it is kept even when the User-Agent says nothing useful.
 */
export function describeHttpAgent(
  userAgent: string | undefined,
  body: unknown,
): string | undefined {
  const ua = sanitizeAgent(userAgent);
  const meta = (body as { params?: { _meta?: Record<string, unknown> } } | null)
    ?.params?._meta;
  const fromChatGpt =
    !!meta && Object.keys(meta).some((key) => key.startsWith('openai/'));
  if (fromChatGpt && !/openai|chatgpt/i.test(ua ?? '')) {
    return sanitizeAgent(ua ? `chatgpt ${ua}` : 'chatgpt');
  }
  return ua;
}

export function runWithAgent<T>(agent: string | undefined, fn: () => T): T {
  return storage.run(agent, fn);
}

/** stdio: remember the client from `initialize` for the whole process. */
export function setProcessAgent(agent: string | undefined): void {
  processAgent = sanitizeAgent(agent);
}

export function currentAgent(): string | undefined {
  return storage.getStore() ?? processAgent;
}
