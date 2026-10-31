import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer } from './server.js';
import { config } from './config.js';
import { refreshMetadata } from './metadata.js';
import { describeHttpAgent, runWithAgent } from './agent-context.js';
import { isKnownUnlimitedKey } from './auth.js';

const app = express();
// Don't advertise the server stack. Removes the default `X-Powered-By: Express`
// fingerprint from every response.
app.disable('x-powered-by');
// Only trust `X-Forwarded-For` when a proxy is actually configured — see
// config.trustProxyHops. Trusting a nonexistent proxy makes the client IP (and
// therefore the per-IP rate limit) attacker-controlled.
app.set('trust proxy', config.trustProxyHops);

// Baseline response headers. This server returns JSON only and is never framed,
// so everything can be locked down.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  next();
});

/** Extracts the API key from an Authorization: Bearer header or x-api-key. */
function extractApiKey(req: express.Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim();
  }
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  return undefined;
}

/**
 * Keys an admin created without a rate limit skip the per-IP limits too. Only
 * keys the backend already confirmed are skipped (no lookup happens here), so
 * sending an arbitrary key buys nothing.
 */
const skipForUnlimitedKey = (req: express.Request) => isKnownUnlimitedKey(extractApiKey(req));

// Global backstop so unauthenticated traffic can't hammer any route; /mcp gets
// its own, tighter budget below.
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: Math.max(config.ipRateLimitPerMin * 4, 120),
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipForUnlimitedKey,
  }),
);

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

const mcpRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: config.ipRateLimitPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipForUnlimitedKey,
});

/**
 * CORS for /mcp only, required by browser-based MCP clients (e.g. MCP
 * Inspector). Defaults to any origin: the endpoint carries no ambient
 * credentials — no cookies, no sessions — so a cross-origin request can only
 * ever act as an anonymous caller, and `Allow-Credentials` is never sent. Set
 * ALLOWED_ORIGINS to restrict it to known web clients.
 */
function resolveAllowedOrigin(origin: string | undefined): string | null {
  if (!config.allowedOrigins.length) return '*';
  if (origin && config.allowedOrigins.includes(origin)) return origin;
  return null;
}

app.use('/mcp', mcpRateLimit, (req, res, next) => {
  const origin = req.headers.origin;
  const allowed = resolveAllowedOrigin(origin);
  if (allowed === null) {
    res.status(403).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Origin not allowed' },
      id: null,
    });
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', allowed);
  if (allowed !== '*') {
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'content-type, mcp-session-id, mcp-protocol-version, authorization, x-api-key',
  );
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// JSON body parsing is scoped to /mcp — the only route that takes a body — and
// capped so a large payload can't exhaust memory.
app.use('/mcp', express.json({ limit: '100kb' }));

app.post('/mcp', async (req, res) => {
  const apiKey = extractApiKey(req);
  if (config.requireApiKey && !apiKey) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message:
          'Unauthorized: provide a wasmachen.at API key via Authorization: Bearer <key>.',
      },
      id: null,
    });
    return;
  }
  const server = buildMcpServer({ apiKey });
  const transport = new StreamableHTTPServerTransport({
    // Stateless mode: no session tracking, every request is self-contained.
    sessionIdGenerator: undefined,
  });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    // Tool handlers run inside handleRequest, so they see this request's agent.
    // req.ip honours TRUST_PROXY_HOPS, so it is the real caller only when
    // that matches the proxies in front of this server.
    await runWithAgent(
      describeHttpAgent(req.headers['user-agent'], req.body),
      () => transport.handleRequest(req, res, req.body),
      req.ip,
    );
  } catch (error) {
    console.error('Failed to handle MCP request', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// Stateless server: GET (SSE streams) and DELETE (session teardown) do not apply.
app.get('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed' },
    id: null,
  });
});
app.delete('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed' },
    id: null,
  });
});

// Catch-all error handler. Express' default renders the stack trace in the
// response body outside production; this always returns an opaque JSON-RPC
// error instead, and keeps details server-side.
app.use(
  (
    error: Error,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    // Malformed or oversized JSON bodies land here from express.json().
    const raw = (error as { status?: number }).status ?? 500;
    const status = raw >= 400 && raw < 600 ? raw : 500;
    if (status >= 500) {
      console.error('Unhandled error', error);
    }
    const [code, message] =
      status === 400
        ? [-32700, 'Parse error']
        : status === 413
          ? [-32600, 'Request body too large']
          : [-32603, 'Internal server error'];
    res.status(status).json({
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
    });
  },
);

// Never surface an upstream/tool failure as a crashed process.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection', reason);
});

app.listen(config.port, () => {
  console.log(`wasmachen MCP app listening on port ${config.port}`);
  console.log(`MCP endpoint: http://localhost:${config.port}/mcp`);
  void refreshMetadata();
});
