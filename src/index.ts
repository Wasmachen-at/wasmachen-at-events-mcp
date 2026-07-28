import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer } from './server.js';
import { config } from './config.js';
import { refreshMetadata } from './metadata.js';

const app = express();
// Behind a reverse proxy in production; needed for per-IP rate limiting.
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

const mcpRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: config.ipRateLimitPerMin,
  standardHeaders: true,
  legacyHeaders: false,
});

// Permissive CORS on /mcp only - required by browser-based MCP clients
// (e.g. MCP Inspector). Access itself is gated by the API key below.
app.use('/mcp', mcpRateLimit, (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
    await transport.handleRequest(req, res, req.body);
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

app.listen(config.port, () => {
  console.log(`wasmachen MCP app listening on port ${config.port}`);
  console.log(`MCP endpoint: http://localhost:${config.port}/mcp`);
  void refreshMetadata();
});
