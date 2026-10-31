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
  enableWidget: process.env.ENABLE_WIDGET === 'true',
  /**
   * Number of reverse proxies in front of this server, for Express' `trust
   * proxy`. Defaults to 0 (direct exposure): trusting a proxy that isn't there
   * lets anyone spoof `X-Forwarded-For` and sidestep the per-IP rate limit.
   * Set TRUST_PROXY_HOPS=1 when deploying behind exactly one proxy/load
   * balancer, and only then.
   */
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS) || 0,
  /**
   * Shared secret for forwarding the HTTP caller's IP to the backend
   * (`x-wasmachen-caller-ip`), so the admin's caller log and blocklist see the
   * real user rather than this container. Must equal the backend's
   * MCP_FORWARD_SECRET. Empty (the default, and always for npx) = not sent.
   */
  backendForwardSecret: process.env.BACKEND_FORWARD_SECRET || '',
  /**
   * Comma-separated list of browser origins allowed to call /mcp. Empty (the
   * default) means any origin — safe here because the endpoint carries no
   * ambient credentials (no cookies, no session), so a cross-origin call can
   * only ever act as an anonymous caller. Set it to lock the endpoint down to
   * known web clients.
   */
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
