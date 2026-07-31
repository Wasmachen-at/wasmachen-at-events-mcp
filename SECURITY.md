# Security Policy

## Reporting a vulnerability

Please report security issues privately — do **not** open a public GitHub issue.

- Preferred: [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  (Security → Report a vulnerability).
- Or email **hello@wasmachen.at**.

Please include a description, affected version or commit, and reproduction
steps. We aim to acknowledge within 5 working days.

## Supported versions

Only the latest release on `main` receives security fixes.

## Scope

This repository contains the MCP server that queries the public wasmachen.at
event API. Vulnerabilities in **this** code — the HTTP/stdio server, the tool
handlers, the filter builder, the widget — are in scope. Issues in the
wasmachen.at backend or website should be reported to the same address but are
tracked separately.

## Threat model

Assume the following, because they hold in normal operation:

- **Tool arguments are untrusted.** They are produced by an LLM that may be
  steered by a user prompt or by event text it just read. They are validated
  with zod (types, ranges, length caps) and escaped before reaching a
  MeiliSearch filter expression or a URL.
- **Backend responses are untrusted-ish.** Event names, teasers and image URLs
  flow into model context and into the widget. The widget escapes everything it
  injects as HTML and only navigates to `http(s)` URLs; discovery metadata that
  reaches the *tool description* is stripped to plain short labels so it cannot
  smuggle instructions into the prompt.
- **The server holds no user data and sets no cookies.** There is no session, so
  there is no CSRF surface; a cross-origin browser request can only ever act as
  an anonymous caller.
- **API keys are bearer credentials** supplied per request by the caller. The
  server never logs them and never persists them; it forwards them to the
  wasmachen.at backend, which validates them and enforces the per-key budget.

### Known non-goals

- **Prompt injection via event content is not fully solvable here.** An event
  description on wasmachen.at is attacker-influenceable text that ends up in an
  assistant's context. Downstream clients should treat tool output as data, not
  instructions. This server does not execute anything on the model's behalf, so
  the blast radius is limited to misleading text.
- **Anonymous access is intentional.** Rate limits, not authentication, are the
  abuse control for the public deployment.

## Deployment notes

If you self-host, these matter:

| Variable | Default | Why it matters |
| --- | --- | --- |
| `TRUST_PROXY_HOPS` | `0` | Set to `1` **only** when behind exactly one reverse proxy. Trusting a proxy that isn't there lets anyone spoof `X-Forwarded-For` and bypass the per-IP rate limit. |
| `IP_RATE_LIMIT_PER_MIN` | `60` | Per-IP budget on `/mcp`. In-memory, so it is per process — use a shared store or a proxy-level limit when running multiple replicas. |
| `ALLOWED_ORIGINS` | *(empty = any)* | Restricts browser origins for `/mcp`. Safe to leave open (no ambient credentials); set it to lock down a private deployment. |
| `REQUIRE_API_KEY` | `false` | Set to `true` to refuse anonymous callers entirely. |
| `WASMACHEN_API_URL` | `https://wasmachen.at` | Every API key the server receives is forwarded here. Never point it at a host you do not control. |

The provided `Dockerfile` runs as the unprivileged `node` user and ships only
compiled output plus production dependencies.
