# wasmachen.at Events MCP — Copywriter Brief

Factual reference for website copy about the wasmachen.at Events MCP server.
Everything here is verified against the codebase. Treat the **"Don't overclaim"**
notes as hard constraints — they mark places where marketing language could
become inaccurate.

---

## What it is (one paragraph)

An [MCP](https://modelcontextprotocol.io) server that lets AI assistants
(Claude, ChatGPT, Cursor, VS Code, and any MCP client) search real events on
**wasmachen.at**, Austria's event-discovery platform. Users ask in natural
language — "concerts in Vienna next weekend", "was ist am Wochenende in Linz
los?" — and get back real, upcoming events with images, dates, venues, and map
coordinates. No account or API key required to start.

---

## Tools

Three tools are live. All return **upcoming events only** and never invent data
(the model is instructed to only reference events the tools return).

| Tool | What it does | Key inputs | Returns |
| --- | --- | --- | --- |
| **search-events** | Keyword search across all Austrian events with optional filters | `query` (keywords), `city`, `dateFrom`/`dateTo` (ISO), `categories`, `limit` (1–20, default 8) | Event cards: name, teaser, image, city, venue, start/end, categories, coordinates, link |
| **get-event** | Full detail for one event | `slug` | The card above **plus** description, street, postal code, website |
| **nearby-events** | Events near a place, nearest first | `location` (name, geocoded) **or** `latitude`+`longitude`; `radiusKm` (0.1–100, default 5); optional `query`, `categories`, `limit` | Event cards, distance-sorted |

**Don't overclaim:**
- Search is **keyword** matching (typo-tolerant), **not** AI/semantic search. Say
  "keyword search" or just "search" — not "AI-powered semantic search".
- There is no "trending/popular events" tool currently exposed. (One is built but
  disabled pending backend data — do **not** advertise it as available.)

---

## Prompts (guided shortcuts)

In clients that surface prompts (e.g. Claude Desktop slash-commands), two
one-click starters are available. The server pre-computes the tricky bits (exact
weekend dates in Austrian time).

| Prompt | Inputs | Does |
| --- | --- | --- |
| **events_this_weekend** | `city` (optional) | Finds this weekend's events; weekend boundaries computed in `Europe/Vienna`, DST-aware |
| **events_near_me** | `location` (required), `radiusKm` (optional) | Finds events near a place, nearest first |

---

## How to connect

| Path | Detail |
| --- | --- |
| **Hosted (ChatGPT & web clients)** | Add connector endpoint `https://mcp.wasmachen.at/mcp` (Streamable HTTP) |
| **Local / npx (Claude Desktop, Cursor, VS Code)** | `npx -y wasmachen-events-mcp` over stdio — no install, no build |
| **Compatibility** | Any MCP client. Speaks MCP protocol up to `2025-11-25` |

Selling point: **one command, works everywhere, no build step.**

---

## Access, keys & rate limits

| Aspect | Detail |
| --- | --- |
| **API key** | **Optional.** Anonymous access works out of the box |
| **Why get a key** | Higher rate limit + per-key usage tracking. That's the only difference — same tools, same data |
| **How keys are passed** | HTTP: `Authorization: Bearer <key>` or `x-api-key`. Local/npx: `WASMACHEN_MCP_API_KEY` env var |
| **Where to get one** | wasmachen.at profile → Developer section |
| **Anonymous rate limit** | 60 requests per minute, per IP |
| **Keyed rate limit** | Per-key limit enforced by the backend (tier-configurable), on top of usage tracking |
| **Locked-down mode** | Deployments can require a key (`REQUIRE_API_KEY`), but the public server does not |

**Don't overclaim:** don't quote a specific keyed rate-limit number — it's
tier-configurable, not a fixed public figure. "Higher limits with a free key" is
safe.

---

## Privacy / trust angles (all true, good for copy)

- **No account needed** to use it anonymously.
- **Stateless** server — no session tracking; each request is self-contained.
- **Minimal footprint** — the server doesn't advertise its stack (no
  `X-Powered-By` header).
- **Open source**, MIT licensed.

---

## Data & coverage

- Source: **wasmachen.at** event catalogue — Austria-wide.
- **Upcoming events only** (past events are filtered out).
- Rich cards: images, venue, city, start/end times, map coordinates, deep links
  back to wasmachen.at.
- **17 category keys**: exhibitions, tradition, festivals, tours, comedy,
  culinary, markets, religion, entertainment, talks, startups, arts-theatre,
  music, sports, nightlife, health, technology.
- Strong coverage in Upper Austria and the cities — Linz, Wien, Bad Ischl, Ried
  im Innkreis, Braunau am Inn, Steyr, Wels, Salzburg, Vöcklabruck, and more.
- Bilingual: users can ask in **German or English**.

**Don't overclaim:** city coverage is uneven (heaviest around Linz / Upper
Austria). "Events across Austria" is fine; "complete coverage of every Austrian
town" is not.

---

## Optional ChatGPT widget

An interactive **event carousel + map** widget (OpenAI Apps SDK) exists for
ChatGPT. It's **off by default** — the tools work as text + structured data in
every client without it. Only mention the visual widget in a ChatGPT-specific
context.

---

## One-line pitches (starting points, not final copy)

- "Ask your AI assistant what's on in Austria — real events, real dates, with a map."
- "wasmachen.at events, now inside Claude and ChatGPT. No key, no setup."
- "npx and go: Austrian event discovery for any AI assistant."
