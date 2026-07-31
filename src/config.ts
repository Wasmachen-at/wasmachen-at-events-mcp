export const config = {
  port: Number(process.env.PORT) || 3007,
  /**
   * Base URL of the wasmachen.at API. Defaults to production so `npx` installs
   * work out of the box; override via WASMACHEN_API_URL for staging or local
   * development.
   */
  apiUrl: (process.env.WASMACHEN_API_URL || 'https://wasmachen.at').replace(/\/+$/, ''),
  /** Public site URL used to build event links shown to users. */
  siteUrl: (process.env.PUBLIC_SITE_URL || 'https://wasmachen.at').replace(/\/+$/, ''),
  /** Timeout for calls to the backend API, in milliseconds. */
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS) || 5000,
  /**
   * Per-IP request limit per minute on the HTTP server — the abuse guard for
   * anonymous (keyless) traffic. Keyed requests additionally get their own
   * per-key limit enforced in the backend.
   */
  ipRateLimitPerMin: Number(process.env.IP_RATE_LIMIT_PER_MIN) || 60,
  /**
   * Whether a valid API key is required. Defaults to false: anonymous access
   * works (guarded by a per-IP rate limit), and a key is optional — it unlocks
   * per-key usage tracking and a higher, tier-configurable limit. Set
   * REQUIRE_API_KEY=true to lock a deployment down to key holders only.
   */
  requireApiKey: process.env.REQUIRE_API_KEY === 'true',
  /** Key presented for stdio/npx installs (no HTTP headers available there). */
  stdioApiKey: process.env.WASMACHEN_MCP_API_KEY || '',
  /**
   * ChatGPT Apps SDK widget (event carousel + map UI). Off by default — the
   * core tools work in every MCP client (Claude, Cursor, …) without it. Set
   * ENABLE_WIDGET=true to advertise the interactive widget to ChatGPT.
   */
  enableWidget: process.env.ENABLE_WIDGET === 'false',
};
