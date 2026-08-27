# Plan 001: Build the authless groceries MCP on R2 and Durable Objects

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and said they maintain the index.
>
> **Worktree prerequisite (run first)**: `git rev-parse --verify HEAD`
>
> This repository had an unborn `main` branch when the plan was written, so there is no planned-at commit SHA and a normal Git worktree cannot yet be created. The command above must print a commit SHA. If it fails, STOP: ask the operator to create or identify the intended baseline commit, then create an isolated worktree from it. Do not create the baseline commit, stage the user's files, or implement in the original uncommitted checkout on your own authority.
>
> **Snapshot drift check (run second)**: from the execution worktree, run the `shasum` command in "Current state" and compare every hash. If an existing in-scope file differs, compare its live code with the excerpts below. Any semantic mismatch is a STOP condition. A line-ending-only or plan-status-only difference is not semantic drift.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: a baseline commit and an isolated worktree
- **Category**: direction
- **Planned at**: unborn `main` worktree snapshot, 2026-08-27

## Why this matters

Stamppot's primary consumer is an agent such as Hermes or OpenClaw. A user asks where shampoo is cheapest, asks the agent to price a birthday party, or asks it to remember a list and tell them whether its price has dropped. The MCP should answer those questions deterministically, with source freshness and honest package assumptions, while remaining usable without accounts or OAuth.

The cheapest fitting Cloudflare architecture separates two workloads. The open supermarket catalog is rebuilt in bulk and read often, so store immutable, precomputed query artifacts in R2 and serve the hosted copy through an R2 custom domain with Cache Rules and Smart Tiered Cache. Shopping lists and watches are small mutable state, so use one SQLite-backed Durable Object per unguessable anonymous capability. Do not add D1 in this version.

## Product and architecture decisions

These decisions are part of the public contract. Do not silently change them while implementing.

### User job

- The calling agent owns conversational reasoning: converting “a birthday for 16 adults and 6 children” into concrete items and quantities, asking follow-up questions, and presenting trade-offs.
- Stamppot owns Dutch grocery retrieval: matching a query to real packages, separating checkout price from comparable unit value, calculating package counts, comparing retailer combinations, totaling matched items, and returning unmatched items and assumptions.
- Never represent an unmatched item as €0. A party quote may be partial, but it must say so and give `pricedLineCount`, `unmatchedLineCount`, and an explicit confidence/freshness result.
- One-shot basket pricing must not require a caller-generated identifier or persisted server state. A caller repeats or refines a quote by sending back the returned `replayInput`; retaining a saved-list key is a separate, explicitly stateful workflow.

### Storage decision

| Concern | Choice | Reason |
|---|---|---|
| Searchable catalog | Immutable JSON artifacts in R2 | Daily bulk replacement and cacheable reads; no row-import/index-write bill |
| Hosted cache | R2 custom domain + Cache Rules + Smart Tiered Cache | Shared CDN cache and shielded R2 origin |
| Local/self-hosted catalog | Direct R2 binding | No custom domain or cache setup required |
| Lists and watches | SQLite-backed Durable Object per capability | Atomic revisions, isolation, TTL deletion, available on Workers Free |
| Accounts/auth | No accounts or OAuth; 128-bit bearer `listKey` | Possession grants access to exactly one saved list; no global enumeration |
| Abuse control | Workers Rate Limiting binding on list writes | Cheap approximate protection without CAPTCHA or user identity |

Do not use `caches.default.put()` for catalog objects. Cloudflare documents that Cache API entries are local and do not participate in Tiered Cache. The hosted `HttpCatalogObjectStore` must use `fetch()` against the R2 custom domain. The fallback `R2CatalogObjectStore` uses the binding directly and accepts the extra Class B reads.

### Why not D1

The Checkjebon snapshot inspected on 2026-08-27 contained 12 retailer entries and 104,995 offers. A prototype three-character token-prefix index over that snapshot produced 128 JSON shards totaling about 38.4 MB uncompressed: approximately 300 KB average and 764 KB maximum per shard. That is a small R2/CDN workload. By contrast, D1 Free currently allows 100,000 rows written per day, and index writes count too, so even an initial one-row-per-offer import would cross the free daily write allowance before indexes or history.

D1 may be reconsidered only if a future product requires ad-hoc relational queries that cannot be compiled into bounded artifacts. It is not a fallback to add during this implementation.

## Current state

The repository is a pnpm/TypeScript monorepo deployed as one Cloudflare Worker.

- `package.json:8-22` defines the exact gates: `pnpm check` runs content validation, Ultracite, typecheck, tests, and build; `pnpm cf-typegen` generates `CloudflareBindings` from Wrangler config.
- `pnpm-workspace.yaml:1-3` already includes every directory under `packages/*`, so creating `packages/mcp-groceries` requires no workspace-glob change. The same file's catalog holds pinned dependency versions.
- `CONTRIBUTING.md:5-20` requires `packages/mcp-<domain>`, one exported `McpDefinition`, one content Markdown file per operation, source/licence/freshness/error documentation, and deterministic tests with no live upstream.
- `packages/mcp-calendar/src/index.ts:13-70` is the structural exemplar: define each operation with `defineOperation`, then group operations with `defineMcp`.
- `packages/core/src/index.ts:11-17` exposes operation descriptions but has no tool-annotation field. Add an optional neutral `OperationAnnotations` shape so model-facing behavior hints remain part of the operation interface instead of being hard-coded in an adapter.
- `packages/mcp-adapter/src/index.ts:24-32` forwards operation title, description, input schema, and output schema to MCP. Lines 64-68 currently use `legacy: "reject"`; broaden that one option to `legacy: "stateless"` so ordinary 2025 Streamable HTTP clients work without adding protocol sessions or deprecated standalone SSE.
- `apps/edge/src/worker.ts:14-30` constructs one module-scope registry and separate combined/domain MCP handlers. Lines 91-168 route MCP, plain HTTP, health, sitemap, tool pages, and landing output.
- `apps/edge/wrangler.jsonc:1-13` has no storage or rate-limit bindings yet. It already uses compatibility date `2026-08-27`, `nodejs_compat`, assets, and observability.
- `vitest.config.ts:6-12` runs tests with `@cloudflare/vitest-plugin` against `apps/edge/wrangler.jsonc`; `test/worker.test.ts` is the route/MCP exemplar.
- `docs/research/mcp-worker-architecture.md` currently defers persistence and assumes an explicitly authenticated state handle. The new decision docs must narrow that statement: catalog reads stay public; anonymous state uses a bearer capability token without accounts.
- Landing/tool pages are generated from the operation registry and operation content. Registering the MCP should add its pages automatically; do not hand-edit landing components or design tokens.

The important existing shapes are:

