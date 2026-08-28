# Self-host the groceries MCP on Cloudflare

This runbook deploys Stamppot's Worker with its private grocery catalog, anonymous shopping-list storage, and write limiter. The resulting grocery MCP endpoint is `/mcp/groceries`.

Self-hosting creates billable Cloudflare resources. Review the Workers, R2, Durable Objects, and Rate Limiting pricing for the account before deploying.

## Prerequisites

- Node.js 22 or newer and pnpm 9.10
- A Cloudflare account with Workers, R2, Durable Objects, and Workers Rate Limiting available
- Permission to create an R2 bucket and deploy a Worker in that account

Install the workspace and authenticate the repository-pinned Wrangler CLI:

```bash
pnpm install
pnpm exec wrangler login
pnpm exec wrangler whoami
```

For non-interactive deployment, configure Wrangler authentication in the environment instead of running `wrangler login`.

## Choose the resource names

Edit [`apps/edge/wrangler.jsonc`](../../apps/edge/wrangler.jsonc) before creating resources:

1. Set `name` to a Worker name that is available in the Cloudflare account.
2. Set the `GROCERIES_CATALOG` binding's `bucket_name` to a unique R2 bucket name. Keep the binding name unchanged.
3. Replace the `SHOPPING_LIST_WRITES` binding's `namespace_id` with a positive integer that is unique within the account. Cloudflare treats the value as a string; bindings that reuse it share counters.
4. Keep the `SHOPPING_LISTS` binding, `ShoppingListObject` class name, and `v1` Durable Object migration unchanged.

The examples below use `my-stamppot-groceries` as the bucket. Substitute the exact name configured in `bucket_name`.

## Create the private catalog bucket

Create the bucket in the European Union jurisdiction:

```bash
pnpm exec wrangler r2 bucket create my-stamppot-groceries --jurisdiction eu
```

Do not enable an R2 public development URL or custom domain. The Worker reads catalog objects through the private `GROCERIES_CATALOG` binding.

Cloudflare documents the command and bucket-name rules in [Create new buckets](https://developers.cloudflare.com/r2/buckets/create-buckets/).

## Publish the first catalog

Build and publish a current Checkjebon snapshot:

```bash
pnpm groceries:sync --remote --bucket my-stamppot-groceries --jurisdiction eu
```

The sync validates the source and every generated object, uploads all immutable version shards, and replaces `catalog/manifest.json` last. It exits without replacing the live manifest if validation or a shard upload fails.

The source is bounded to 12 retailers and each catalog shard to 1 MiB. A future source that exceeds either publication invariant is rejected; the previously published manifest remains live.

Confirm that the manifest exists without exposing the bucket publicly:

```bash
pnpm exec wrangler r2 object get my-stamppot-groceries/catalog/manifest.json --pipe --remote --jurisdiction eu --config apps/edge/wrangler.jsonc
```

## Deploy the Worker

Run the repository's production build and deployment:

```bash
pnpm deploy
```

The first deployment applies the `v1` migration for the SQLite-backed `ShoppingListObject`. No separate Durable Object provisioning command is required. The rate-limit binding is created from the Wrangler configuration; its namespace ID must remain stable across later deployments.

## Verify the deployment

Use the `workers.dev` URL printed by Wrangler, or the configured custom domain:

```bash
curl https://your-worker.example/health

curl https://your-worker.example/v1/tools/find_grocery_options \
  --header 'content-type: application/json' \
  --data '{"query":"melk"}'
```

The health response should report `status: "ok"`. The grocery request should report `status: "ok"`, catalog provenance, and either matching offers or an empty offer array. A `catalog_unavailable` result usually means the configured bucket does not contain a valid current manifest or the deployed binding points to a different bucket.

Connect an MCP client to:

```text
https://your-worker.example/mcp/groceries
```

## Refresh and retain catalog data

Run the same remote sync command whenever prices should be refreshed. The repository does not install a scheduled trigger, so production operators must invoke it manually or from their own scheduler or CI job.

Each successful sync retains the prior immutable catalog version and only advances the manifest pointer. This release does not delete old versions or configure an R2 lifecycle rule; monitor storage growth and establish a separate retention policy if needed.

## Operational notes

- A shopping-list `listKey` is an unrecoverable bearer capability. Stamppot cannot enumerate or recover lost keys.
- Saved lists expire 90 days after their latest successful save. Reads do not extend expiry.
- The write limiter is an abuse brake, not authorization or exact accounting. Cloudflare applies its counters per location and updates them approximately.
- Keep the R2 bucket private and keep the `GROCERIES_CATALOG`, `SHOPPING_LISTS`, and `SHOPPING_LIST_WRITES` binding names unchanged unless the Worker code is updated at the same time.

See [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) for namespace semantics and [`docs/decisions/groceries.md`](../decisions/groceries.md) for the storage, retention, and capability model.
