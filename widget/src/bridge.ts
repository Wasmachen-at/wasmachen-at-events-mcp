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

/**
 * The widget renders inside a host-controlled iframe, so the only legitimate
 * sender of `ui/notifications/tool-result` is the embedding host window. Any
 * other frame that can reach this one must not be able to inject event data —
 * the rendered names, teasers and link targets all come from it.
 */
function isFromHost(event: MessageEvent): boolean {
  return event.source !== null && event.source === window.parent;
}

export function onUpdate(callback: () => void): void {
  window.addEventListener('openai:set_globals', () => callback());

  window.addEventListener('message', (event: MessageEvent) => {
    if (!isFromHost(event)) return;
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

/**
 * Only ever hand http(s) URLs to the host or to `window.open`. Event URLs are
 * server-generated, but this is the one place widget data turns into a
 * navigation, so it fails closed rather than trusting the data path — a
 * `javascript:` or `data:` target would otherwise run in the widget's context.
 */
export function isSafeHref(href: string): boolean {
  if (typeof href !== 'string') return false;
  try {
    const { protocol } = new URL(href, window.location.href);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export function openExternal(href: string): void {
  if (!isSafeHref(href)) return;
  if (typeof window.openai?.openExternal === 'function') {
    window.openai.openExternal({ href });
    return;
  }
  window.open(href, '_blank', 'noopener,noreferrer');
}
