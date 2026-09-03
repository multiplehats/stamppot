# `@stamppot/upstream`

Shared outbound-fetch policy for Stamppot MCPs that read a third-party upstream: GET-only, `redirect: "manual"`, a bounded response body, a timeout derived from the caller's `AbortSignal`, and cache-before-fetch so a repeat read never re-hits the upstream. A cache write failure never turns a successful read into an availability error.

`fetchUpstreamJson` and `fetchUpstreamText` are thin wrappers around one `fetchUpstream` core that differ only in the default `accept` header and how the body is parsed. `./cloudflare` adds a Workers Cache API-backed `UpstreamCache` and an `UpstreamLimiter` that rate-limits by a hashed caller IP.

This package has no domain knowledge of any single MCP; it exists so `mcp-ov` and future upstream-reaching MCPs share one fetch policy instead of each re-implementing it.
