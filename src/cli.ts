#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpServer } from './server.js';
import { refreshMetadata } from './metadata.js';
import { config } from './config.js';
import { setProcessAgent } from './agent-context.js';

/**
 * stdio entry point for local MCP clients (Claude Desktop, Cursor, VS Code, …)
 * that launch the server via `npx wasmachen-events-mcp` and speak JSON-RPC over
 * stdin/stdout. ChatGPT uses the hosted HTTP server (src/index.ts) instead.
 *
 * IMPORTANT: stdout is the JSON-RPC channel — never write logs there. All
 * diagnostics go to stderr.
 */
async function main(): Promise<void> {
  if (config.requireApiKey && !config.stdioApiKey) {
    console.error(
      'This server is configured to require an API key, but ' +
        'WASMACHEN_MCP_API_KEY is not set. Add it to your MCP client config ' +
        '(env block), or unset REQUIRE_API_KEY for anonymous access.',
    );
    process.exit(1);
  }

  // Warm discovery metadata first so tool descriptions carry city/category
  // hints (the stdio server is built once, unlike the per-request HTTP path).
  await refreshMetadata();

  const server = buildMcpServer({ apiKey: config.stdioApiKey });
  // Tag backend calls with the local client (e.g. "claude-ai/0.1.0", "cursor-vscode/1.0.0").
  server.server.oninitialized = () => {
    const info = server.server.getClientVersion();
    if (info?.name) {
      setProcessAgent(info.version ? `${info.name}/${info.version}` : info.name);
    }
  };
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const mode = config.stdioApiKey
    ? 'with API key'
    : 'anonymous (set WASMACHEN_MCP_API_KEY for higher limits and usage tracking)';
  console.error(
    `wasmachen-events MCP server ready on stdio — ${mode} (backend: ${config.apiUrl})`,
  );
}

main().catch((error) => {
  console.error('Fatal error starting wasmachen-events MCP server:', error);
  process.exit(1);
});
