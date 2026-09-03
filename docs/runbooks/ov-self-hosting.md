# Self-host the public transport MCP on Cloudflare

This runbook adds Stamppot's public transport domain to a deployed Worker: an NS Reisinformatie API key held as a Worker secret, a private R2 bucket holding the stop directory, and a rate-limit binding protecting both upstreams. The resulting MCP endpoint is `/mcp/ov`.

Self-hosting creates billable Cloudflare resources. Review the Workers, R2, and Rate Limiting pricing for the account before deploying. It also creates an obligation towards two third-party data sources; read [Upstream obligations](#upstream-obligations) before going live.

## Prerequisites

- Node.js 22 or newer and pnpm 9.10
- A Cloudflare account with Workers, R2, and Workers Rate Limiting available
- A free NS Reisinformatie API subscription
- The steps in [`groceries-self-hosting.md`](./groceries-self-hosting.md) already completed, or at least the workspace installed and Wrangler authenticated

```bash
pnpm install
pnpm exec wrangler login
pnpm exec wrangler whoami
```

## Register an NS API key

1. Create an account at [apiportal.ns.nl](https://apiportal.ns.nl/).
2. Subscribe to the **Reisinformatie API** product. The free tier allows 5,000 requests per day at the time of writing; confirm the current limit on the portal, because it governs how much traffic the deployment can serve.
3. Copy the primary subscription key. It is the value of the `Ocp-Apim-Subscription-Key` header.

Stamppot holds exactly one key for the whole deployment. End users never supply one and never see one.

## Choose the resource names

Edit [`apps/edge/wrangler.jsonc`](../../apps/edge/wrangler.jsonc) before creating resources:

1. Set the `OV_STOPS` binding's `bucket_name` to a unique R2 bucket name. Keep the binding name unchanged.
2. Replace the `OV_UPSTREAM_READS` binding's `namespace_id` with a positive integer that is unique within the account. Cloudflare treats the value as a string; bindings that reuse it share counters.

The examples below use `my-stamppot-ov-stops` as the bucket. Substitute the exact name configured in `bucket_name`.

## Create the private stops bucket

```bash
pnpm exec wrangler r2 bucket create my-stamppot-ov-stops --jurisdiction eu
```

Do not enable an R2 public development URL or custom domain. The Worker reads the snapshot through the private `OV_STOPS` binding.

## Store the NS key as a Worker secret

```bash
pnpm exec wrangler secret put NS_API_KEY --config apps/edge/wrangler.jsonc
```

Paste the key when prompted. It is never written to `wrangler.jsonc`, and the repository has no `vars` entry for it.

For local development, create `apps/edge/.dev.vars` instead:

```text
NS_API_KEY=your-subscription-key
```

That path is covered by the repository `.gitignore`. Without it, the train tools answer `upstream_unavailable` and never reach NS; `find_ov_stop` and `get_stop_departures` keep working, because neither needs the key.

## Publish the first stops snapshot

The snapshot merges NS stations with the OVapi stop-area dump, so the sync needs the key in the environment for the NS half only:

```bash
NS_API_KEY=your-subscription-key pnpm ov:sync \
  --remote --bucket my-stamppot-ov-stops --jurisdiction eu
```

The sync validates both sources and every generated object, uploads the immutable versioned snapshot, and replaces `stops/manifest.json` last. It exits without replacing the live manifest if validation or the snapshot upload fails.

The snapshot is bounded to 1 MiB. A future source that exceeds that bound is rejected and the previously published manifest stays live; splitting the snapshot into shards is the documented remedy.

### Local development uses the fixtures

`pnpm dev` runs `ov:sync --local --if-empty` against `packages/mcp-ov/fixtures/`, which
holds 5 Dutch stations and 16 stop areas — enough to exercise every tool, but
`find_ov_stop` answers `status: "ok"` with an empty list for anything outside it. To
develop against the real directory, publish it into the local Miniflare state instead:

```bash
pnpm ov:sync --local \
  --ovapi-source http://v0.ovapi.nl/stopareacode \
  --ns-source packages/mcp-ov/fixtures/ns-stations-small.json
```

Drop `--ns-source` to read live NS stations too, which needs `NS_API_KEY` in the
environment. Omit `--if-empty` as shown, or the run is skipped because the fixture
manifest is already there.

Confirm that the manifest exists without exposing the bucket publicly:

```bash
pnpm exec wrangler r2 object get my-stamppot-ov-stops/stops/manifest.json \
  --pipe --remote --jurisdiction eu --config apps/edge/wrangler.jsonc
```

## Deploy the Worker

```bash
pnpm deploy
```

The rate-limit binding is created from the Wrangler configuration; its namespace ID must remain stable across later deployments.

## Verify the deployment

```bash
curl https://your-worker.example/v1/tools/find_ov_stop \
  --header 'content-type: application/json' \
  --data '{"query":"amsterdam centraal"}'

curl https://your-worker.example/v1/tools/plan_train_journey \
  --header 'content-type: application/json' \
  --data '{"fromStation":"asd","toStation":"ut"}'

curl https://your-worker.example/v1/tools/get_stop_departures \
  --header 'content-type: application/json' \
  --data '{"stopAreaCode":"09500","limit":3}'
```

All three should report `status: "ok"`. Use the codes the first call returns for the second and third; do not guess codes.

- `directory_unavailable` from `find_ov_stop` usually means the bucket holds no valid manifest, or the deployed binding points at a different bucket.
- `upstream_unavailable` from a train tool usually means the `NS_API_KEY` secret is missing, wrong, or over its daily quota.
- `upstream_unavailable` from `get_stop_departures` almost always means OVapi itself is down, slow, or rate-limiting you. Its plain-HTTP origin is reachable from the Cloudflare edge — confirmed with a deployed Worker that received HTTP 200 and OVapi JSON — so this is far likelier to be the unofficial upstream having a bad day than a platform restriction. Compare against `curl http://v0.ovapi.nl/stopareacode/09500` from your own machine.
- `unknown_station` or `unknown_stop` means the code was rejected by the upstream; resolve it again with `find_ov_stop`.

**The NS response shapes are worth a real look on this first call.** The repository's NS fixtures were authored from the published OpenAPI definition rather than recorded from a live key, so this is the point at which the mapping is genuinely verified against production data. The clients read every upstream field defensively, so a mismatch shows up as a missing output field rather than an error.

Connect an MCP client to:

```text
https://your-worker.example/mcp/ov
```

## Refresh the stops snapshot

Stop codes change slowly, but they do change. Re-run the same remote sync on a cadence that suits the deployment — monthly is ample, weekly is generous:

```bash
NS_API_KEY=your-subscription-key pnpm ov:sync \
  --remote --bucket my-stamppot-ov-stops --jurisdiction eu
```

The repository installs no scheduled trigger, so this runs from an operator's own scheduler or CI job. Each successful sync retains the prior immutable snapshot and only advances the manifest pointer; this release configures no R2 lifecycle rule, so monitor storage growth if syncing often.

## Upstream obligations

**NS.** The key is bound to an account and a daily request budget. `get_train_departures` results are cached for 30 seconds and journey and disruption results for 60 seconds, and every train tool consumes the rate limiter first, which is what keeps a public authless endpoint inside a personal quota. Raising the limiter's `limit`, lengthening the cache TTLs, or removing either will change how quickly the quota is spent. NS's API terms govern redistribution of the data.

Cloudflare documents functional Cache API operations for [Workers deployed to custom domains](https://developers.cloudflare.com/workers/runtime-apis/cache/), and no impact at all in the dashboard editor and Playground. Treat the caching half of that budget protection as guaranteed only behind a custom domain: if you verify or run on the `workers.dev` URL, assume every train call reaches NS and that the per-IP limiter is the only thing standing between an authless endpoint and the daily quota. Deploy behind a custom domain before pointing real traffic at it.

**OVapi.** `v0.ovapi.nl` is an unofficial community source with no published licence, no support and no availability guarantee, intended for non-commercial use. Keep request volume modest and do not build a commercial dependency on it. Its HTTPS endpoint presents a certificate for unrelated hostnames, so Stamppot fetches it over plain HTTP and its responses are not protected against on-path modification. Every OVapi result is labelled `official: false` in the tool output for that reason.

## Operational notes

- The three train tools need the secret; `find_ov_stop` and `get_stop_departures` do not.
- The rate limiter is an abuse brake, not authorization or exact accounting. Cloudflare applies its counters per location and updates them approximately.
- Upstream responses are cached in a dedicated `stamppot-ov-upstream-v1` cache namespace, so they never collide with the zone's HTTP cache.
- Keep the R2 bucket private and keep the `OV_STOPS` and `OV_UPSTREAM_READS` binding names unchanged unless the Worker code is updated at the same time.
- No public transport tool writes anything. There is no stored state, no user identity and no capability to lose.

See [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) for namespace semantics.
