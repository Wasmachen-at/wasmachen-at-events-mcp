import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * config reads env at import time, so each test sets process.env and imports a
 * fresh module copy via vi.resetModules().
 */
async function loadAuth(env: Record<string, string> = {}) {
  vi.resetModules();
  delete process.env.REQUIRE_API_KEY;
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  return import('../src/auth.js');
}

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('authorize', () => {
  it('allows anonymous access by default (no key, no backend call)', async () => {
    const { authorize } = await loadAuth();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await authorize(undefined)).toEqual({ ok: true, keyed: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a missing key when REQUIRE_API_KEY=true', async () => {
    const { authorize } = await loadAuth({ REQUIRE_API_KEY: 'true' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await authorize(undefined)).toEqual({ ok: false, rateLimited: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('authorizes a valid key via the backend', async () => {
    const { authorize } = await loadAuth();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ label: 'Alice', remaining: 9 }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    expect(await authorize('wm_abc')).toEqual({
      ok: true,
      keyed: true,
      label: 'Alice',
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('/api/mcp-api-keys/authorize');
    expect(init.headers.authorization).toBe('Bearer wm_abc');
  });

  it('surfaces a 429 as a rate-limited result with retryAfter', async () => {
    const { authorize } = await loadAuth();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ retryAfter: 42 }),
      }),
    );
    expect(await authorize('wm_abc')).toEqual({
      ok: false,
      rateLimited: true,
      retryAfter: 42,
    });
  });

  it('rejects an invalid key rather than falling back to anonymous', async () => {
    const { authorize } = await loadAuth();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    expect(await authorize('wm_bad')).toEqual({ ok: false, rateLimited: false });
  });

  it('fails closed for a keyed request when the backend is unreachable', async () => {
    const { authorize } = await loadAuth();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await authorize('wm_x')).toEqual({ ok: false, rateLimited: false });
  });
});

describe('recordUsage', () => {
  it('posts usage with a Bearer token when a key is present', async () => {
    const { recordUsage } = await loadAuth();
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    recordUsage('wm_abc', 'search-events', 3);
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('/api/mcp-api-keys/usage');
    expect(init.headers.authorization).toBe('Bearer wm_abc');
    expect(JSON.parse(init.body)).toEqual({
      tool: 'search-events',
      resultCount: 3,
    });
  });

  it('does nothing for anonymous calls (no key)', async () => {
    const { recordUsage } = await loadAuth();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    recordUsage(undefined, 'search-events', 1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
