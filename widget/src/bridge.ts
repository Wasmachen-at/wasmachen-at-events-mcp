import type { EventSummary, ToolOutput } from './types';

/**
 * Reads tool output from the host and notifies on updates. Supports both host
 * conventions so the same widget runs across MCP Apps hosts:
 *  - ChatGPT Apps SDK: `window.openai.toolOutput` + `openai:set_globals` event.
 *  - MCP Apps standard: `ui/notifications/tool-result` over postMessage.
 */

export function readEvents(): EventSummary[] {
  const output = window.openai?.toolOutput as ToolOutput | undefined;
  return Array.isArray(output?.events) ? output!.events! : [];
}

export function getTheme(): 'light' | 'dark' {
  if (window.openai?.theme) return window.openai.theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function onUpdate(callback: () => void): void {
  window.addEventListener('openai:set_globals', () => callback());

  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (!message || message.jsonrpc !== '2.0') return;
    if (message.method === 'ui/notifications/tool-result') {
      const structured = message.params?.structuredContent as
        | ToolOutput
        | undefined;
      if (structured && Array.isArray(structured.events)) {
        // Mirror onto window.openai so readEvents() stays the single source.
        window.openai = window.openai ?? {};
        window.openai.toolOutput = structured;
      }
      callback();
    }
  });
}

export function openExternal(href: string): void {
  if (typeof window.openai?.openExternal === 'function') {
    window.openai.openExternal({ href });
    return;
  }
  window.open(href, '_blank', 'noopener,noreferrer');
}