```ts
// packages/core/src/index.ts:5-9
export interface OperationContext {
  readonly now: () => Date;
  readonly request: Request;
  readonly signal: AbortSignal;
}

// apps/edge/src/worker.ts:14-17
const SERVER_VERSION = "0.1.0";
const TOOL_PAGE_PATTERN = /^\/tools\/([a-z][a-z0-9_]*)$/;
const registry = new OperationRegistry([calendarMcp]);
const toolCatalog = toolContent(registry);
```

Do not add catalog/state fields to `OperationContext`. Build `createGroceriesMcp(dependencies)` and close over narrow dependency interfaces, so package tests can inject in-memory fakes and the Worker can inject Cloudflare bindings without changing the core abstraction.

### Snapshot hashes

Run:

```bash
shasum -a 256 package.json pnpm-workspace.yaml apps/edge/package.json apps/edge/wrangler.jsonc apps/edge/src/worker.ts packages/core/package.json packages/core/src/index.ts packages/mcp-adapter/package.json packages/mcp-adapter/src/index.ts packages/mcp-calendar/src/index.ts CONTRIBUTING.md README.md test/worker.test.ts docs/research/mcp-worker-architecture.md
```

Expected plan-time snapshot:

```text
7978549a8dc4b42131ac949bbc6dbd686a0ff0d3c9203a4c77e22b2c57f7b519  package.json
f87e0eeab4535885a26ee599441737ff864a2fd05867935bd239e951a2a572a6  pnpm-workspace.yaml
bab67cc6ed5493654a80dba9fef149aa1010f658b815574110633a9b4073dc0c  apps/edge/package.json
220afbad746a0ffbc08a2e23645afe844aa9da83397f2fab8fb3e49c52e00cc2  apps/edge/wrangler.jsonc
ec15e47324c49c643c4e84b2cef44d0e6dddbf77a802d97de868f2c440326d5a  apps/edge/src/worker.ts
d9ec7b5b0ed0d3f5b8c3ccd7a39044d455697cf752ab13093c516b6980cebf23  packages/core/package.json
55750d0464f1ad70162b7ecaaa386be5017ff0be25b52ef4522014f96a9cbd58  packages/core/src/index.ts
09d3dd51ba5641fe3a4e4426b86b05283317de69ecf4aeb04ef118a98ccf2edf  packages/mcp-adapter/package.json
74bbe48d56b14517f95cd728e67dee301d3fc9a0a01769ceb71d9cf3b30162ab  packages/mcp-adapter/src/index.ts
8245e6c79b869bb4a4b9d36e89305db2d66e47f5f05103265c209cceb7bcfcb1  packages/mcp-calendar/src/index.ts
7a01130d051615123601d5e9092d6fa9c97b2549b7febe0411b6ed168254502d  CONTRIBUTING.md
13f999ead5b7b49f5a6919cb5d326f7daa3a7d0b3b64c6476c061039d4024648  README.md
9e63054dc3cb69e006613b2527b8f3f38d6d861093937b4fb238bcd27ee7c666  test/worker.test.ts
558ecbdd56d3cad45e5ea3ce54d2eff22207f71ab0ce2aa36b8f553be93581ee  docs/research/mcp-worker-architecture.md
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install/update lockfile | `pnpm install` | exit 0; `pnpm-lock.yaml` updated only for declared workspace/dependency changes |
| Generate bindings | `pnpm cf-typegen` | exit 0; generated `CloudflareBindings` contains the R2, Durable Object, rate-limit, and catalog URL bindings |
| Focused tests | `pnpm exec vitest run test/core.test.ts test/mcp-adapter.test.ts test/groceries-catalog.test.ts test/groceries-basket.test.ts test/groceries-state.test.ts test/groceries-worker.test.ts test/groceries-sync.test.ts` | all named files pass |
| Content contract | `pnpm check:mcp-content` | validates all seven groceries content files |
| Format | `pnpm dlx ultracite fix` | exit 0; inspect and keep only formatting/lint fixes in scope |
| Full gate | `pnpm check` | exit 0; content, lint, typecheck, all tests, and build pass |
| Deploy shape | `pnpm exec wrangler deploy --config dist/stamppot/wrangler.json --dry-run` | exit 0; no remote deployment occurs |
| Frozen install | `pnpm install --frozen-lockfile` | exit 0 after the lockfile has been updated |

Do not run `pnpm deploy`, the remote bootstrap command, or the remote catalog sync as verification; those mutate Cloudflare or GitHub state.

## Suggested executor toolkit

If these skills are available, read and use them before editing:

- `cloudflare` for choosing and configuring platform bindings.
- `workers-best-practices` for binding types, global-scope safety, `fetch`, observability, and Web Crypto.
- `durable-objects` for SQLite migrations, RPC, alarms, and isolated tests.
- `wrangler` for the R2 bootstrap/sync commands and dry-run deployment.

Primary references:

- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [R2 custom domains and caching](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [R2 interaction with Cloudflare Cache](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/)
- [Workers Cache API and Tiered Cache limitation](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [R2 Workers binding](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Durable Objects pricing and Free-plan availability](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [MCP tool schemas, structured content, output schemas, and annotations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- `node_modules/agents/docs/mcp-servers.md` for the checked-in Agents SDK's stateless 2025 compatibility lane.
- [Hermes MCP client setup](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/)
- [OpenClaw MCP client commands](https://docs.openclaw.ai/cli/mcp)
- [Claude Desktop remote custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

## Scope

**In scope** (the only files/directories the executor may modify or create):

- `packages/mcp-groceries/package.json`
- `packages/mcp-groceries/README.md`
- `packages/mcp-groceries/src/aliases.ts`
- `packages/mcp-groceries/src/catalog-build.ts`
- `packages/mcp-groceries/src/catalog-format.ts`
- `packages/mcp-groceries/src/catalog.ts`
- `packages/mcp-groceries/src/cloudflare.ts`
- `packages/mcp-groceries/src/contracts.ts`
- `packages/mcp-groceries/src/index.ts`
- `packages/mcp-groceries/src/operations.ts`
- `packages/mcp-groceries/src/shopping-list-object.ts`
- `packages/mcp-groceries/content/check_price_watches.md`
- `packages/mcp-groceries/content/find_grocery_options.md`
- `packages/mcp-groceries/content/find_price_drops.md`
- `packages/mcp-groceries/content/get_price_history.md`
- `packages/mcp-groceries/content/get_shopping_list.md`
- `packages/mcp-groceries/content/plan_grocery_basket.md`
- `packages/mcp-groceries/content/update_shopping_list.md`
- `packages/mcp-groceries/fixtures/checkjebon-small.json`
- `scripts/groceries-catalog.ts`
- `scripts/setup-self-hosted.mjs`
- `test/groceries-catalog.test.ts`
- `test/groceries-basket.test.ts`
- `test/groceries-state.test.ts`
- `test/groceries-worker.test.ts`
- `test/groceries-sync.test.ts`
- `test/core.test.ts`
- `test/mcp-adapter.test.ts`
- `packages/core/src/index.ts`
- `packages/mcp-adapter/src/index.ts`
- `apps/edge/src/worker.ts`
- `apps/edge/package.json`
- `apps/edge/wrangler.jsonc`
- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `README.md`
- `docs/research/mcp-worker-architecture.md`
- `docs/decisions/groceries-storage.md`
- `docs/decisions/anonymous-shopping-lists.md`
- `docs/runbooks/groceries-self-hosting.md`
- `.github/workflows/ci.yml`
- `.github/workflows/groceries-catalog-sync.yml`
- one new `.changeset/*.md` created by `pnpm changeset`
- `plans/README.md` for the final status update only

**Out of scope** (do not touch):

- Every file under `packages/core/**` except `packages/core/src/index.ts`, and every file under `packages/mcp-adapter/**` except `packages/mcp-adapter/src/index.ts`; the only framework changes allowed are optional operation annotations and the existing stateless legacy compatibility lane.
- `packages/http-adapter/**`; dependency closure still avoids HTTP adapter changes.
- `apps/edge/src/landing/**`, `apps/edge/src/landing/styles.css`, and `DESIGN.md`; registry/content generation already handles the new MCP and its deterministic card treatment.
- D1 bindings, schemas, migrations, or databases.
- User accounts, OAuth, email, API keys for MCP consumers, Turnstile, push notifications, webhooks, and background alarms per watch.
- A general event/party ontology or any server-side LLM call.
- Recipe generation, store location/inventory guarantees, substitutions based on dietary/medical claims, and checkout automation.
- Committing generated `worker-configuration.d.ts`, `dist/**`, `.wrangler/**`, catalog artifacts, or fetched upstream snapshots.
- Creating Cloudflare resources, GitHub secrets/variables, deploying, pushing, or opening a PR during implementation unless the operator separately authorizes it.

## Git workflow

- Work only in the isolated worktree supplied by the operator. Start from a clean `git status --short`; STOP if unrelated modifications are present.
- Suggested branch after a baseline exists: `feat/groceries-mcp`.
- There is no commit history from which to infer a message convention. Use small logical commits with clear imperative subjects if the operator asks for commits; otherwise leave the work uncommitted for review.
- Never push or open a PR unless explicitly instructed.

## Public MCP contract

Create exactly seven operations. Names are stable and must not be expanded in this plan.

### 1. `find_grocery_options`

Input: `query` (2-120 characters), optional retailer slugs (maximum 12), `limit` (1-20, default 10), and sort preference `checkout_price | unit_value`.

Output: matched offers with stable `offerId`, retailer name/slug, product name, package text, integer `priceCents`, `currency: "EUR"`, product URL, parsed base quantity/unit when known, comparable unit price when known, match confidence/reason, and source/freshness metadata. Also identify `cheapestUpfrontOfferId` and `bestUnitValueOfferId`; these may differ. Never compare unit prices across `g`, `ml`, `each`, and unknown/package units.

### 2. `plan_grocery_basket`

This operation is stateless, read-only, and safe to invoke repeatedly. It must not require or return a stored quote ID.

Input: 1-20 ordered lines. Each line has `query` (2-120 characters), optional target `{ value, unit: "g" | "kg" | "ml" | "l" | "each" | "package" }`, and optional `optional` boolean defaulting to `false`. The outer input also accepts an optional budget in integer cents, retailer filter, `maxStores` 1-3, and optional `catalogVersion`. There is deliberately no caller-provided line ID. Preserve input order and correlate every selected, unmatched, excluded, and assumption record with a one-based `lineNumber` plus the original query.

If target is omitted, price exactly one sale package. Convert `kg` and `l` to `g` and `ml`; `each` and `package` require positive integers. `package` means a count of sale packages and does not require a parsed package quantity. A matched optional line is still priced; an unmatched optional line is reported but does not make the quote incomplete. Budget is comparative metadata and never silently drops a line.

Resolve the current manifest exactly once at call start when `catalogVersion` is omitted. Output top-level `catalogVersion`, `quotedAt`, and `replayInput`, plus both `bestSingleStore` and `cheapestWithinStoreLimit` when possible. `replayInput` is a complete, schema-valid input with every default made explicit and the resolved catalog version pinned; an agent can copy it verbatim, change one field, and call the tool again. The same `replayInput` while that immutable version is retained must produce the same selections, ordering, assumptions, and totals; only `quotedAt` may change. Removing `catalogVersion` intentionally refreshes against the latest manifest. A requested version outside retention returns `catalog_version_unavailable`.

Each plan includes selected packages, package counts calculated with `ceil(targetBaseQuantity / packageBaseQuantity)`, line totals, retailer totals, integer `pricedTotalCents`, budget delta, package-rounding assumptions, unmatched lines, and source freshness. Enumerate retailer combinations only across the bounded 12 retailers and maximum three stores. No item may be silently dropped or priced at zero.

This is the party-planning seam: Hermes, OpenClaw, or Claude turns the occasion into at most 20 concrete lines; this operation turns those lines into packages and a cost. Its MCP description must say both facts explicitly: first decompose an occasion into concrete grocery lines; for a follow-up, resend the complete returned `replayInput`. Add a deterministic fixture test representing 16 adults and 6 children with drinks, snacks, cake ingredients, and disposable supplies.

### 3. `find_price_drops`

Input: optional query and retailer filters, minimum percentage drop, and limit 1-20. Output bounded current drops from the published catalog version, including before/after cents, percentage, offer identity, URL, and observed dates.

### 4. `get_price_history`

Input: one `offerId`. Output at most 90 days of price-change events (do not repeat an unchanged daily price), current availability/price, and freshness. Missing products return an explicit `unavailable` state rather than a fabricated price.

### 5. `get_shopping_list`

Input: one `listKey`. Return the same `listKey`, title, budget, server-generated line/watch identifiers, revision, expiry, and a current basket quote using the same planner. Reads do not extend expiry. Treat invalid, expired, and unknown capabilities as stable domain errors without revealing whether similar keys exist.

### 6. `update_shopping_list`

Input: optional `listKey` for creation; `expectedRevision` is required for every update to an existing list; one atomic array of mutations from `set_title`, `set_budget`, `upsert_line`, `remove_line`, `set_checked`, `upsert_watch`, and `remove_watch`. An `upsert_line` without `lineId` creates a line and assigns one server-side; an `upsert_line` with `lineId` updates it. Removal/check mutations require an identifier returned by the list tools. Watches follow the same create-without-ID/update-with-ID rule.

On creation, generate a random 128-bit base64url `listKey` with Web Crypto. Every successful shopping-state response returns the continuation tuple `{ listKey, revision }` and the complete canonical state, so the next agent call need only copy server-owned identifiers. Possession of `listKey` is the authorization mechanism. Cap state at 20 list lines, 20 watches, a 100-character title, 120-character queries, 500-character notes, and 64 KiB serialized state. Return revision conflicts with the non-secret current revision and recovery instruction to call `get_shopping_list`; do not use last-write-wins.

Creation is not idempotent: if a client loses the response and retries without `listKey`, it may create a second unreachable list. Say this in the tool description and runbook. The server cannot recover a lost key or infer which list belongs to an MCP connection, conversation, Claude account, Hermes profile, or OpenClaw session.

### 7. `check_price_watches`

Input: `listKey`. Return the same continuation tuple and pull-evaluate at most the 20 stored watches against the current catalog. Support `offer_price` (`offerId`, `belowCents`) and `basket_total` (`belowCents`, `maxStores`). Return triggered/not-triggered/unavailable status with current value and freshness. Do not add per-watch alarms or outbound notifications.

Every operation output includes a compact provenance object with source name, source URL, license, catalog version, and `observedAt`. The package README and tool content must say prices are indicative snapshots, may differ by location/checkout time, and are not inventory guarantees.

Every input property, including nested basket-line, quantity, filter, mutation, and watch properties, must use Zod `.describe(...)` text that states meaning, units, default/omission behavior, and one compact example where useful. The MCP `tools/list` descriptor is what Hermes/OpenClaw/Claude see; the richer `content/*.md` page is not a substitute for a self-explanatory JSON Schema.

Mark `plan_grocery_basket` with MCP annotations `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: true`. Add an optional `OperationAnnotations` field to the core operation interface and forward it unchanged from the MCP adapter. Annotate the other six operations accurately; in particular, `update_shopping_list` is mutating and non-idempotent because its create form can allocate a new list.

### Identifier contract

| Name | Owner and format | Stability and use |
|---|---|---|
| `lineNumber` | Server response; integer 1-20 | Correlates one stateless basket result to ordered input. It is not an identifier and must not be sent back. |
| `catalogVersion` | Server-owned opaque timestamp/hash string | Pins all catalog reads in one quote and enables deterministic replay while retained. Clients copy it but do not parse it. |
| `offerId` | `off_` plus unpadded base64url of the full SHA-256 digest of UTF-8 `v1\0{retailerSlug}\0{canonicalSourcePath}` | Stable across catalog versions only while retailer slug and canonical source path remain unchanged. Opaque and case-sensitive. |
| `listKey` | `lst_` plus 22 unpadded base64url characters encoding 16 random bytes | Bearer capability for exactly one saved list. Opaque, case-sensitive, unrecoverable, and required only for saved-state tools. |
| `lineId` / `watchId` | Server-generated opaque IDs within one saved list | Used only to update/remove persisted entries. Returned in complete canonical state; never required when creating an entry. |

JSON-RPC request IDs are protocol details and must never be exposed as grocery-domain identifiers.

## Catalog artifact contract

Use this exact logical layout; the manifest is the sole mutable pointer and is published last:

```text
catalog/manifest.json
catalog/versions/{version}/retailers.json
catalog/versions/{version}/index/000.json ... 127.json
catalog/versions/{version}/offers/000.json ... 127.json
catalog/versions/{version}/history/000.json ... 127.json
catalog/versions/{version}/price-drops.json
catalog/versions/{version}/metadata.json
```

- `version` is an observed UTC timestamp plus a short SHA-256 of the normalized source.
- Every version object includes `formatVersion`, content hash, source, license, and observation time where appropriate. Versioned object keys are immutable.
- `manifest.json` contains at least `formatVersion`, `currentVersion`, `observedAt`, `source`, `license`, `shardCount: 128`, and integrity hashes. Validate every referenced object before publishing it.
- Upload every version object first, then atomically replace `manifest.json`. A failed build/upload must leave the prior manifest live.
- Give immutable objects `Cache-Control: public, max-age=31536000, immutable`. Give the manifest `Cache-Control: public, max-age=60` on the public custom-domain path.
- Keep version objects for 30 days through an R2 lifecycle rule documented in the runbook. Keep price-change events for a rolling 90 days. Never place list state, capabilities, logs, or secrets in R2.
- Fetch the open Checkjebon source from `https://www.checkjebon.nl/data/supermarkets.json`; document its project at `https://github.com/supermarkt/checkjebon` and the applicable MIT licence. Validate its shape strictly: retailer `{ n, c, u, i, d }`; product `{ n, l, p, s }`. Reject a malformed or empty source before any publish.
- Derive a stable `offerId` from retailer and source product path using SHA-256. Do not use array positions.

Normalize search text with Unicode NFKD, diacritic removal, lowercase, punctuation-to-space, and collapsed whitespace. Maintain a small reviewed English-Dutch grocery alias map in `aliases.ts`; do not call an LLM. Parse common package strings including Dutch decimal commas, `6 x 0,33 l`, `800 g`, `20 stuks`, and `per stuk/pakket` into `g`, `ml`, `each`, or `unknown`.

For search, index each offer summary under the first three characters of each unique normalized token, or the whole token when it has exactly two characters. Hash that prefix with a documented stable 32-bit FNV-1a function into 128 physical shards. The query chooses the longest normalized/aliased token as its anchor, reads no more than three distinct index shards, filters candidates against all normalized query tokens, and ranks deterministically. Store enough summary data in the index shard to return search/basket results without an additional offer-shard read. Offer shards exist for direct history/watch lookup.

Expose the deep seam:

```ts
interface CatalogObjectStore {
  getJson(key: string, signal?: AbortSignal): Promise<unknown>;
}

interface GroceryCatalog {
  search(...): Promise<...>;
  planBasket(...): Promise<...>;
  findPriceDrops(...): Promise<...>;
  getPriceHistory(...): Promise<...>;
}
```

Implement `MemoryCatalogObjectStore` for tests, `R2CatalogObjectStore` for local/self-hosted reads, and `HttpCatalogObjectStore` for the official custom-domain/Tiered Cache path. Keep these in `mcp-groceries`; do not introduce a generic storage package.

## Steps

### Step 1: Record the storage and capability decisions

Create `docs/decisions/groceries-storage.md` and `docs/decisions/anonymous-shopping-lists.md` before code. Include the decisions and rejected alternatives above, data ownership, retention, failure behavior, cache topology, capability threat model, rate-limit limitations, and migration triggers. Update only the persistence/authentication paragraphs in `docs/research/mcp-worker-architecture.md` so they no longer imply that every state handle requires an account.

The capability decision must say plainly: this is “authless” in the product sense of no signup/OAuth, but the random `listKey` is still a bearer capability; anyone who obtains it can read or modify that one list. Stamppot must never place it in URLs, R2, server-controlled analytics, structured logs, or error messages. It necessarily appears in normal MCP tool arguments/results, and Hermes, OpenClaw, Claude, or their operators may retain those conversations/tool records under their own policies. Rotation/recovery, automatic client association, and cross-device discovery do not exist in v1.

**Verify**: `rg -n "R2|Tiered Cache|Durable Object|capability|D1" docs/decisions docs/research/mcp-worker-architecture.md` → both new decisions contain the chosen architecture, the research doc acknowledges capability-held state, and no document claims Cache API provides Tiered Cache.

### Step 2: Make MCP descriptors agent-friendly and scaffold the package

In `packages/core/src/index.ts`, add optional operation annotations as part of the operation interface/description and carry them through `defineOperation`. Keep the core module independent of the MCP package by defining the four boolean hint fields locally. In `packages/mcp-adapter/src/index.ts`, forward annotations to `registerTool` and change only `legacy: "reject"` to `legacy: "stateless"`. Keep `responseMode: "auto"`; do not add protocol sessions, a transport Durable Object, or deprecated standalone SSE.

Extend `test/core.test.ts` to prove annotations survive definition/description. Create `test/mcp-adapter.test.ts` to prove `tools/list` exposes annotations and nested property descriptions and that ordinary calls work through both the current 2026 protocol and the stateless 2025 compatibility lane. Each lane must use a fresh request/client sequence, call a read operation twice, and require no MCP session ID. These are transport/descriptor tests, not live Hermes/OpenClaw/Claude tests.

Create `packages/mcp-groceries/package.json` matching `packages/mcp-calendar/package.json`: private ESM package at `0.1.0`, `.` export for `src/index.ts`, plus explicit `./cloudflare` and `./catalog-build` exports. Depend only on `@stamppot/core`, `zod`, and platform APIs already provided by the Worker runtime. Add `@stamppot/mcp-groceries` as a workspace dependency of `apps/edge` and as a root dev dependency for tests.

In `contracts.ts` and `catalog-format.ts`, define Zod schemas and inferred types for the seven tool contracts, manifest/artifact format, offers, quantities, histories, and list mutations. Use integer cents everywhere; reject negative/unsafe integers, unknown retailer counts over 12, arrays over their documented caps, and unrecognized units. Export named constants for all caps and `CATALOG_FORMAT_VERSION`.

Add the seven `content/*.md` files now, following `packages/mcp-calendar/content/get_dutch_time.md`. Each needs valid YAML frontmatter, one H1, agent-oriented examples, related tool names, source/license/freshness/error behavior, and the hosted `/mcp/groceries` route. Add package README sections for consumer use, source provenance, exact tools, self-hosting link, and capability warning.

Create initial schema/normalization tests in `test/groceries-catalog.test.ts` before implementation. Add `tsx` as a pinned root development dependency through the workspace catalog so the later TypeScript sync CLI can run without duplicating builder logic. Use `pnpm add -Dw tsx`, then move the resolved exact version into `pnpm-workspace.yaml`'s catalog and set the root dependency to `catalog:` before committing the lockfile.

**Verify**: `pnpm install && pnpm check:mcp-content && pnpm exec vitest run test/core.test.ts test/mcp-adapter.test.ts test/groceries-catalog.test.ts` → install and content checks pass; annotations/descriptors and both stateless protocol lanes pass; schema tests pass; exactly seven grocery operation content files are validated.

### Step 3: Build deterministic immutable catalog artifacts and the sync CLI

Implement pure builder functions in `catalog-build.ts` and the format/normalizer/package parser in `catalog-format.ts` and `aliases.ts`. Add a small legally redistributable upstream-shaped fixture at `packages/mcp-groceries/fixtures/checkjebon-small.json`; it must contain synthetic names/prices, not a large copied production snapshot.

Implement `scripts/groceries-catalog.ts` as a `tsx` CLI with these modes:

```text
pnpm groceries:sync --local --if-empty
pnpm groceries:sync --remote --bucket <explicit-name>
pnpm groceries:sync --build-only --source <fixture-or-url> --output <directory>
```

Add root scripts `groceries:sync` and `predev` where `predev` runs the local `--if-empty` form. The CLI may fetch the documented Checkjebon URL only outside tests. It builds in an OS temporary directory, validates schema/counts/hashes, reads prior history when available, uploads with bounded concurrency by spawning Wrangler with argument arrays and `shell: false`, and publishes the manifest last. Never interpolate a source URL, bucket name, object key, or path into a shell command. An unchanged source hash exits successfully without publishing a new version.

Keep the builder independent from Wrangler behind a publisher interface. In `test/groceries-sync.test.ts`, use an in-memory recording publisher to prove deterministic keys/content, manifest-last ordering, malformed/empty rejection, unchanged-hash no-op, one history event for one price change, no event for unchanged price, and 90-day trimming. Tests must never make a live request or run remote Wrangler.

**Verify**: `pnpm exec vitest run test/groceries-catalog.test.ts test/groceries-sync.test.ts` → all parser, normalizer, sharding, determinism, validation, ordering, and history cases pass. Then create an OS temp directory with `groceries_artifact_dir="$(mktemp -d)"` and run `pnpm groceries:sync --build-only --source packages/mcp-groceries/fixtures/checkjebon-small.json --output "$groceries_artifact_dir"` → exits 0 and prints version, object count, offer count, and manifest hash without changing the worktree.

### Step 4: Implement bounded search, price history, drops, and basket pricing

Implement the three `CatalogObjectStore` adapters and `GroceryCatalog` in `catalog.ts`; Cloudflare adapters belong in `cloudflare.ts`. The HTTP adapter accepts only a configured base URL plus internally generated catalog keys. Do not accept a base URL or arbitrary object key from tool input. Check `response.ok`, cap object size before JSON parsing where the runtime API permits, validate decoded JSON with the artifact schemas, propagate the request abort signal, and return stable domain errors for stale/missing/corrupt catalogs.

Implement the first four read operations and the planner in `operations.ts`. `createGroceriesMcp({ catalog, shoppingLists, createListKey, writeLimiter })` closes over interfaces; it performs no I/O at module construction time. Make ranking and tie-breaking deterministic. Limit any one query to three distinct index shard fetches; deduplicate shard reads across a basket. Keep no request-specific mutable state at module scope.

Change the catalog seam so a basket resolves one `CatalogSnapshot` from either the supplied `catalogVersion` or the current manifest before evaluating any line. All reads for that quote use that snapshot. Build `replayInput` from the validated request plus explicit defaults and the resolved version; do not store it or allocate a quote object. This is the depth-producing seam: callers learn one replayable input while manifest lookup, pinning, package arithmetic, store enumeration, and deterministic ordering stay inside the module.

In `test/groceries-catalog.test.ts`, cover:

- stable normalization, alias expansion, FNV-1a sharding, and offer IDs;
- decimal commas, multipacks, grams/litres, pieces, and unknown package strings;
- `shampoo` search where checkout-price and unit-value winners differ;
- refusal to compare incompatible/unknown units;
- deterministic ties, retailer filters, malformed artifacts, stale manifest, and no-result behavior;
- drops and 90-day change-only history, including unavailable offers;
- store/fetch counters proving a single search reads at most one manifest plus three index shards.

In `test/groceries-basket.test.ts`, cover calls with no client IDs, one-based line correlation, omitted-target one-package behavior, package ceiling arithmetic, one-store versus up-to-three-store results, optional and unmatched lines, explicit partial totals, budget deltas, incompatible units, deterministic combination ties, maximum input bounds, and the 16-adult/6-child party fixture. Assert no more than one manifest plus 20 unique index-shard reads for a maximum basket. Call once without a version, call again with the returned `replayInput` after advancing the manifest, and assert the pinned selections/totals remain identical. Then remove `catalogVersion` and assert the result intentionally refreshes. Cover `catalog_version_unavailable` after retention. Assert `replayInput` itself passes the operation's input schema.

**Verify**: `pnpm exec vitest run test/groceries-catalog.test.ts test/groceries-basket.test.ts` → all named cases pass, including fetch-count assertions and the party cost result.

### Step 5: Add the anonymous shopping-list Durable Object

Implement a narrow `ShoppingListService` interface and `ShoppingListObject` in `shopping-list-object.ts`. Extend `DurableObject<CloudflareBindings>` from `cloudflare:workers`; expose RPC methods only. Use `ctx.blockConcurrencyWhile` only to create/migrate SQLite tables. Track migrations in a `_sql_schema_migrations` table; do not use `PRAGMA user_version`.

Use one object per valid capability with `env.SHOPPING_LISTS.getByName(listKey)`. Store normalized list rows, watches, metadata, `revision`, and `expiresAt`. Related SQL writes and the revision increment must be synchronous SQL statements in one turn with no `await` between them. Every update to an existing list checks `expectedRevision`; the entire mutation batch either applies or returns a conflict. Enforce caps inside the object, not only at Zod ingress.

On successful mutation, set one expiry alarm 90 days after that mutation. Reads must not write or extend TTL. `alarm()` deletes all application rows and the alarm; the object then behaves as unknown/expired. Do not schedule alarms for individual watches.

Before any create or update RPC, call a `SHOPPING_LIST_WRITES` Workers Rate Limiting binding. Use a privacy-safe key derived from `CF-Connecting-IP` plus a constant operation namespace; never log the key. Configure 30 writes per 60 seconds. Return a stable retryable rate-limit error. Document that this limiter is approximate and per Cloudflare location, not an accounting or security boundary.

Generate new list keys from 16 bytes of `crypto.getRandomValues`, base64url without padding, prefixed with `lst_`. Generate persisted `lineId` and `watchId` values server-side. Validate fixed formats before obtaining a DO stub. Return the key only in successful shopping-state results, never in errors or Stamppot-controlled logs. There is no operation to enumerate lists and no mapping from an MCP connection/client to a list.

Test in `test/groceries-state.test.ts` with `cloudflare:test` helpers such as `runInDurableObject` and `runDurableObjectAlarm`: creation/roundtrip, 128-bit key format, server-generated persisted line/watch IDs, isolation, atomic multi-mutation, revision conflict/recovery instruction, retry of an already-applied update producing a conflict rather than a duplicate line, caps, 64 KiB guard, reads not extending TTL, mutation extending TTL, alarm deletion, watch evaluation, and rate-limit failure. Open a fresh MCP request sequence and retrieve the list using only the previously returned `listKey`; this proves persistence is independent of MCP connection state. Use isolated storage per test and injected deterministic identifiers only at the operation seam, not inside production crypto.

**Verify**: `pnpm cf-typegen && pnpm exec vitest run test/groceries-state.test.ts` → generated types include `SHOPPING_LISTS` and `SHOPPING_LIST_WRITES`; all state, concurrency, expiry, and limiter cases pass.

### Step 6: Wire Cloudflare bindings and all public routes

Update `apps/edge/wrangler.jsonc` with:

- R2 binding `GROCERIES_CATALOG` and an explicit bucket name suitable for the checked-in official deployment config;
- text var `GROCERIES_CATALOG_BASE_URL`, using an empty string to select direct binding by default;
- Durable Object binding `SHOPPING_LISTS` for exported class `ShoppingListObject`;
- first SQLite migration tag `v1` with `new_sqlite_classes`;
- rate-limit binding `SHOPPING_LIST_WRITES`, limit 30/60 and a repository-specific numeric namespace ID. Prefix runtime limiter keys so accidental namespace reuse with another MCP cannot share counters.

Run `pnpm cf-typegen` and use only generated `CloudflareBindings`; never hand-write `Env`. In `apps/edge/src/worker.ts`, import the environment binding from `cloudflare:workers` or otherwise construct dependency adapters lazily without I/O. Capturing an immutable binding reference at module scope is allowed; request/list/catalog mutable state is not. Export `ShoppingListObject`, add `groceriesMcp` to the combined registry, add a domain handler at `/mcp/groceries`, and keep `/mcp`, `/v1/tools/*`, sitemap, landing, and generated tool pages on their existing shared paths.

When `GROCERIES_CATALOG_BASE_URL` is non-empty, use `HttpCatalogObjectStore`; otherwise use `R2CatalogObjectStore`. Do not put the capability in a URL and do not log MCP/HTTP tool inputs or outputs in Stamppot. Keep CORS and stable error-envelope behavior consistent with existing adapters.

Add `test/groceries-worker.test.ts` to prove:

- `/mcp/groceries` lists exactly the seven tools;
- `/mcp` lists calendar plus groceries;
- `tools/list` exposes self-contained nested property descriptions and correct read-only/idempotency annotations for the planner;
- planner calls return schema-conforming `structuredContent` plus the existing serialized text fallback, and both include `replayInput`;
- `/v1/tools/find_grocery_options` and `/v1/tools/plan_grocery_basket` return fixture-backed results;
- two `plan_grocery_basket` calls work on fresh stateless 2025 and 2026 MCP request sequences, with no caller line IDs and the second call using `replayInput`;
- list creation/update/read works across fresh MCP request sequences using the returned `listKey`, without putting it in a URL;
- invalid input, unknown capability, revision conflict, stale/corrupt catalog, and rate limit use stable non-secret errors;
- landing Markdown/HTML, tool pages, and sitemap include grocery tools without edits under `apps/edge/src/landing/**`.

The Worker test environment must use local R2/DO bindings and deterministic fixture publication. It must not fetch the production custom domain.

**Verify**: `pnpm exec vitest run test/groceries-worker.test.ts test/worker.test.ts` → new and existing Worker/MCP/landing route tests pass. `git diff --name-only -- apps/edge/src/landing DESIGN.md` → no output.

### Step 7: Make clone-and-run and hosted operation explicit

Implement `scripts/setup-self-hosted.mjs` as an interactive but scriptable bootstrap. It must use `spawn` with argument arrays and `shell: false`, check `wrangler whoami`, ask for or accept an explicit Worker/bucket name, create an EU-jurisdiction R2 bucket only after confirming it does not exist, update the Wrangler binding through supported Wrangler options where possible, sync the catalog, deploy the Worker including the DO migration, and print the combined and groceries MCP URLs. Add `--dry-run` that prints redacted commands and performs no writes; tests/CI exercise only this mode. Never overwrite an existing bucket or config silently.

Write `docs/runbooks/groceries-self-hosting.md` with two paths:

1. **Minimum self-hosted path:** clone, `pnpm install`, `pnpm setup:self-hosted`; direct R2 binding, no custom domain, no D1, DO migration included by deploy.
2. **Official/optimized path:** dedicate a public bucket containing only publishable catalog artifacts; attach an R2 custom domain; create Cache Everything rules because JSON is not cached by default; set 60-second TTL for `catalog/manifest.json` and one-year TTL for `catalog/versions/*`; enable Smart Tiered Cache; set `GROCERIES_CATALOG_BASE_URL`; configure a 30-day R2 version lifecycle; provision GitHub variables/secrets for daily sync; verify without exposing credentials.

Explain reuse: the same public grocery catalog bucket/custom-domain artifact may serve future recipe or meal-planning MCPs, but consumers must go through the versioned format/interface rather than inventing ad-hoc keys. Do not share its bucket with unrelated MCP data or any private state. Durable Object namespaces should be owned by the application/state domain; do not reuse this shopping-list namespace for unrelated MCPs.

Add `.github/workflows/groceries-catalog-sync.yml` with daily schedule and manual dispatch. It installs with the frozen lockfile and runs the remote sync using a bucket name/account ID from GitHub variables and an R2-write-scoped token from a GitHub secret. Give the workflow only `contents: read`; use concurrency to prevent overlapping publishes. Update `.github/workflows/ci.yml` only as needed to replace deployment-specific Cloudflare identifiers with documented repository variables and to keep least-privilege token use; never add secret values.

Update `README.md` with `/mcp/groceries`, the seven tools, and Hermes, OpenClaw, and Claude Desktop remote-connector setup. Include a birthday-basket example that first calls the planner without any ID and then refines it by resending `replayInput`. Separately show saved-list creation and state plainly that the user/client must retain `listKey`; Stamppot cannot recover it or associate it with a chat after context reset. Do not encourage storing a bearer key in a third-party agent's long-term memory without the user's explicit choice. Include the source attribution, capability warning, and self-hosting runbook. State clearly that official hosting uses Tiered Cache but minimum self-hosting does not require a custom domain.

Add a post-deployment interoperability checklist to the runbook, but do not execute it during implementation:

- Hermes: add the public URL with `hermes mcp add stamppot --url <public-origin>/mcp/groceries`, run `hermes mcp test stamppot`, then ask for a basket and one refinement.
- OpenClaw: add the remote MCP with the currently documented `openclaw mcp add` form, run `openclaw mcp doctor --probe`, then perform the same two-call prompt. Verify exact CLI flags against current official OpenClaw docs when writing the runbook.
- Claude Desktop: add the publicly reachable endpoint under Customize → Connectors as a remote custom connector, then perform the same two-call prompt. Note that Anthropic's cloud, not the desktop process, originates remote-connector requests.

For all three, the smoke passes only when the first call needs no domain ID, the second call can use `replayInput`, and a saved list can be retrieved from a fresh conversation/request sequence when the user supplies its `listKey`. Do not claim that any client will automatically retain the key across a new conversation.

**Verify**: `node scripts/setup-self-hosted.mjs --dry-run` → exits 0, prints the planned Wrangler steps, and creates/updates/deploys nothing. `rg -n "D1|R2|Tiered Cache|listKey|replayInput|mcp/groceries|Claude Desktop" README.md docs/runbooks/groceries-self-hosting.md docs/decisions` → docs make the topology, stateless replay, three client paths, and capability limitations explicit. Inspect workflow YAML and confirm no literal token/account/bucket secret was added.

### Step 8: Add the release changeset and run the complete gate

Run `pnpm changeset` and select `@stamppot/core`, `@stamppot/mcp-adapter`, `@stamppot/mcp-groceries`, and `@stamppot/edge` with **minor** bumps. The summary is user-facing; say that Stamppot adds operation behavior hints and stateless 2025 MCP compatibility plus an authless Dutch grocery MCP with replayable basket pricing, catalog search, price history/drops, and capability-held shopping lists/watches. Do not select unrelated packages.

Run the formatter, inspect its diff for scope, then run every full verification command. Update `plans/README.md` to `DONE` only after all gates pass.

**Verify**:

```bash
pnpm dlx ultracite fix
pnpm check
pnpm install --frozen-lockfile
pnpm exec wrangler deploy --config dist/stamppot/wrangler.json --dry-run
git status --short
```

Expected: all commands exit 0; Wrangler performs only a dry run; status contains only in-scope files, one new non-empty changeset, and the plan status update. No catalog snapshot/build artifacts, generated bindings, `dist`, `.wrangler`, secrets, or unrelated formatting changes are present.

## Test plan

Use `test/calendar.test.ts` for direct operation invocation style and `test/worker.test.ts` for Worker/MCP route style. Keep all fixtures deterministic and all normal tests offline.

- `test/core.test.ts`: optional operation annotations remain part of the described operation interface.
- `test/mcp-adapter.test.ts`: annotations/property descriptions reach `tools/list`; current 2026 and stateless 2025 requests can each list and call tools twice without a session ID.
- `test/groceries-catalog.test.ts`: schemas, normalization/aliases, hash/sharding stability, package parser, search ranking, checkout vs unit value, incompatible units, provenance, history/drops, corrupt/stale/missing objects, and object-read bounds.
- `test/groceries-basket.test.ts`: no caller IDs, line-number correlation, replay input validation, pinned-version replay after manifest advancement, unpinned refresh, package rounding, retailer combinations, budgets, optional/unmatched lines, partial-total honesty, max bounds, and the birthday-party fixture.
- `test/groceries-sync.test.ts`: source validation, deterministic artifacts, stable IDs, manifest-last publish, unchanged no-op, price-change-only history, retention, and publisher failure leaving the previous manifest live.
- `test/groceries-state.test.ts`: capability generation/validation, server-generated entry IDs, fresh-request continuation, isolation, atomic batches, optimistic revision/recovery, caps/size, expiry alarms, rate limiting, watch kinds, and unavailable offers.
- `test/groceries-worker.test.ts`: seven-tool domain MCP, combined MCP, self-describing schemas/annotations, 2025/2026 stateless repeat calls, HTTP operations, stable errors, R2/DO integration, generated pages, and sitemap.
- Existing `test/worker.test.ts` and the complete existing suite remain green.

Focused verification:

```bash
pnpm exec vitest run test/core.test.ts test/mcp-adapter.test.ts test/groceries-catalog.test.ts test/groceries-basket.test.ts test/groceries-state.test.ts test/groceries-worker.test.ts test/groceries-sync.test.ts
```

Expected: all seven files pass without live network or remote Cloudflare access.

## Done criteria

- [ ] Execution occurred in a clean isolated worktree based on a real baseline commit.
- [ ] Exactly seven grocery operations are exported and available at `/mcp/groceries`, combined `/mcp`, and `/v1/tools/*`.
- [ ] Search distinguishes checkout price from unit value and never compares incompatible units.
- [ ] Basket planning requires no caller-generated domain ID, prices a deterministic 16-adult/6-child party fixture, exposes assumptions, and never treats unmatched items as free.
- [ ] Every basket response contains schema-valid `replayInput` pinned to one catalog version; replay remains deterministic after the current manifest advances, and removing the version refreshes intentionally.
- [ ] The planner's MCP descriptor contains nested field descriptions and correct read-only/idempotency annotations.
- [ ] Current 2026 and stateless 2025 MCP request sequences can each call the planner repeatedly without server-side protocol sessions.
- [ ] Catalog artifacts use 128 immutable versioned R2 shards and manifest-last publication; normal tests do not use live upstream data.
- [ ] Hosted catalog reads use `fetch()` to the configured R2 custom domain; fallback reads use the R2 binding; no Cache API or D1 was added.
- [ ] Shopping lists/watches use a random bearer `listKey`, server-generated entry IDs, revision-checked atomic Durable Object writes, 90-day mutation-based expiry, hard size/count caps, and write rate limiting.
- [ ] Saved state is retrievable from a fresh request sequence using only the returned continuation tuple; docs do not promise automatic cross-conversation key retention or recovery.
- [ ] Stamppot places no capability in URLs, server-controlled logs/errors, R2, or analytics; docs acknowledge normal tool arguments/results and client-controlled retention.
- [ ] `pnpm check:mcp-content` validates all seven content files.
- [ ] `pnpm check` exits 0.
- [ ] `pnpm install --frozen-lockfile` exits 0.
- [ ] Wrangler deploy dry run exits 0 without a remote mutation.
- [ ] Bootstrap dry run exits 0 and the runbook covers minimal and Tiered Cache deployments.
- [ ] One changeset includes `@stamppot/core`, `@stamppot/mcp-adapter`, `@stamppot/mcp-groceries`, and `@stamppot/edge` minor bumps.
- [ ] `git status --short` contains only in-scope changes and no generated/catalog/secret artifacts.
- [ ] `plans/README.md` status is `DONE`.

## STOP conditions

Stop and report back; do not improvise if:

- `git rev-parse --verify HEAD` fails, no isolated worktree was supplied, or the worktree has unrelated changes.
- Snapshot hashes differ and the relevant live behavior no longer matches "Current state".
- Checkjebon no longer provides a legally reusable stable dataset with product name, retailer, product path/URL, price, and package text, or its license/provenance cannot be documented.
- The real catalog cannot be built into bounded artifacts that keep the largest index shard below 1 MiB uncompressed and a maximum basket to no more than 21 catalog object reads. Report measurements before changing shard count or input caps.
- Cloudflare's current platform no longer supports SQLite-backed Durable Objects on the intended plan, R2 custom-domain caching/Tiered Cache, or the Workers Rate Limiting binding used here.
- Implementing correct operations requires modifying `OperationContext`, the HTTP adapter, MCP transport behavior beyond the explicitly allowed stateless legacy lane/annotation forwarding, landing code/design tokens, or adding D1/user accounts/server-side AI.
- A capability would need to appear in a URL, Stamppot-controlled logs/analytics, error messages, or the public R2 bucket. Normal tool arguments/results are the explicit exception documented above.
- Wrangler cannot express the R2/DO/rate-limit configuration or generated binding types without hand-written environment types.
- A focused or full verification fails twice after one reasonable fix attempt.
- Remote resource creation, deployment, GitHub secret mutation, pushing, or PR creation becomes necessary to continue. Those require separate operator authority.

## Maintenance notes

- Reviewers should scrutinize search false positives, package-unit compatibility, partial-total labeling, subrequest bounds, capability leakage, rate-limit placement, SQL revision atomicity, alarm semantics, and manifest-last publication.
- Reviewers should call the planner as an unfamiliar agent would: once from plain language with no IDs, once from `replayInput`, and once as a refresh. Tool-page prose cannot compensate for missing descriptions in `tools/list`.
- `replayInput` is a stateless convenience, not a quote record. Do not later back it with a Durable Object unless a separately justified workflow needs persisted quotes.
- The alias map is a reviewed product surface. Add aliases with deterministic tests; do not turn it into fuzzy uncontrolled translation.
- Monitor catalog age, R2 cache hit ratio/Class B reads, Worker CPU/subrequests, Durable Object requests/row writes/storage, rate-limited writes, and corrupt-artifact errors. Log aggregate error codes and catalog versions only, never tool payloads or capabilities.
- If a second MCP genuinely consumes the grocery catalog, extract the already-versioned artifact reader behind its interface then. Do not let consumers couple directly to bucket internals.
- Push notifications, cross-device account recovery, multiple named lists under one identity, store-specific availability, location-aware pricing, recipe generation, and a richer event-planning ontology are deliberate follow-ups, not omissions to fill during this plan.
- Before the first official deployment, an operator must create the production R2 bucket, configure the optional custom domain/cache/lifecycle, ensure the deploy token can bind the bucket, and configure the catalog-sync variables and R2-write secret. This implementation only supplies tested code and a runbook; it must not mutate those external resources automatically during review.
