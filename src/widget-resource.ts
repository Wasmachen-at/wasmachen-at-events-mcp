import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const WIDGET_RESOURCE_URI = 'ui://widget/event-carousel.html';

/**
 * ChatGPT Apps SDK `_meta` binding a tool to the widget. Only used when the
 * widget is enabled; otherwise tools register as plain MCP tools (what Claude
 * and other clients use anyway).
 */
export function widgetToolMeta(invoking: string, invoked: string) {
  return {
    ui: { resourceUri: WIDGET_RESOURCE_URI },
    'openai/toolInvocation/invoking': invoking,
    'openai/toolInvocation/invoked': invoked,
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedHtml: string | null = null;

function loadWidgetHtml(): string {
  if (cachedHtml === null) {
    // Emitted by scripts/build-widget.mjs; lives next to dist/src at runtime.
    cachedHtml = readFileSync(
      join(__dirname, '..', 'widget', 'event-carousel.html'),
      'utf8',
    );
  }
  return cachedHtml;
}

export function registerWidgetResource(server: McpServer): void {
  registerAppResource(
    server,
    'event-carousel',
    WIDGET_RESOURCE_URI,
    {
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            // MapLibre fetches OpenFreeMap tiles/glyphs/sprites at runtime.
            connectDomains: ['https://tiles.openfreemap.org'],
            // Event image hosts; other hosts fall back to the gradient
            // placeholder via the widget's onerror handler.
            resourceDomains: [
              'https://tiles.openfreemap.org',
              'https://*.blob.core.windows.net',
              'https://wasmachen.at',
            ],
          },
        },
      },
    },
    async () => ({
      contents: [
        {
          uri: WIDGET_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: loadWidgetHtml(),
        },
      ],
    }),
  );
}
