# wasmachen-events-mcp

An [MCP](https://modelcontextprotocol.io) server that lets AI assistants like
ChatGPT and Claude search events on [wasmachen.at](https://wasmachen.at) — the
Austrian event discovery platform. Ask for concerts, exhibitions, or things to
do this weekend, and get back real events with images, dates, venues, and a map.

It works with any MCP client out of the box (structured results + text). An
optional [OpenAI Apps SDK](https://developers.openai.com/apps-sdk) /
[MCP Apps](https://github.com/modelcontextprotocol/ext-apps) widget (event
carousel + map) is included for ChatGPT but is off by default — see
[Configuration](#configuration).

## Quick start (npx)

Any MCP client that launches servers over stdio can run this package directly.
No API key is required — add this to your client's MCP config and go:

```json
{
  "mcpServers": {
    "wasmachen-events": {
      "command": "npx",
      "args": ["-y", "wasmachen-events-mcp"]
    }
  }
}
```

An API key is **optional** — it raises your rate limit and tracks your usage.
Add it under `env` when you have one (see [API keys](#api-keys)):

```json
{
  "mcpServers": {
    "wasmachen-events": {
      "command": "npx",
      "args": ["-y", "wasmachen-events-mcp"],
      "env": { "WASMACHEN_MCP_API_KEY": "wm_your_key_here" }
    }
  }
}
```

Config file locations for common clients:

| Client         | Config file                                                              |
| -------------- | ------------------------------------------------------------------------ |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) · `%APPDATA%\Claude\claude_desktop_config.json` (Windows) |
| Cursor         | `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project)         |
| VS Code        | `.vscode/mcp.json` — nest the entry under a top-level `"servers"` key     |

Then ask your assistant something like *“Was kann ich am Wochenende in Linz
machen?”* or *“Show me concerts in Vienna next month.”*

### ChatGPT (hosted)

In ChatGPT you don't use npx — add the hosted server as a connector:

- **Endpoint:** `https://mcp.wasmachen.at/mcp`
- **Authentication:** none required. Optionally set an API key / bearer token to
  raise your limit (ChatGPT sends it as `Authorization: Bearer <key>`).

## API keys

A key is **optional**:

- **Without a key** — anonymous access works, subject to a shared per-IP rate
  limit (a light abuse guard).
- **With a key** — you get a dedicated per-key rate limit (raisable via tiers)
  and your usage is tracked.

To get one, sign in at [wasmachen.at](https://wasmachen.at), open your profile,
and go to the **Developer** tab. The key is shown once — copy it into your
client config as `WASMACHEN_MCP_API_KEY` (npx) or the connector's bearer token
(ChatGPT). You can rotate or delete it there anytime.

If you exceed your limit, tool calls return a “rate limit reached, try again in
Ns” message until the window resets. An invalid or revoked key is rejected (it
does not silently fall back to anonymous).

## Tools

| Tool            | Description                                                            |
| --------------- | --------------------------------------------------------------------- |
| `search-events` | Search events by natural-language query plus optional filters: `city`, `dateFrom`, `dateTo`, `categories`, `limit`. Returns upcoming events with title, teaser, image, venue, date, and coordinates. |
| `get-event`     | Full details for a single event by its slug.                          |

Results come back as **structured data plus a text summary**, which every MCP
client (Claude, Cursor, …) uses directly — no special integration needed.

An optional **ChatGPT Apps SDK widget** (a card carousel + map view, MapLibre GL
with free [OpenFreeMap](https://openfreemap.org) tiles) ships with the package
but is **off by default**. It's still being finalized; enable it with
`ENABLE_WIDGET=true` once you're wiring up ChatGPT. Other hosts ignore it either
way.

## Configuration

All configuration is via environment variables:

| Variable                | Default                  | Purpose                                                    |
| ----------------------- | ------------------------ | ---------------------------------------------------------- |
| `WASMACHEN_MCP_API_KEY` | –                        | Optional API key (stdio/npx) for higher limits + tracking. |
| `WASMACHEN_API_URL`     | `https://wasmachen.at`   | wasmachen.at API base URL. Override for staging/local.     |
| `PUBLIC_SITE_URL`       | `https://wasmachen.at`   | Base URL used to build event links shown to users.         |
| `REQUIRE_API_KEY`       | `false`                  | Set `true` to require a key (lock the server to key holders). |
| `ENABLE_WIDGET`         | `false`                  | Advertise the ChatGPT Apps SDK widget. Off by default.     |
| `IP_RATE_LIMIT_PER_MIN` | `60`                     | Per-IP request limit (HTTP mode) — the anonymous abuse guard. |
| `PORT`                  | `3007`                   | HTTP mode only (see [Self-hosting](#self-hosting)).        |
| `UPSTREAM_TIMEOUT_MS`   | `5000`                   | Timeout for calls to the wasmachen.at API.                 |
| `TRUST_PROXY_HOPS`      | `0`                      | Reverse proxies in front of the server. Set `1` **only** if there really is one — see [Security](#security). |
| `ALLOWED_ORIGINS`       | *(empty = any)*          | Comma-separated browser origins allowed to call `/mcp`.    |

## Local development

```bash
npm install
npm run dev:stdio    # run the stdio server (what npx clients launch)
npm run dev          # run the HTTP server at http://localhost:3007/mcp
npm run build        # bundle the widget (esbuild) + compile the server (tsc)
npm test             # vitest unit tests
```

Both dev scripts default `WASMACHEN_API_URL` to `http://localhost:3001`; export
it to point elsewhere.

### Inspect with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
# Connect: Streamable HTTP → http://localhost:3007/mcp
# Works anonymously; add "Authorization: Bearer wm_your_key" to use a key
# Call search-events { "query": "Konzerte", "city": "Linz" }
```

## Self-hosting

The package also exposes an HTTP (Streamable HTTP) MCP server for hosting your
own endpoint. Build and run:

```bash
npm run build
node dist/src/index.js        # serves /mcp and a health check at /healthz
```

A `Dockerfile` is included (`node:24-alpine`, runs as the unprivileged `node`
user, exposes port 3007). Put it behind a reverse proxy that terminates TLS and
forwards to the container — and when you do, set `TRUST_PROXY_HOPS=1` so per-IP
rate limiting sees the real client address.

## Security

Full policy and threat model: [SECURITY.md](SECURITY.md). Report vulnerabilities
privately (GitHub security advisory or simon@wasmachen.at) — not as a public
issue.

Two things worth knowing before you deploy or integrate:

- **`TRUST_PROXY_HOPS` defaults to `0`.** Only raise it if a reverse proxy is
  genuinely in front of the server. Trusting a proxy that isn't there lets any
  caller spoof `X-Forwarded-For` and walk past the per-IP rate limit. Also note
  the limiter is in-memory, so it is per process — with multiple replicas,
  enforce the limit at the proxy too.
- **Tool output is data, not instructions.** Event names and descriptions come
  from a public event platform, so they are attacker-influenceable text that
  ends up in your model's context. This server never executes anything on the
  model's behalf, but downstream agents should not treat event text as a
  command.

## How it works

Both entry points share the same tools (and the optional widget):

- **stdio** (`dist/src/cli.js`, the `wasmachen-events-mcp` bin) — for npx clients.
- **HTTP** (`dist/src/index.js`) — Streamable HTTP at `POST /mcp`.

Anonymous calls run against the public wasmachen.at API, guarded by a per-IP
rate limit. When a key is present, each tool call is authorized against the
wasmachen.at API first (per-key rate limit) and reports usage — the key itself
is the credential, so there is no shared secret to distribute.

## Publishing

```bash
npm publish            # prepack builds the widget + server first
```

The tarball ships the prebuilt `dist/` (server, CLI, bundled widget), so
`npx wasmachen-events-mcp` runs with no build step on the user's machine.

## License

MIT — see [LICENSE](./LICENSE).
