# Self-host the second-hand listings MCP on Cloudflare

This runbook adds Stamppot's second-hand listings domain to a deployed Worker: a rate-limit binding protecting the Marktplaats and PDOK upstreams. There is no secret and no bucket for this domain; nothing is stored server-side. The resulting MCP endpoint is `/mcp/marktplaats`.

Self-hosting creates billable Cloudflare resources. Review the Workers and Rate Limiting pricing for the account before deploying. It also creates an obligation towards two third-party data sources; read [Upstream obligations](#upstream-obligations) before going live.

## Prerequisites

- Node.js 22 or newer and pnpm 9.10
- A Cloudflare account with Workers and Workers Rate Limiting available
- The steps in [`ov-self-hosting.md`](./ov-self-hosting.md) already completed, or at least the workspace installed and Wrangler authenticated

```bash
pnpm install
pnpm exec wrangler login
pnpm exec wrangler whoami
```

## Choose the resource name

Edit [`apps/edge/wrangler.jsonc`](../../apps/edge/wrangler.jsonc) before deploying:

1. Replace the `MARKTPLAATS_UPSTREAM_READS` binding's `namespace_id` with a positive integer that is unique within the account. Cloudflare treats the value as a string; bindings that reuse it share counters.

No bucket, secret, or Durable Object binding is needed for this domain.

## Deploy the Worker

```bash
pnpm deploy
```

The rate-limit binding is created from the Wrangler configuration; its namespace ID must remain stable across later deployments.

## Verify the deployment

```bash
curl https://your-worker.example/v1/tools/find_marktplaats_listings \
  --header 'content-type: application/json' \
  --data '{"query":"ps5","location":{"place":"Enschede","radiusKm":20},"conditions":["like_new","used"],"limit":5}'

curl https://your-worker.example/v1/tools/find_marktplaats_listings \
  --header 'content-type: application/json' \
  --data '{"location":{"postcode":"7511"},"categoryId":2954,"parentCategoryId":356}'

curl https://your-worker.example/v1/tools/get_marktplaats_listing \
  --header 'content-type: application/json' \
  --data '{"id":"<an id from the first call'\''s listings>"}'
```

The first two calls should report `status: "ok"` with `resolvedLocation` echoing the place or postcode that was actually searched. Use an id from the first call's `listings` for the third call; do not guess ids. That call should also report `status: "ok"`.

- `unknown_place` from the first call usually means PDOK Locatieserver returned no woonplaats match for the given name; check the spelling.
- `unknown_listing` from the third call usually means the id was mistyped or the listing has since been removed; resolve a fresh id with a search first.
- `upstream_unavailable` most often means Marktplaats or PDOK is down, slow, or answering with a challenge page instead of data; see [Upstream obligations](#upstream-obligations) below before assuming a platform problem.
- `rate_limited` means the deployment's own `MARKTPLAATS_UPSTREAM_READS` limiter is exhausted; wait for `retryAfterSeconds` and retry.

Cloudflare documents functional Cache API operations for [Workers deployed to custom domains](https://developers.cloudflare.com/workers/runtime-apis/cache/), and no caching effect at all in the dashboard editor and Playground. Treat the caching half of this domain's upstream-load protection as guaranteed only behind a custom domain: if you verify or run on the `workers.dev` URL, assume every call reaches Marktplaats or PDOK directly and that the per-IP limiter is the only thing standing between an authless endpoint and either upstream's tolerance. Deploy behind a custom domain before pointing real traffic at it.

Connect an MCP client to:

```text
https://your-worker.example/mcp/marktplaats
```

## Upstream obligations

**Marktplaats.** There is no public API for this data; `find_marktplaats_listings` and `get_marktplaats_listing` read the same unofficial JSON endpoint and page DOM the marktplaats.nl website itself uses. Marktplaats' Gebruiksvoorwaarden permit personal-use RSS retrieval of up to 100 listings, forbid "herhaald en systematisch opvragen" (repeated, systematic retrieval) under the database right, and forbid collecting advertisers' personal data. This deployment keeps volume and scope inside those terms: `limit` is capped at 30 and `offset` at 270 per call, search results are cached for 60 seconds and listings for 120 seconds, every call consumes the `MARKTPLAATS_UPSTREAM_READS` limiter (30 reads per 60 seconds) before reaching Marktplaats, requests identify themselves with `User-Agent: stamppot (+https://stamppot.dev)`, and only a seller's display name and listing-scoped id are ever returned. If Marktplaats starts answering with HTTP 403, HTTP 429, or a challenge page instead of data, that surfaces to callers as `upstream_unavailable`; do not respond by adding a proxy, spoofing a browser User-Agent, or attempting to solve the challenge. If Marktplaats asks Stamppot to stop reading this endpoint, disable the route instead of working around the request.

**PDOK.** PDOK Locatieserver is an official, free, keyless Dutch geocoder, "open en gratis" (open and free). Keep request volume modest even though there is no published limit: place resolution is cached for 24 hours, so a repeated place name does not repeat the PDOK call, and every resolution still goes through the same `MARKTPLAATS_UPSTREAM_READS` limiter as the Marktplaats search itself.

## Operational notes

- Neither tool needs a secret; both work as soon as the Worker is deployed with the rate-limit binding in place.
- The rate limiter is an abuse brake, not authorization or exact accounting. Cloudflare applies its counters per location and updates them approximately.
- Upstream responses are cached in a dedicated `stamppot-marktplaats-upstream-v1` cache namespace, so they never collide with `mcp-ov`'s cache or the zone's HTTP cache.
- Keep the `MARKTPLAATS_UPSTREAM_READS` binding name unchanged unless the Worker code is updated at the same time.
- Neither tool writes anything. There is no stored state, no saved watch, and no user identity to lose. An agent that wants to poll for new listings over time keeps its own memory of what it already saw and passes the previous call's `observedAt` back as the next call's `postedSince`.

See [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) for namespace semantics.
