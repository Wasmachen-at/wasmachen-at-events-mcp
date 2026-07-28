export interface EventSummary {
  id: string;
  name: string;
  slug: string;
  url: string;
  teaser: string | null;
  imageUrl: string | null;
  city: string | null;
  venueName: string | null;
  startDateTime: string | null;
  endDateTime: string | null;
  categories: string[];
  latitude: number | null;
  longitude: number | null;
}

export interface ToolOutput {
  events?: EventSummary[];
}

/** Minimal shape of the MCP Apps host bridge exposed on window.openai. */
export interface OpenAiBridge {
  toolOutput?: ToolOutput;
  theme?: 'light' | 'dark';
  openExternal?: (opts: { href: string }) => void;
}

declare global {
  interface Window {
    openai?: OpenAiBridge;
  }
}
