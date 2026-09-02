# Analytics: two OpenPanel projects, argument-free MCP events, and no key means no tracking

Date: 2026-09-02

## Decision

Stamppot measures itself with [trakoo](https://trakoo.co) over two separate
OpenPanel projects:

- **Web** — the site. Page views and install-snippet copies from the browser,
  plus server-rendered reads of the surfaces browser JavaScript never sees.
- **Backend** — MCP usage. One event per settled tool call, over either
  transport.

Both are off unless their credentials are present. `apps/edge/src/analytics/`
holds all three instances; nothing analytics-shaped reaches `packages/`.

## Why two projects

The two audiences answer different questions and have different volumes. A
person deciding whether to install an MCP and an agent calling
`get_train_departures` forty times an hour do not belong in the same funnel,
and mixing them makes the web project's "sessions" meaningless. Separate
projects also mean the backend key can be rotated or revoked without taking
site analytics down with it.

One trakoo registry (`analytics/events.ts`) still defines every event. It
imports neither `trakoo/client` nor `trakoo/server`, so a browser module and
the Worker can both reach it — the same environment-neutrality rule `AGENTS.md`
already states for `@heroui/react`.

## MCP events carry no arguments, ever

`SECURITY.md` forbids putting tool arguments — a shopping-list `listKey` above
all — into analytics. `ToolCallRecord` in `@stamppot/core` is the enforcement
point: a closed shape of five fields, four of them names this repository
already publishes and one a duration. There is deliberately nowhere in it to
put an argument.

Two further rules follow from the same constraint:

- **No error messages.** `classifyOperationError` maps a failure to
  `invalid_input` or `error` by class alone. An upstream message can echo the
  input that caused it, so it is never read.
- **No context and no identity.** trakoo's OpenPanel provider spreads
  `context.page`, `context.device`, `context.utm` and `context.user` into the
  payload when given them. MCP events are tracked with no context, no `userId`
  and no profile — Stamppot is authless and an anonymous call has no profile to
  attach.

`test/analytics.test.ts` asserts the **exact** property key set that reaches
OpenPanel rather than the absence of any particular field. A negative assertion
passes vacuously; a future `...input` spread would sail through one and fail
the key-set check.

An unrecognised tool name on `/v1/tools/:name` is a 404 and is not reported.
Reporting it would let a caller write arbitrary strings into the event stream.

## Who is calling, and how much of that to believe

`mcp_tool_called` carries `client` and `clientVersion`, so the harness
distribution is visible — which is the point of publishing MCPs at all.

The 2026-07-28 protocol repeats `clientInfo` in the `_meta` envelope of *every*
request, so a `tools/call` names its own caller. Captured from a real
`claude mcp` connection against this Worker:

```
user-agent: claude-code/2.1.258 (sdk-cli)
_meta["io.modelcontextprotocol/clientInfo"]
  = { name: "claude-code", title: "Claude Code", version: "2.1.258", ... }
```

A 2025-era client declares itself only in its `initialize` handshake, which a
stateless server cannot tie to a later call, so those fall back to the
`User-Agent` product token. The `/v1/tools` route has no handshake at all and
always uses the User-Agent. Failing both, the client is `unknown`.

The envelope also carries `title`, `description` and `websiteUrl`. None are
copied: `ToolCallRecord` stays closed, and a test asserts its key set. The
agent-facing page views carry the same two fields, so a harness reading `/` as
Markdown or pulling the JSON catalog is attributable too.

**None of this is verified.** A caller can claim any name, so these are
self-reported labels, not identities. `normalizeClientLabel` therefore
lowercases, strips to `[a-z0-9._-]` and truncates — 40 characters for a name,
24 for a version — before the value becomes a chart dimension. That bounds both
the charset and the cardinality a hostile or buggy client can introduce, and
leaves real names like `claude-code` untouched. The MCP SDK schema-checks a
declared `clientInfo` before it reaches us; the User-Agent is unchecked, which
is the path the bounding test exercises.

### Installed is not the same as used

Most of what a harness sends calls no tool at all. A single `claude mcp`
connection sent `server/discover`, `subscriptions/listen`,
`notifications/cancelled` and `tools/list` before any `tools/call`. Counting
only tool calls would leave a harness that installs Stamppot and never uses it
completely invisible.

`mcp_client_connected` therefore reports the handshake and discovery methods —
`initialize`, `server/discover`, `tools/list` — one event each.
`REPORTED_DISCOVERY_METHODS` is a closed set, which both bounds the `method`
dimension and leaves out the traffic that would drown the signal:
`subscriptions/listen` is a long poll that reconnects, and `tools/call` already
reports itself as a `ToolCallRecord`.

## The Worker builds the MCP handler per request

Reporting has to happen inside the tool callback, several layers down the MCP
SDK's dispatch, and it needs that request's `ExecutionContext` to hand the POST
to `waitUntil`. `createRegistryMcpHandler` therefore builds its handler per
POST so the reporter can close over the context.

The two cheaper-looking alternatives both rest on third-party behaviour no type
signature promises: a `WeakMap` keyed on the `Request` assumes the SDK passes
that exact object through to the factory, and `AsyncLocalStorage` assumes the
store survives the SDK's internals. The cost of building per request is
bounded — the SDK's handler allocates closures and an event bus, while the
expensive part, constructing an `McpServer` and registering every tool, already
ran per request inside the factory. Only POST pays it; every other method keeps
a single long-lived handler.

Reporting is wrapped so it can never throw: a reporter that failed inside the
success path would be caught by the tool's own error boundary and turn a
completed call into an error response.

## Delivery is fire-and-forget, and nothing is shut down

Every report goes to `ctx.waitUntil`. Nothing a visitor or an MCP client waits
on may depend on OpenPanel being reachable — its SDK retries a failed POST
three times with backoff, which would otherwise land on a tool call's latency.

The two server instances are built on first use and never shut down. Nothing is
lost by that: trakoo's `shutdown()` clears identity rather than flushing, and
the OpenPanel SDK only buffers when `disabled` or `waitForProfile` is set,
neither of which applies here. Every `track()` is its own POST, already held
open by `waitUntil`.

## No key means no tracking

A project is enabled only when it has both halves of its credentials:

| Project | Client id (build time, `VITE_*`) | Secret (Worker secret) |
| --- | --- | --- |
| Web | `VITE_OPENPANEL_CLIENT_ID` | `OPENPANEL_API_KEY` |
| Backend | `VITE_OPENPANEL_BACKEND_CLIENT_ID` | `OPENPANEL_BACKEND_API_KEY` |

Either half missing means the provider is never constructed and trakoo's
`enabled: false` makes every call a synchronous no-op. This is not a fallback —
it is the state `pnpm dev` and CI both run in, and the reason neither needs a
key to build, test or serve the site.

`vitest.config.ts` blanks both secrets in the test Worker, alongside the NS key
it already overrides. Without that, a contributor's decrypted `.dev.vars`
supplies real secrets to the test Worker, and `pnpm check:ci` — which does put
a real client id on the environment for Vite to inline — would have every test
run writing to a live project. A test asserts the override wins.

The split follows the existing env plumbing. `scripts/write-dev-vars.mjs` and
`scripts/deploy-production.mjs` treat `VITE_*` as build-time values that Vite
inlines and everything else as a Worker runtime secret, so the client ids
cannot come from `env` and the secrets cannot come from the bundle. `vite dev`
runs outside `dotenvx`, so a local `pnpm dev` has no client id and therefore
never writes to a real project.

## Client cost

The browser gains `@openpanel/web`, about 8 kB raw and 3 kB gzipped. OpenPanel's
session-replay module is a further 178 kB, but it sits behind a dynamic
`import()` that only runs when replay is enabled — it is off, so the chunk is
emitted and never fetched. Automatic screen views, outgoing-link tracking and
data-attribute tracking are all off too: the provider defaults them off and
every event here is an explicit call.

## The agent-facing surfaces report from the Worker

The site's Markdown variants (`Accept: text/markdown`) and its JSON catalog
(`/v1/mcps`, `/v1/tools`) are read by clients that never execute the browser
bundle. Those reads are reported server-side to the **web** project as page
views carrying only a public route and a `surface` tag, so the site's whole
audience lands in one place. HTML pages are not reported this way — they report
themselves from the browser after hydration, and doing both would double-count.
