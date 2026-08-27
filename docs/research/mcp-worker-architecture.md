# Minimal MCP architecture for the Stamppot Worker

Research date: 2026-08-27

## Decision

Do **not** add Hono for MCP today. Keep the existing Cloudflare `agents/mcp/server` wrapper, change modern responses from forced JSON to `responseMode: "auto"`, and decide explicitly whether to enable its stateless 2025 compatibility lane. Streaming is already implemented by the MCP handler; Hono would add routing and middleware, not MCP streaming. [Cloudflare documents `createMcpHandler` as the current stateless Worker path](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/), and the upstream SDK documents its direct web-standard handler as the native shape used by Cloudflare Workers, Deno and Bun. [Source](https://ts.sdk.modelcontextprotocol.io/v2/serving/web-standard.html)

For Stamppot, the best near-term configuration is:

- `responseMode: "auto"`: ordinary calls remain one JSON response; a call upgrades to request-scoped SSE only if it emits progress, logging, or another related message before its final result. `subscriptions/listen` remains SSE in every mode. [Source](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/server/src/server/createMcpHandler.ts#L161-L180)
- `legacy: "stateless"` if broad 2025-client compatibility matters; retain `"reject"` only as a conscious modern-only policy. The compatibility lane adds neither Durable Objects nor MCP sessions. [Source](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)
- No standalone `/sse` route. The old HTTP+SSE transport is deprecated; modern Streamable HTTP uses a single POST endpoint and can return either JSON or SSE for each request. [Source](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- Add a single bounded MCP JSON-body reader before either protocol-era classifier and pass the parsed value into the handler. This is a recommendation based on the released code audit: Stamppot already enforces 64 KiB for `/v1`, while the released upstream/Hono MCP parsing paths read without that application-level bound. [Stamppot source](../../packages/http-adapter/src/index.ts), [released Hono adapter source](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/middleware/hono/src/hono.ts#L55-L84)

Revisit Hono when the edge application has enough shared middleware or route groups that the framework removes more code than it adds. At that point, use Hono for the whole HTTP boundary, not as an MCP-specific streaming layer.

## Current architecture assessment

Stamppot already has a strong separation of concerns:

- `packages/core` owns typed operation definitions, validation, descriptions and dispatch. [Source](../../packages/core/src/index.ts)
- Domain MCPs such as `mcp-calendar` contain only domain schemas and behavior. [Source](../../packages/mcp-calendar/src/index.ts)
- `packages/mcp-adapter` maps the registry into a fresh SDK `McpServer` for every request and keeps MCP concerns out of domain packages. [Source](../../packages/mcp-adapter/src/index.ts)
- `packages/http-adapter` exposes the same operations as bounded plain JSON endpoints, so the schemas and behavior are shared rather than duplicated. [Source](../../packages/http-adapter/src/index.ts)
- The Worker owns the route table, CORS for `/v1`, security headers, landing page and health endpoint. Its `withSecurityHeaders` wrapper passes `response.body` through to a new `Response`; it does not call `text()`, `json()` or `arrayBuffer()`, so it does not inherently buffer an SSE response. [Source](../../apps/edge/src/worker.ts)

The registry is immutable at module scope, while the MCP server object is constructed inside the factory for each request. That matches the v2 handler lifecycle and avoids sharing request-local server state between concurrent Worker requests. [Stamppot source](../../apps/edge/src/worker.ts), [SDK lifecycle source](https://ts.sdk.modelcontextprotocol.io/v2/serving/sessions-state-scaling.html)

The current MCP posture is deliberately restrictive: both `/mcp` and `/mcp/calendar` set `legacy: "reject"` and `responseMode: "json"`. Consequently, they accept the modern 2026 protocol only and discard any mid-call progress/log messages. The existing Worker test exercises the `2026-07-28` request envelope directly, but there is no transport-level streaming, cancellation, Origin-rejection or legacy-client test yet. [Adapter source](../../packages/mcp-adapter/src/index.ts), [test source](../../test/worker.test.ts), [response-mode semantics](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/server/src/server/createMcpHandler.ts#L161-L180)

The plain `/v1` ingress has a 64 KiB body limit, but the MCP ingress does not apply that reader. This should be fixed before adding more public tools, independently of the Hono decision. [Source](../../packages/http-adapter/src/index.ts)

## Version-exact package status

The workspace pins `@modelcontextprotocol/server` 2.0.0, Cloudflare `agents` 0.21.0 and Zod 4.4.3. The lockfile resolves Hono 4.13.5 transitively, but Hono is not a declared Stamppot dependency. [Source](../../pnpm-workspace.yaml)

As of the research date, npm's stable/latest MCP server and Hono-adapter releases are both 2.0.0; Hono 4.13.5 and Agents 0.21.0 are latest. The released Hono adapter peers on `@modelcontextprotocol/server ^2.0.0` and `hono ^4.11.4` and declares no normal runtime dependencies. [MCP Hono 2.0.0 package source](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/middleware/hono/package.json), [Hono package source](https://github.com/honojs/hono/blob/v4.13.5/package.json), [Cloudflare handler install guidance](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)

SDK v2 is a stable release, not an alpha, and 2.0.0 added support for MCP revision `2026-07-28`. The v2 package split puts server APIs in `@modelcontextprotocol/server` and makes Hono an optional framework peer through `@modelcontextprotocol/hono`. [Release changelog](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/hono/CHANGELOG.md#200), [official migration guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md)

### Documentation/release mismatch to account for

The linked live API documentation follows newer repository source. It currently documents a configurable, bounded JSON reader with a 4 MiB default and runs Host/Origin validation before body parsing. [Current-main source](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/hono/src/hono.ts)

The actually published `@modelcontextprotocol/hono@2.0.0` release does **not** have `maxRequestBodySize`. It calls `await c.req.raw.clone().json()` without an adapter-level byte bound, and it registers that parser before the Host and Origin middleware. [Exact 2.0.0 source](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/middleware/hono/src/hono.ts#L55-L115)

Therefore, do not design against the live `main`-branch behavior until a package containing it is released. If Hono 2.0.0 is adopted sooner, place validation and a bounded parser in front of the adapter or build a regular `Hono` app with explicit middleware rather than relying on `createMcpHonoApp()` defaults.

## What the Hono adapter does—and does not do

`@modelcontextprotocol/hono` is a thin integration layer. It constructs a Hono app, parses JSON into `c.get("parsedBody")`, and exports Host/Origin validation middleware. It does not implement the MCP protocol, the server lifecycle, response-mode selection, SSE framing, subscriptions, or authentication. [Official API overview](https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/hono/), [exact released source](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/middleware/hono/src/hono.ts)

The Hono recipe forwards `c.req.raw` directly to the SDK handler, so Cloudflare Workers need no Node request/response adapter. Hono itself is Fetch/Web-Standards based and can be exported as a Worker's `fetch` handler. [MCP Hono recipe](https://ts.sdk.modelcontextprotocol.io/v2/serving/hono.html), [Hono Web Standards](https://hono.dev/docs/concepts/web-standard), [Hono Workers guide](https://hono.dev/docs/getting-started/cloudflare-workers)

Its incremental work is nevertheless real: route dispatch, each installed middleware, and a cloned JSON parse before passing the parsed object into MCP. There is no official benchmark that isolates the adapter's overhead, so this report does not attach an invented latency number. Structurally, Hono improves organization and middleware DX; it does not make a single MCP endpoint faster than a direct Fetch handler. [Exact released implementation](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/middleware/hono/src/hono.ts)

Hono becomes worthwhile when route/middleware composition is the problem: for example, grouped OAuth metadata, webhooks, versioned APIs, request IDs, timing and a common error boundary. The current Worker has two MCP routes plus four small HTTP concerns, and its explicit dispatcher is still easy to audit in one screen. [Current Worker](../../apps/edge/src/worker.ts), [Hono routing API](https://hono.dev/docs/api/routing)

## Transport and streaming choice

### Streamable HTTP is the transport; SSE is a response shape

For MCP `2026-07-28`, the server exposes one POST endpoint. Every JSON-RPC request is its own POST, and the response is either one `application/json` object or a request-scoped `text/event-stream`. A request-scoped SSE response may carry related progress/log notifications before the final response; closing it cancels that request. [Current transport specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)

The revision removed the old standalone GET stream, protocol-level sessions and resumability via `Last-Event-ID`. Long-lived change notifications now use the SSE response to a POST `subscriptions/listen` request. [Current transport specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#backward-compatibility)

That makes `responseMode: "auto"` the efficient general default:

- A quick operation such as `get_dutch_time` returns one JSON response.
- A later long-running operation can emit request-related progress and trigger a lazy SSE upgrade.
- `responseMode: "sse"` forces every modern request to stream and buys Stamppot nothing today.
- `responseMode: "json"` saves no meaningful work for today's quick result, while it makes future progress/log notifications disappear.

These response modes and the always-SSE subscription exception are defined by the released server handler. [Exact 2.0.0 source](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/server/src/server/createMcpHandler.ts#L161-L202)

This is message streaming, not arbitrary partial tool-result streaming. The normal exchange still ends with one final JSON-RPC result. For genuinely long work, use progress messages or an appropriate task/application-job design rather than inventing a second HTTP streaming protocol. [Transport message-flow rules](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#receiving-messages)

### Backward compatibility

There are three distinct cases:

| Client era | Minimal server posture | Result |
| --- | --- | --- |
| MCP `2026-07-28` | `createMcpHandler` | Stateless, one POST per request, JSON or request-scoped SSE |
| 2025 Streamable HTTP | `legacy: "stateless"` | Same factory, fresh server per POST, no MCP session or standalone GET stream |
| 2024 HTTP+SSE | Separate legacy SSE/POST endpoints | Deprecated; do not add for a new Stamppot deployment |

The modern and earlier Streamable HTTP mechanics, including the deprecated HTTP+SSE migration posture, are normative in the current specification. [Source](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#backward-compatibility)

Cloudflare's `createMcpHandler` defaults to stateless 2025 compatibility and creates a fresh server for each request; `legacy: "reject"` is the modern-only switch. Its compatibility lane supports ordinary tools/resources/prompts but not session-dependent pushed server-to-client requests. [Source](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)

Recommendation: enable `legacy: "stateless"` during Stamppot's early public phase unless telemetry shows every supported client is modern. Add tests first. Do not add the deprecated standalone SSE transport. One caveat in the released SDK is that `responseMode` controls modern requests; the stateless legacy fallback uses its 2025 Streamable HTTP behavior and can return SSE. [Exact fallback source](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/server/src/server/createMcpHandler.ts#L310-L328)

## Sessions and application state

Keep MCP itself stateless. MCP `2026-07-28` removed `Mcp-Session-Id`; the factory and server are per request, so any request can land on any Worker isolate without session affinity. [Specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http), [SDK scaling guide](https://ts.sdk.modelcontextprotocol.io/v2/serving/sessions-state-scaling.html)

If a future tool needs durable application state, expose an explicit authenticated handle in its schema and store the state behind the appropriate application boundary. Cloudflare recommends Durable Objects, D1, KV or R2 for cross-request data rather than an MCP session ID. [Source](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)

Do not add a Durable Object merely to host the MCP transport. Use one only when a domain tool has a real coordination or persistence invariant. This preserves the repository's existing decision to avoid stateful infrastructure until a tool requires it. [Project rationale](../../README.md)

The one special streaming-state case is `subscriptions/listen`: the released handler creates an in-process event bus by default. Notifications published in one isolate are not thereby a global Worker-wide feed; a multi-instance deployment needs a shared `ServerEventBus`/pub-sub design if cross-instance change delivery becomes a requirement. Cloudflare's wrapper currently exposes the `notify` facade but deliberately does not expose the upstream `bus` option. [Upstream handler source](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/server/src/server/createMcpHandler.ts#L181-L202), [Cloudflare handler API](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)

Stamppot has no mutable registry or subscription use case today, so do not add a bus yet.

## Authentication and ingress security

MCP authorization is optional. When enabled over HTTP, the MCP server is an OAuth resource server: it validates bearer tokens issued for its audience, receives them in the `Authorization` header on every request, and does not accept tokens in query strings. Protected servers publish RFC 9728 resource metadata and enforce scopes. [Current authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

Stamppot's current calendar operation is public, read-only, inexpensive and uses no private data, so remaining authless is a reasonable product policy. Reconsider before adding mutation, private data, user-specific state, or quota-priced upstream APIs. That is an application risk decision, not a reason to add Hono. [Current operation](../../packages/mcp-calendar/src/index.ts), [project policy](../../README.md)

The MCP Streamable HTTP specification requires validating every present browser `Origin` and returning 403 for an invalid value. It also recommends authentication for connections. [Source](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#security--endpoint)

The current Cloudflare wrapper already supplies route scoping, CORS, Host checks for localhost and `workers.dev`, and Origin checks. For a production custom domain, set explicit `allowedHostnames` and `allowedOriginHostnames`; requests without `Origin` continue to work for non-browser MCP clients. [Source](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)

If the project later replaces `agents/mcp/server` with bare upstream `createMcpHandler`, it must retain explicit Host/Origin validation and token verification because the upstream entry point performs neither. `authInfo` is trusted pass-through, not a verifier. [Exact 2.0.0 source](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/server/src/server/createMcpHandler.ts#L20-L27)

Recommended ingress order is: route match, Host/Origin policy, method/content-type checks, bounded body read, parse once, protocol dispatch, tool invocation. Pass the parsed object to the MCP handler so era classification and dispatch do not clone and reread the request. The SDK explicitly documents `parsedBody` as the pre-parsed-body fast path. [Exact source](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/server/src/server/createMcpHandler.ts#L120-L130)

## Cloudflare streaming constraints

Workers support Web `ReadableStream` response bodies directly and can send headers before the full body is available. Streaming avoids buffering large responses within the 128 MB Worker memory limit. [Cloudflare Streams API](https://developers.cloudflare.com/workers/runtime-apis/streams/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

HTTP-triggered Workers have no fixed wall-time limit while the client remains connected, but CPU limits still apply and work can be canceled when the client disconnects. `ctx.waitUntil()` is for background work after a response and is limited to 30 seconds after response/disconnect; it is not a substitute for keeping an MCP request stream alive. [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/)

No special Hono streaming helper is needed. The MCP handler returns a web-standard `Response`, and the current security-header wrapper preserves its `ReadableStream` body. [MCP web-standard guide](https://ts.sdk.modelcontextprotocol.io/v2/serving/web-standard.html), [Stamppot wrapper](../../apps/edge/src/worker.ts)

## Recommended minimal code/package architecture

Keep these boundaries:

```text
apps/edge
  route/security/body-limit/observability boundary
      -> packages/mcp-adapter
           fresh McpServer factory + registry mapping
              -> packages/core
                   transport-neutral Operation + OperationContext
                      -> packages/mcp-<domain>
```

Near-term dependencies remain:

```text
@modelcontextprotocol/server 2.0.0
agents 0.21.0 (import only agents/mcp/server)
zod 4.4.3
```

The isolated `agents/mcp/server` entry is Cloudflare's documented import for keeping the stateless server path separate from legacy Agents transports and clients. [Source](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/)

Recommended adapter responsibilities:

1. Build one fresh `McpServer` per request from the shared immutable registry.
2. Register schemas and invoke the same operation definitions used by `/v1`.
3. Map the MCP callback's `ctx.mcpReq.signal` into `OperationContext.signal` so both client cancellation and HTTP disconnects stop domain work; `request.signal` remains the plain HTTP adapter's cancellation source.
4. Add an optional transport-neutral progress reporter to `OperationContext` only when the first real long-running tool needs it; the MCP adapter can map it to MCP progress while `/v1` can use a no-op or a future HTTP convention.
5. Configure `responseMode: "auto"`, an explicit legacy policy, custom-domain Host/Origin lists, and `onerror` in one place.

The first three are already substantially present in Stamppot. [Sources](../../packages/mcp-adapter/src/index.ts), [Operation context](../../packages/core/src/index.ts)

### Minimal alternative: remove Cloudflare Agents

Bare `@modelcontextprotocol/server/createMcpHandler` is the smallest package surface and already returns the Worker-compatible web-standard handler. This alternative is sound if Stamppot is prepared to own route matching, CORS, Host/Origin validation, OAuth context integration and any Cloudflare-specific compatibility fixes. [Upstream guide](https://ts.sdk.modelcontextprotocol.io/v2/serving/web-standard.html), [Cloudflare wrapper features](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)

Do not mix the two wrappers. Either retain the Cloudflare wrapper or deliberately replace it with the upstream handler plus explicit ingress policy.

### Hono alternative

When routing complexity justifies it, make Hono the edge router and mount each MCP handler through `handler.fetch(c.req.raw, { parsedBody, authInfo })`. Declare both `hono` and `@modelcontextprotocol/hono` directly; do not rely on their current transitive presence. [Official recipe](https://ts.sdk.modelcontextprotocol.io/v2/serving/hono.html), [workspace dependency state](../../pnpm-workspace.yaml)

At the published 2.0.0 adapter version, prefer a regular Hono app with explicit validation/body middleware or wait for the documented bounded-parser changes to ship. Measure the production bundle and request latency before claiming a performance win.

## Testing, observability and DX standards

Keep the current Cloudflare Vitest integration; it runs tests inside the Workers runtime and is Cloudflare's recommended unit/integration path. Stamppot already uses `SELF.fetch` against the configured Worker. [Cloudflare testing guide](https://developers.cloudflare.com/workers/testing/vitest-integration/), [Stamppot tests](../../test/worker.test.ts)

Add a transport matrix:

1. Modern `server/discover`, `tools/list`, successful `tools/call`, invalid schema, unknown method and unsupported version.
2. `responseMode: "auto"`: JSON for a quiet tool; SSE event ordering for a fixture tool that emits progress; aborting the response aborts `OperationContext.signal`.
3. If enabled, 2025 stateless initialization/list/call and GET/DELETE rejection.
4. Invalid/malformed/present-but-disallowed `Origin`, Host policy, OPTIONS/CORS, non-JSON content type, malformed JSON and body-over-limit.
5. Route isolation between `/mcp`, `/mcp/calendar`, `/v1` and the landing page.

Use the real v2 `Client` with `StreamableHTTPClientTransport` in adapter tests instead of hand-built JSON alone; the SDK recommends driving a server in-process through its real client transport. [SDK testing guide](https://ts.sdk.modelcontextprotocol.io/v2/testing.html)

Run the existing `pnpm check` gate for every transport change: Ultracite, type checking, tests and the production Worker build are already composed into one script. [Source](../../package.json)

The Worker already enables observability with full head sampling. Workers Logs collects invocation logs, errors and custom logs, and Cloudflare recommends structured JSON for indexed fields. [Stamppot config](../../apps/edge/wrangler.jsonc), [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

Standardize one safe event per failed/slow operation with fields such as `event`, `route`, `protocolEra`, `method`, `operation`, `outcome` and `durationMs`. Do not log tool inputs, outputs, bearer tokens, authorization headers or user content by default. Wire the handler's `onerror` to the same reporter for out-of-band transport failures; it reports errors but does not change the response. [Handler option semantics](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)

Cloudflare tracing must currently be enabled separately from the existing broad `observability.enabled` setting; automatic traces can then capture Worker and binding spans without an application tracing SDK. Enable sampled traces when Stamppot gains upstream calls or persistent bindings rather than adding instrumentation through Hono solely for timing. [Cloudflare tracing](https://developers.cloudflare.com/workers/observability/traces/)

## Phased recommendation

### Phase 1 — now

1. Keep `agents/mcp/server`; do not add Hono.
2. Change modern response shaping to `responseMode: "auto"`.
3. Choose `legacy: "stateless"` for broader early compatibility, or document why Stamppot is intentionally modern-only.
4. Add a bounded, parse-once MCP ingress path and pass `parsedBody` to the handler.
5. Configure explicit Host/Origin policy for the production hostname.
6. Add the transport/security test matrix and structured `onerror` reporting.

This phase is the smallest change that improves future streaming, compatibility, resource bounds and operational clarity without disturbing the clean domain/adapter architecture.

### Phase 2 — when the first streaming tool exists

1. Add a transport-neutral progress hook to `OperationContext`.
2. Add a fixture/integration test proving lazy JSON-to-SSE upgrade and cancellation.
3. Keep `auto`; do not force all calls to SSE.
4. Do not add `subscriptions/listen` infrastructure unless registry/resource changes must be pushed.

### Phase 3 — only when product requirements demand it

- Add explicit durable application state, addressed by domain handles, when a tool needs coordination or persistence.
- Add OAuth/resource metadata and scopes before exposing private, mutating or costly operations.
- Add a shared event bus only for cross-isolate change subscriptions.
- Adopt Hono for the whole Worker only when route groups/shared middleware measurably simplify the edge boundary; re-check the published adapter version first.

## Bottom line

The next level is **Streamable HTTP with lazy streaming, bounded ingress, deliberate compatibility and better protocol tests—not Hono for its own sake**. Stamppot's present manual router is smaller and clearer than adding a framework. Hono is a good future edge-router choice, but it is not the source of MCP streaming, sessions, authentication or performance, and the currently published MCP Hono adapter lags the safer body-handling behavior shown in today's live documentation.
