import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchEventsTool } from './tools/search-events.js';
import { registerGetEventTool } from './tools/get-event.js';
import { registerWidgetResource } from './widget-resource.js';
import { config } from './config.js';
import type { AuthContext } from './auth.js';

/**
 * Builds a fresh MCP server per request (stateless Streamable HTTP). Tool
 * descriptions embed the current discovery metadata snapshot, so a new server
 * instance always advertises up-to-date cities/categories. The auth context
 * carries the caller's API key so tool handlers can validate and record usage.
 */
export function buildMcpServer(context: AuthContext = {}): McpServer {
  const server = new McpServer({
    name: 'wasmachen-events',
    version: '1.0.0',
  });

  registerSearchEventsTool(server, context);
  registerGetEventTool(server, context);
  // ChatGPT-only UI widget; the tools work without it in every MCP client.
  if (config.enableWidget) {
    registerWidgetResource(server);
  }

  return server;
}
