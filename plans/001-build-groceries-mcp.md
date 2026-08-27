# Plan 001: Build the lean authless groceries MCP on R2 and Durable Objects

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer dispatched you and said they maintain the index.
>
> **Worktree prerequisite**: execute only in an isolated worktree whose non-plan source tree is based on commit `4afd9cf`. The current plan is newer than that source baseline. Before dispatch, either create a plan-only handoff commit containing `plans/001-build-groceries-mcp.md` and `plans/README.md`, or copy those two current files into the isolated worktree. Do not implement in the operator's main checkout.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 4afd9cf..HEAD -- package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.node.json SECURITY.md apps/edge/package.json apps/edge/wrangler.jsonc apps/edge/src/worker.ts packages/mcp-adapter/src/index.ts packages/mcp-calendar/src/index.ts CONTRIBUTING.md README.md test/worker.test.ts docs/research/mcp-worker-architecture.md .github/workflows/ci.yml
> ```
>
> Expected at the start: no output. `git status --short` may show only the two copied plan files when the copy-based handoff was used; otherwise it must be clean. If any non-plan file changed after `4afd9cf`, compare its live behavior with "Current state" before proceeding. A semantic mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Source baseline**: commit `4afd9cf`, 2026-08-27; current plan supplied separately or in a plan-only handoff commit

## Why this matters

Stamppot's primary consumer is an agent such as Hermes, OpenClaw, or Claude. Users want to ask where shampoo is cheapest, turn a birthday plan into real packages and an estimated total, and optionally retain a short shopping list without creating an account.

The first release should solve those jobs without also becoming a price-history product, notification system, deployment framework, or general database. Current catalog artifacts live in a private R2 bucket and are read through one Worker binding. Each saved list is one bounded document in one SQLite-backed Durable Object addressed by an unguessable bearer capability. There is no D1, public R2 custom domain, Tiered Cache, price history, watch subsystem, server-side AI, OAuth, or provisioning wizard in this plan.

## Product and architecture decisions

These are part of the v1 contract. Do not silently add a deferred subsystem while implementing.

### User job

- The calling agent owns conversational reasoning: turning “a birthday for 16 adults and 6 children” into concrete grocery lines and quantities, asking follow-up questions, and presenting trade-offs.
- Stamppot owns Dutch grocery retrieval: matching those lines to real packages, distinguishing checkout price from comparable unit value, rounding package counts, comparing retailer combinations, totaling matched items, and returning unmatched items and assumptions.
- Never represent an unmatched item as €0. A partial quote must expose `pricedLineCount`, `unmatchedLineCount`, and incomplete status.
- A one-shot basket needs no domain identifier or server-side quote. Follow-ups resend the complete returned `replayInput`.
- A saved shopping list is separate application state. The caller must retain and resend its `listKey`; no MCP session, chat, profile, or account is treated as identity.

### Storage and deployment

| Concern | V1 choice | Reason |
|---|---|---|
| Searchable catalog | Immutable, versioned JSON search shards in private R2 | Cheap daily replacement and bounded reads without database imports |
| Catalog reads | Direct `GROCERIES_CATALOG` R2 binding for hosted, local, and self-hosted use | One topology and no public bucket, custom domain, cache rules, or HTTP adapter |
| Shopping lists | One key/value document in one SQLite-backed Durable Object per `listKey` | Strong per-list consistency with no application SQL schema or migrations |
| Accounts/auth | No accounts or OAuth; random 128-bit bearer `listKey` | Possession grants access to exactly one list and there is no global enumeration |
| Abuse control | Workers Rate Limiting binding before list saves | Approximate protection for the only mutating operation |
| Setup | Checked-in Wrangler config, catalog sync CLI, and copy-paste runbook | Clone-and-run without maintaining a second interactive deployment program |

R2 custom-domain caching and Smart Tiered Cache are deferred until observed R2 read volume or latency justifies a second read path. Do not add `HttpCatalogObjectStore`, `GROCERIES_CATALOG_BASE_URL`, `caches.default`, a public bucket, or cache configuration in v1.

The Cloudflare products are reusable across future MCPs; these concrete resources are not a communal datastore. Keep `stamppot-groceries-catalog` dedicated to the grocery source because its publisher, provenance, retention, and credentials form one boundary. A future MCP gets its own bucket when those differ. Likewise, each stateful domain class gets its own Durable Object binding/namespace; never store another MCP's state inside `ShoppingListObject`. Extract shared code only after a second real consumer, not shared data ownership now.

### Explicitly deferred

- `find_price_drops`, `get_price_history`, price watches, notifications, history artifacts, and temporal deletion logic.
- Caller-selectable `catalogVersion` and exact historical quote replay. Return the current version for provenance, but repeated calls intentionally use the latest published prices.
- Fine-grained list mutations, `lineId`, `watchId`, optimistic revisions, and multi-table list schemas. The caller replaces one complete bounded list document.
- MCP operation annotations and changes to `packages/core`. Self-describing Zod field descriptions remain required.
- A setup wizard, custom-domain/Tiered Cache path, D1, user accounts, server-side LLM calls, recipe generation, and checkout automation.

## Current state

The repository is a pnpm/TypeScript monorepo deployed as one Cloudflare Worker.

- `package.json:8-22` defines the exact gates. `pnpm check` runs content validation, Ultracite, typecheck, tests, and build; `pnpm cf-typegen` generates `CloudflareBindings` from the Wrangler config.
- `pnpm-workspace.yaml:1-3` already includes `packages/*`. Its catalog pins shared dependency versions.
- `CONTRIBUTING.md:5-20` requires a `packages/mcp-<domain>` package, one exported `McpDefinition`, one content Markdown file per operation, explicit source/licence/freshness/error documentation, and deterministic offline tests.
- `packages/mcp-calendar/src/index.ts:13-70` is the operation/MCP exemplar: define operations with `defineOperation`, then group them with `defineMcp`.
- `packages/mcp-adapter/src/index.ts:24-32` already forwards title, description, and Zod schemas. Lines 64-68 use `legacy: "reject"`; changing that option to `legacy: "stateless"` enables ordinary 2025 Streamable HTTP clients without transport sessions or deprecated standalone SSE. The callback currently returns raw `Error.message` text, and MCP POST bodies do not yet use the repository's 64 KiB application bound; both must be hardened before publishing more authless tools.
- `apps/edge/src/worker.ts:14-30` constructs an immutable module-scope registry and separate combined/domain MCP handlers. Lines 91-168 route MCP, plain HTTP, health, sitemap, tool pages, and landing output.
- `apps/edge/wrangler.jsonc:1-13` currently has no storage or rate-limit bindings. It uses compatibility date `2026-08-27`, `nodejs_compat`, assets, and observability.
- `vitest.config.ts:6-12` runs tests inside the Workers runtime against `apps/edge/wrangler.jsonc`; `test/worker.test.ts` is the route/MCP exemplar and `test/env.d.ts` already extends generated `CloudflareBindings`.
- `tsconfig.node.json` currently includes build and test configuration files but excludes `scripts/**/*.ts`, so the new sync CLI would otherwise escape the normal typecheck gate.
- `SECURITY.md` currently describes every hosted MCP as read-only. It must distinguish authless catalog reads from the one bounded, capability-authorized shopping-list write without implying an account or global identity.
- `docs/research/mcp-worker-architecture.md` currently says future state should use an authenticated handle. The groceries decision must narrow that statement: public reads remain authless, while a random list capability authorizes one anonymous document.
- Landing and tool pages are generated from the operation registry and content files. Do not edit `apps/edge/src/landing/**` or `DESIGN.md`.

Important existing shapes:

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

Do not add catalog or state fields to `OperationContext`. Build `createGroceriesMcp(dependencies)` and close over narrow interfaces so tests inject in-memory fakes and the Worker injects Cloudflare bindings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install/update lockfile | `pnpm install` | exit 0; lockfile changes only for declared workspace/dependency changes |
| Generate bindings | `pnpm cf-typegen` | exit 0; generated types include R2, Durable Object, and rate-limit bindings |
| Focused tests | `pnpm exec vitest run test/mcp-adapter.test.ts test/groceries-catalog.test.ts test/groceries-basket.test.ts test/groceries-state.test.ts test/groceries-worker.test.ts test/groceries-sync.test.ts` | all six files pass |
| Content contract | `pnpm check:mcp-content` | validates exactly four grocery content files |
| Format | `pnpm dlx ultracite fix` | exit 0; keep only in-scope formatting changes |
| Full gate | `pnpm check` | exit 0; content, lint, typecheck, all tests, and build pass |
| Deploy shape | `pnpm exec wrangler deploy --config dist/stamppot/wrangler.json --dry-run` | exit 0; no remote deployment |
| Frozen install | `pnpm install --frozen-lockfile` | exit 0 after lockfile update |

Do not run `pnpm deploy`, remote catalog sync, R2 creation, GitHub mutation, or any other remote provisioning command as verification.

## Suggested executor toolkit

If available, use:

- `cloudflare` for current R2, binding, and platform behavior.
- `workers-best-practices` for binding types, global-scope safety, fetch behavior, and Web Crypto.
- `durable-objects` for SQLite-backed key/value storage, RPC, alarms, and isolated tests.
- `wrangler` for exact R2 and deployment commands in the runbook.

Primary references:

- [R2 Workers binding](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [R2 data location and EU jurisdiction](https://developers.cloudflare.com/r2/reference/data-location/)
- [Durable Objects rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [MCP tool schemas and structured content](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [Hermes MCP CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands/)
- [OpenClaw MCP CLI reference](https://docs.openclaw.ai/cli/mcp)
- [Claude remote custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- `node_modules/agents/docs/mcp-servers.md` for the installed Agents SDK's stateless 2025 lane.

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
- `packages/mcp-groceries/content/find_grocery_options.md`
- `packages/mcp-groceries/content/plan_grocery_basket.md`
- `packages/mcp-groceries/content/get_shopping_list.md`
- `packages/mcp-groceries/content/save_shopping_list.md`
- `packages/mcp-groceries/fixtures/checkjebon-small.json`
- `scripts/groceries-catalog.ts`
- `test/mcp-adapter.test.ts`
- `test/groceries-catalog.test.ts`
- `test/groceries-basket.test.ts`
- `test/groceries-state.test.ts`
- `test/groceries-worker.test.ts`
- `test/groceries-sync.test.ts`
- `packages/mcp-adapter/src/index.ts`
- `apps/edge/src/worker.ts`
- `apps/edge/package.json`
- `apps/edge/wrangler.jsonc`
- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `tsconfig.node.json`
- `SECURITY.md`
- `README.md`
- `docs/research/mcp-worker-architecture.md`
- `docs/decisions/groceries.md`
- `docs/runbooks/groceries-self-hosting.md`
- `.github/workflows/groceries-catalog-sync.yml`
- one new `.changeset/*.md` created by `pnpm changeset`
- `plans/001-build-groceries-mcp.md` only as the pre-implementation handoff copy when that worktree method is used; do not edit it during implementation
- `plans/README.md` for the final status update only

**Out of scope** (do not touch):

- `packages/core/**`, `test/core.test.ts`, and operation annotations.
- `packages/http-adapter/**`.
- Every file under `packages/mcp-adapter/**` except `packages/mcp-adapter/src/index.ts`; that file may change only for stateless legacy compatibility, the 64 KiB parsed-body boundary, and generic non-secret tool-failure text.
- `apps/edge/src/landing/**`, `apps/edge/src/landing/styles.css`, and `DESIGN.md`.
- `.github/workflows/ci.yml`; provisioning the official bucket or widening the production token is an operator task, not an implementation task.
- D1; public R2 access; custom domains; Cache Rules; Smart Tiered Cache; Workers Cache API; or a second catalog read adapter.
- Price history, price drops, watches, notifications, offer/history/drop artifacts, caller-pinned historical versions, and stored quote objects.
- Fine-grained list mutation commands, persisted line IDs, revisions, multi-row list schemas, or automatic list recovery.
- User accounts, OAuth, consumer API keys, email, Turnstile, webhooks, background work other than one expiry alarm per list, or server-side AI.
- Recipe generation, location/inventory guarantees, medical/dietary recommendations, and checkout automation.
- A provisioning/setup wizard or any script that creates buckets, edits Wrangler config, deploys, or writes GitHub settings.
- Committing generated `worker-configuration.d.ts`, `dist/**`, `.wrangler/**`, built catalog artifacts, or fetched production snapshots.
- Creating Cloudflare resources, GitHub secrets/variables, deploying, pushing, or opening a PR without separate operator authority.

## Git workflow

- Work only in an isolated worktree whose non-plan source tree matches `4afd9cf`. Supply the current plan through a plan-only handoff commit or copy the two plan files before implementation; in the latter case, the only allowed initial status entries are those two files.
- Suggested branch: `feat/groceries-mcp`.
- The only existing commit is `Initial commit`; use small logical commits with clear imperative subjects if the operator requests commits. Otherwise leave changes uncommitted for review.
- Never push or open a PR unless explicitly instructed.

## Public MCP contract

Create exactly four grocery operations.

### 1. `find_grocery_options`

Input: `query` (2-120 characters after trimming), `retailerSlugs` (0-12 unique slugs, default `[]` meaning all retailers), and `limit` (integer 1-20, default 10). Each retailer slug is 1-40 lowercase ASCII letters, digits, or hyphens; reject duplicates. A syntactically valid slug absent from the current catalog yields no matches for that filter and must never silently widen the search. Do not add a sort-mode mini-language.

On `status: "ok"`, output relevance-ranked matched offers with stable `offerId`, retailer name/slug, product name, package text, integer `priceCents`, `currency: "EUR"`, product URL, parsed base quantity/unit when known, comparable unit price when known, match confidence/reason, and source/freshness metadata. Break deterministic relevance ties with checkout price and then `offerId`.

Also return `cheapestUpfrontOfferId` and `bestUnitValueOfferIds` with optional `mass`, `volume`, and `each` winners computed across the full bounded candidate set before applying `limit`. Normalize returned unit values to integer cents per kilogram, litre, or item. Compare rankings as exact integer ratios and round only the displayed cents value; never compare across dimensions or include unknown/package quantities in unit-value winners. The upfront and relevant unit-value winner may differ.

### 2. `plan_grocery_basket`

This operation is stateless, read-only, and safe to invoke repeatedly. It has no quote ID.

Input: 1-20 ordered lines. Each has `query` (2-120 characters after trimming), optional target `{ value, unit: "g" | "kg" | "ml" | "l" | "each" | "package" }`, and optional `optional` boolean defaulting to `false`. Quantity values must be finite and positive; after conversion a mass or volume target is at most 1,000,000 g or ml, and `each`/`package` is an integer at most 10,000. The outer input accepts `budgetCents` (safe integer 0-100,000,000; no default), `retailerSlugs` with the same rules and default as search, and `maxStores` (integer 1-3, default 3). It does not accept `catalogVersion` or a line ID. Preserve order and correlate every selection, unmatched line, exclusion, and assumption with a one-based `lineNumber` and original query.

If target is omitted, price one sale package. Convert `kg` and `l` to `g` and `ml`; `each` and `package` require positive integers. `package` means a count of sale packages and does not require a parsed quantity. A matched optional line is priced; an unmatched optional line is reported but does not make the quote incomplete. Budget is comparative metadata and never silently removes a line.

Resolve the current manifest exactly once at call start. On `status: "ok"`, output top-level `catalogVersion`, `quotedAt`, and `replayInput`, plus `bestSingleStore` and `cheapestWithinStoreLimit` when possible. `replayInput` is complete and schema-valid: it uses trimmed queries, `target: { value: 1, unit: "package" }` when target was omitted, explicit `optional: false`, explicit `retailerSlugs: []`, and explicit `maxStores: 3`; it omits `budgetCents` only when the caller supplied no budget because absence is not a defaulted value. It deliberately contains no catalog version. An agent can resend it verbatim or change one field. If the catalog advanced, the repeated result may change; that is desired because grocery questions should use current prices.

Each plan includes selected packages, package counts calculated with `ceil(targetBaseQuantity / packageBaseQuantity)`, line totals, retailer totals, integer `pricedTotalCents`, budget delta, package-rounding assumptions, unmatched lines, and source freshness. Enumerate retailer combinations only across the bounded 12 retailers and maximum three stores. Never silently drop or zero-price an item.

Choose plans lexicographically: maximize matched required lines, then matched optional lines, then minimize `pricedTotalCents`, then minimize store count, then break ties by sorted retailer slugs and `offerId`. Within one retailer and line, select the compatible offer with the lowest package-rounded line total; break ties by least excess quantity, checkout price, then `offerId`. An offer with unknown quantity can satisfy only an omitted target or a `package` target, never a mass, volume, or each target. Report globally unmatched lines separately from lines unavailable in a particular store combination so a cheaper partial basket never masquerades as a complete winner.

The MCP description must tell agents to decompose an occasion into at most 20 concrete lines, then call this tool. For follow-ups it must tell them to resend the complete returned `replayInput`. Add the exact deterministic birthday oracle in Step 4 for 16 adults and 6 children.

### 3. `get_shopping_list`

Input: one `listKey` matching the exact capability format below. On `status: "ok"`, output the same key, `savedAt`, `expiresAt`, and the complete stored document. The document contains optional `title` (1-100 characters after trimming), optional `budgetCents` with the basket cap, and 0-20 ordered lines using the same query/target/optional caps plus `checked` (default `false`). The canonical returned document fills the target/boolean defaults described above and must serialize to at most 16 KiB of UTF-8 JSON. It contains no quote, offer selection, revision, persisted line ID, note, or watch.

This operation reads only the Durable Object. It must not access R2 or call the planner. Its description tells the agent to pass the desired unchecked or complete lines to `plan_grocery_basket` when the user asks for current prices. Reads do not extend expiry.

### 4. `save_shopping_list`

Input: optional `listKey` plus one complete replacement document in the same bounded shape returned by `get_shopping_list`. Omit `listKey` to create a list and generate one server-side; supply it to replace that list's entire document. On `status: "ok"`, output `listKey`, `savedAt`, `expiresAt`, and the canonical stored document.

There is deliberately no mutation array, `lineId`, revision, merge behavior, or partial update. The tool description must tell the agent to call `get_shopping_list` before changing an existing list, preserve every line the user wants, edit the document, and resend the whole document. Concurrent callers use last-write-wins. This is an explicit v1 trade-off for a personal list capped at 20 lines.

Creation is not idempotent: losing a create response and retrying without its `listKey` may create an unreachable second list. The server cannot recover a lost key or infer which list belongs to an MCP connection, conversation, Claude account, Hermes profile, or OpenClaw session.

### Shared contract rules

- Every output includes compact provenance where catalog data is involved: source name, source URL, licence, current catalog version, and `observedAt`.
- Package docs and tool content state that prices are indicative snapshots, may differ by location or checkout time, and do not guarantee inventory.
- Every input property, including nested basket/list lines and quantity/filter fields, uses Zod `.describe(...)` text explaining meaning, units, and omission/default behavior. Tool clients primarily see `tools/list`; content pages are not a substitute.
- Do not add MCP annotation plumbing to core. Make mutating/read-only behavior explicit in tool titles and descriptions.
- All schemas use `.strict()`. Canonicalization trims outer whitespace but does not invent synonyms in saved state; search normalization and the reviewed alias map apply only during catalog matching.

Expected domain failures are schema-conforming tool results, not thrown exceptions, so Hermes, OpenClaw, Claude, and the plain HTTP routes see the same stable shape:

| Condition | Tool result | HTTP/MCP behavior |
|---|---|---|
| Success, including zero search matches | `status: "ok"`; search may contain an empty `offers` array | HTTP 200 and MCP structured content |
| Catalog manifest/object missing or corrupt | `status: "catalog_unavailable"`, `retryable: true` | HTTP 200 and MCP structured content; no object key or parser detail |
| Validly shaped but missing/expired list capability | `status: "unknown_list"`, `retryable: false` | HTTP 200 and MCP structured content; never echo the key |
| Save rejected by the abuse brake | `status: "rate_limited"`, `retryable: true`, `retryAfterSeconds: 60` | HTTP 200 and MCP structured content |
| Invalid JSON/schema or body over 64 KiB | No domain result | Existing transport error; stable 400/413 on plain HTTP and a non-secret MCP protocol/tool error |
| Unexpected programming/platform failure | No domain result | Existing generic HTTP `internal_error`; MCP returns only `Error: Tool invocation failed` and never raw `Error.message` |

Every operation output schema includes its allowed top-level `status` values. Because core requires a top-level `ZodObject`, success-only fields are optional in the JSON Schema; operation code and tests enforce that they are present for `status: "ok"` and absent for failure statuses. Test every row through the relevant direct operation plus MCP/HTTP boundary; do not leak capabilities, R2 object keys, source payload fragments, stack traces, or exception messages.

At each grocery operation's dependency boundary, translate expected catalog/list/limiter failures to the domain statuses above. Catch any other dependency failure and throw a fresh generic error without copying its message, cause, input, key, or object path. This keeps the existing plain HTTP adapter's response and structured error log generic without expanding this feature into a shared HTTP-adapter rewrite.

### Identifier contract

| Name | Owner and format | Use |
|---|---|---|
| `lineNumber` | Server response; integer 1-20 | Correlates a basket result with ordered input. It is not sent back as an ID. |
| `catalogVersion` | Server-owned opaque timestamp/hash string, output only | Provenance for the current snapshot. Callers do not parse or request it. |
| `offerId` | `off_` plus unpadded base64url of SHA-256 over `v1\0{retailerSlug}\0{canonicalSourcePath}` | Stable opaque correlation value while the source path remains stable; no v1 tool accepts it as input. |
| `listKey` | `lst_` plus 22 unpadded base64url characters encoding 16 random bytes | Bearer capability for exactly one list; opaque, case-sensitive, and unrecoverable. |

JSON-RPC request IDs are protocol details and never become grocery-domain identifiers.

## Catalog artifact contract

Use this logical layout. The manifest is the sole mutable pointer and is published last:

```text
catalog/manifest.json
catalog/versions/{version}/index/000.json ... 127.json
```

- `version` is an observed UTC timestamp plus a short SHA-256 of normalized source data.
- `manifest.json` contains `formatVersion`, `currentVersion`, `observedAt`, source, licence, `shardCount: 128`, offer/retailer counts, and integrity hashes for all 128 referenced shards. There is no separate retailer metadata object because every index record already carries all retailer fields needed at runtime.
- Versioned keys are immutable. Validate and upload all version objects before atomically replacing the manifest. A failed build/upload leaves the prior manifest live.
- V1 never deletes version objects and configures no bucket lifecycle rule. At the measured ~38.4 MB daily artifact size this adds roughly 14 GB in one year, about $0.21/month at the current R2 storage rate at year end. That bounded initial cost is preferable to adding an S3 listing dependency, a cleanup endpoint, broader credentials, or risking deletion of a live/in-flight snapshot. Retained objects are internal implementation debris, not a public historical lookup guarantee; add protected cleanup only after measured storage warrants it.
- The bucket remains private. Never place list state, capabilities, logs, secrets, or unrelated MCP data in it.
- Fetch `https://www.checkjebon.nl/data/supermarkets.json`; document `https://github.com/supermarkt/checkjebon` and its MIT licence. Strictly validate retailer `{ n, c, u, i, d }` and product `{ n, l, p, s }`; reject malformed or empty input before publication. Map retailer `n` to slug, `c` to display name, `u` to product-URL base, `i` to source logo URL, and `d` to products. Map product `n` to name, `l` to canonical relative source path, `p` to numeric euro price, and `s` to package text. Build the product URL from `u + l`, and convert `p` to safe integer cents with a tested decimal-rounding helper rather than carrying floating-point euros into operations.
- Derive deterministic offer IDs from retailer and canonical source path; never use array positions.

Normalize search text with Unicode NFKD, diacritic removal, lowercase, punctuation-to-space, and collapsed whitespace. Maintain a small reviewed English-Dutch grocery alias map in `aliases.ts`; never call an LLM. Parse common package strings including Dutch decimal commas, `6 x 0,33 l`, `800 g`, `20 stuks`, and `per stuk/pakket` into `g`, `ml`, `each`, or `unknown`.

Index each offer summary under the first three characters of each unique normalized token, or the whole token when it has two characters. Hash that prefix with documented stable 32-bit FNV-1a into 128 physical shards. Normalize reviewed aliases before choosing one longest token as the query anchor, read exactly that one index shard, filter candidates against all normalized query tokens, and rank deterministically. Each index record contains every field required by search and basket output; there are no separate offer, history, drop, or metadata objects.

Expose narrow seams:

```ts
interface CatalogObjectStore {
  getJson(key: string, signal?: AbortSignal): Promise<unknown>;
}

interface GroceryCatalog {
  search(...): Promise<...>;
  planBasket(...): Promise<...>;
}

interface ShoppingListService {
  get(listKey: string): Promise<...>;
  create(listKey: string, document: ShoppingListDocument): Promise<...>;
  replace(listKey: string, document: ShoppingListDocument): Promise<...>;
}
```

Implement `MemoryCatalogObjectStore` for tests and `R2CatalogObjectStore` for every deployed mode. Do not introduce a generic storage package or HTTP catalog adapter.

## Durable Object contract

Use one `ShoppingListObject` per valid capability with `env.SHOPPING_LISTS.getByName(listKey)`. Configure the class with `new_sqlite_classes`, extend `DurableObject<CloudflareBindings>`, and expose RPC methods only.

Store one validated envelope under the constant storage key `shopping-list` using the Durable Object storage `get`, `put`, and `delete` APIs. The envelope is `{ document, savedAt, expiresAt }`; `document` is exactly the public bounded list schema. On a SQLite-backed Durable Object these key/value methods use Cloudflare's hidden SQLite storage, so do not create an application table, SQL schema, schema migration, child row, index, or constructor initializer.

Expose separate `create` and `replace` RPC methods even though the public tool is named `save_shopping_list`. `create` requires the storage key to be absent; `replace` requires it to exist and be unexpired. Supplying a validly formatted but unknown/expired `listKey` to the public save operation returns the same stable unknown-list error as get; only omitting the key creates state. Durable Object storage input gates serialize the read/write sequence. Last-write-wins applies to two valid replacements; there is no revision check.

After a successful create or replacement, set one alarm for 90 days after `savedAt`. A save extends expiry; a read does not. `get` checks `expiresAt` and treats an expired document as unknown even if its alarm was delayed, deleting the one storage key as cleanup. `alarm()` idempotently deletes the `shopping-list` key and the alarm. Do not call `deleteAll`, add per-line alarms, or schedule repeating work.

Generate new list keys from 16 bytes of `crypto.getRandomValues`, base64url without padding, prefixed with `lst_`. Validate the fixed format before obtaining a DO stub. Return the key only in successful list results, never in errors or Stamppot-controlled logs. There is no list enumeration or client/chat mapping.

Before `save_shopping_list`, call one `SHOPPING_LIST_WRITES` Rate Limiting binding configured for 30 saves per 60 seconds. For an existing list, derive a SHA-256 base64url limiter key from `listKey` plus a constant namespace. For creation, derive it from `CF-Connecting-IP` plus a different constant because no stable user identifier exists yet; use one fixed anonymous fallback only in local/test environments where that header is absent. Never log either key or its source. Document that IP-based creation limiting can group users behind Claude or another proxy and that Cloudflare's limiter is approximate and per location; it is an abuse brake, not authorization or accounting.

## Steps

### Step 1: Record the reduced architecture decision

Create `docs/decisions/groceries.md`. Record the four-tool scope, direct private R2 binding, immutable current catalog with no v1 deletion/lifecycle machinery, one-document list capability, last-write-wins replacement, 90-day expiry, rate-limit limitations, resource-ownership boundary, and the explicit deferrals listed above. Include the measured source/artifact rationale from the previous investigation: roughly 105,000 offers and a 128-shard prototype around 38.4 MB uncompressed, with approximately 300 KB average and 764 KB maximum shards. State the roughly 14 GB/year retention trade-off and current-price-only public contract.

Update only the stale current-state and state/auth paragraphs in `docs/research/mcp-worker-architecture.md`: record the already-shipped `responseMode: "auto"`, the planned stateless legacy lane and 64 KiB MCP ingress, and that MCP remains stateless while anonymous application state may use a bearer capability without an account. Possession authorizes one document. State plainly that the capability appears in tool arguments/results and may be retained by third-party clients under their own policies, while Stamppot never places it in URLs, R2, logs, analytics, or errors.

Update `SECURITY.md` so the hosted posture is “authless and bounded,” not universally read-only: catalog/search/planning remain read-only; the only mutation is a whole-document list save authorized by an unguessable capability, capped and rate-limited. Keep the existing private-reporting and secret-handling guidance. Do not describe `listKey` as authentication to an account.

**Verify**: `rg -n "four|R2|Durable Object|capability|last-write-wins|deferred|D1|Tiered Cache|authless|64 KiB" docs/decisions/groceries.md docs/research/mcp-worker-architecture.md SECURITY.md` → the documents contain the selected topology, ingress boundary, and limitations; no document claims price alerts or CDN caching ship in v1.

### Step 2: Harden authless MCP ingress, enable stateless clients, and scaffold four tools

In `packages/mcp-adapter/src/index.ts`, change `legacy: "reject"` to `legacy: "stateless"` and keep `responseMode: "auto"`. Add one 64 KiB JSON-body limit for MCP POST requests. Before reading the body, apply the installed MCP server package's exported Host/Origin validation helpers with the same localhost/workers.dev/custom-domain defaults already used by the Agents wrapper; then parse once and call the returned handler's `.fetch(request, { parsedBody })` path, which repeats its own policy checks and avoids rereading the body. Stamppot is authless, so there is no verified OAuth execution context to preserve through the callable-only path. Keep OPTIONS and non-POST behavior delegated to the handler. Return JSON-RPC parse error `-32700` with HTTP 400 for malformed JSON and a stable JSON-RPC error with HTTP 413 for a body over the limit; both use `id: null` and echo no body content. In the tool callback catch, replace raw exception text with exactly `Error: Tool invocation failed`. Do not log the raw exception or input here, and do not add sessions, annotation plumbing, a transport Durable Object, Hono, or deprecated standalone SSE.

Create `test/mcp-adapter.test.ts` to drive fresh current-2026 and stateless-2025 request sequences. Each lane lists tools and calls a read operation twice without an MCP session ID. Also assert that nested `.describe()` text reaches `tools/list`, an oversized declared or streamed body is rejected at 64 KiB, malformed JSON is stable, an invalid Origin wins before parsing, and an operation throwing a secret sentinel returns only the generic failure text. These are transport/descriptor tests, not live third-party-client tests.

Create `packages/mcp-groceries/package.json` matching `packages/mcp-calendar/package.json`: private ESM package at `0.1.0`, `.` export for `src/index.ts`, and explicit `./cloudflare` and `./catalog-build` exports. The Cloudflare entry re-exports the R2 adapter, list service/limiter adapters, and `ShoppingListObject`; the root entry remains transport/platform-neutral. Depend only on `@stamppot/core`, `zod`, and Worker platform APIs. Add it as a workspace dependency of `apps/edge` and root dev dependency for tests.

In `contracts.ts` and `catalog-format.ts`, define Zod schemas and inferred types for the four tool contracts, manifest/shards, offers, quantities, and the one shopping-list document. Use integer cents; reject negative/unsafe values, arrays beyond documented caps, retailer filters over 12, and unknown units. Export named constants for all caps and `CATALOG_FORMAT_VERSION`.

In `operations.ts`, create exactly four inline `defineOperation({ ... })` calls with their final literal names, schemas, descriptions, and dependency-delegating execute functions. Define the narrow `GroceryCatalog`, `ShoppingListService`, key generator, and write-limiter contracts they call; these seams can be supplied by deterministic fakes before the R2/DO implementations exist. Do not return placeholder data or throw “not implemented.” In `index.ts`, export `createGroceriesMcp(dependencies)` and its `defineMcp` result. This structure is required now because `check:mcp-content` rejects content without matching inline operation definitions.

Add exactly four content files, following `packages/mcp-calendar/content/get_dutch_time.md`, and a package README. Each content file needs valid YAML frontmatter, one H1, agent-oriented examples, related tool names, source/licence/freshness/error behavior, and `/mcp/groceries`. The README covers the four tools, source, saved-list capability, and self-hosting link.

Add a pinned `tsx` version to the workspace catalog and root dev dependencies so the sync CLI can reuse TypeScript builder code. Add initial schema/normalization tests in `test/groceries-catalog.test.ts` before implementation.

Add `scripts/**/*.ts` to `tsconfig.node.json` so `pnpm typecheck` covers the catalog CLI. Do not create a second script-specific compiler configuration.

**Verify**: `pnpm install && pnpm check:mcp-content && pnpm exec vitest run test/mcp-adapter.test.ts test/groceries-catalog.test.ts` → the lockfile installs, both protocol lanes pass, nested schema descriptions are present, schema tests pass, and exactly four grocery content files validate.

### Step 3: Build current immutable catalog artifacts and sync CLI

Implement pure builder functions in `catalog-build.ts` and format/normalization/package parsing in `catalog-format.ts` and `aliases.ts`. Add a small upstream-shaped fixture at `packages/mcp-groceries/fixtures/checkjebon-small.json` with synthetic names and prices rather than a production snapshot.

Implement `scripts/groceries-catalog.ts` as a `tsx` CLI:

```text
pnpm groceries:sync --local --if-empty
pnpm groceries:sync --remote --bucket <explicit-name> --jurisdiction eu
pnpm groceries:sync --build-only --source <fixture-or-url> --output <directory>
```

Add root scripts `groceries:sync` and `predev`, where `predev` runs local `--if-empty`. The CLI may fetch the documented Checkjebon URL only outside tests. It builds in an OS temporary directory, validates schemas/counts/hashes, and uploads with bounded concurrency by spawning Wrangler with argument arrays and `shell: false`. Never interpolate source URLs, bucket names, keys, or paths into a shell command. Upload version objects first and replace the manifest last. Every successful remote sync publishes a version with its new observation timestamp even when source content is unchanged, keeping freshness truthful. Repeating a build with the same source and injected observation time remains byte-for-byte deterministic. Do not list or delete remote objects.

Keep publishing behind an interface. In `test/groceries-sync.test.ts`, use an in-memory recording publisher to prove deterministic objects for a fixed clock, strict malformed/empty rejection, a new observed version on a later clock even when prices are unchanged, manifest-last ordering, and publication failure leaving the previous manifest live. Assert the publisher has no list/delete cleanup path. There is no price-history read, change-event generation, deletion, or production network access in tests.

**Verify**: `pnpm exec vitest run test/groceries-catalog.test.ts test/groceries-sync.test.ts` → builder, sharding, determinism, validation, and ordering cases pass. Then run `groceries_artifact_dir="$(mktemp -d)" && pnpm groceries:sync --build-only --source packages/mcp-groceries/fixtures/checkjebon-small.json --output "$groceries_artifact_dir"` → exit 0 and print version, object count, offer count, and manifest hash without changing the worktree.

### Step 4: Implement bounded search and basket pricing

Implement `MemoryCatalogObjectStore`, `R2CatalogObjectStore`, and `GroceryCatalog`; place the R2 adapter in `cloudflare.ts`. Check missing/object-size cases before JSON parsing where the runtime API permits, validate every decoded object with artifact schemas, propagate abort signals, and return stable errors for missing or corrupt catalogs. Do not add an HTTP store. A catalog older than 48 hours remains usable but returns `freshness: "stale"`; a newer one returns `freshness: "fresh"`. Do not turn a missed sync into total tool failure.

Complete the catalog-backed behavior delegated by `find_grocery_options` and `plan_grocery_basket`. `createGroceriesMcp({ catalog, shoppingLists, createListKey, writeLimiter })` performs no I/O during construction. Make ranking and tie-breaking deterministic. Resolve one current `CatalogSnapshot` per operation and deduplicate shard reads across a basket. Build `replayInput` from validated input plus explicit defaults; do not include a version, store a quote, or allocate state.

Use this exact party-pricing oracle in the synthetic fixture and basket test; it verifies orchestration and arithmetic, not nutritional or serving advice:

```json
{
  "lines": [
    { "query": "cola", "target": { "value": 12, "unit": "l" } },
    { "query": "crisps", "target": { "value": 2, "unit": "kg" } },
    { "query": "flour", "target": { "value": 1, "unit": "kg" } },
    { "query": "sugar", "target": { "value": 500, "unit": "g" } },
    { "query": "butter", "target": { "value": 500, "unit": "g" } },
    { "query": "eggs", "target": { "value": 12, "unit": "each" } },
    { "query": "paper plates", "target": { "value": 30, "unit": "each" } },
    { "query": "napkins", "target": { "value": 40, "unit": "each" } }
  ],
  "budgetCents": 5000,
  "retailerSlugs": ["ah", "jumbo"],
  "maxStores": 3
}
```

| Line | AH package / price / rounded line | Jumbo package / price / rounded line |
|---|---:|---:|
| cola | 1.5 l / €2.40 / 8 = €19.20 | 2 l / €2.80 / 6 = €16.80 |
| crisps | 250 g / €2.00 / 8 = €16.00 | 300 g / €2.10 / 7 = €14.70 |
| flour | 1 kg / €1.00 / 1 = €1.00 | 1 kg / €1.60 / 1 = €1.60 |
| sugar | 1 kg / €1.40 / 1 = €1.40 | 750 g / €1.10 / 1 = €1.10 |
| butter | 250 g / €2.50 / 2 = €5.00 | 500 g / €4.80 / 1 = €4.80 |
| eggs | 6 each / €2.40 / 2 = €4.80 | 12 each / €4.20 / 1 = €4.20 |
| paper plates | 20 each / €1.50 / 2 = €3.00 | 30 each / €3.50 / 1 = €3.50 |
| napkins | 40 each / €2.20 / 1 = €2.20 | 20 each / €0.90 / 2 = €1.80 |

The fixture contains no other matching offers. Assert `bestSingleStore` is Jumbo at exactly 4,850 cents with 150 cents remaining, while `cheapestWithinStoreLimit` uses Jumbo for six lines and AH for flour and paper plates, totals exactly 4,740 cents across two stores, and has 260 cents remaining. Both plans price all eight required lines and are complete. Assert the selected package counts shown in the table, not just the totals.

In `test/groceries-catalog.test.ts`, cover stable normalization, alias expansion, FNV-1a sharding, offer IDs, decimal commas, multipacks, grams/litres/pieces, unknown packages, shampoo checkout-price versus volume-unit winner, mass/volume/each winner separation, exact-ratio ranking before display rounding, deterministic ties, retailer filters, corrupt/missing data, 48-hour stale-but-usable marking, no results, and exactly one manifest plus one shard read for search.

In `test/groceries-basket.test.ts`, cover no caller IDs, line-number correlation, omitted-target one-package behavior, ceiling arithmetic, one-store versus up-to-three-store results, optional and unmatched lines, partial totals, budget deltas, incompatible units, deterministic ties, maximum input bounds, and the 16-adult/6-child party fixture. Assert no more than one manifest plus 20 unique shard reads. Assert `replayInput` passes the input schema and can be resent after the manifest advances, producing a current-version response without a historical-version error or guarantee of identical prices.

**Verify**: `pnpm exec vitest run test/groceries-catalog.test.ts test/groceries-basket.test.ts` → all named cases pass, including read bounds and the party total.

### Step 5: Add the one-document shopping-list Durable Object

Implement `ShoppingListService` and `ShoppingListObject` in `shopping-list-object.ts` according to the Durable Object contract above. Use RPC methods and one storage key on a SQLite-backed class; write no application SQL. Store schema-validated JSON, no relational child rows, no revision, and no catalog data. Enforce the 20-line, field, quantity, budget, and 16 KiB serialized-document caps inside the object as well as at Zod ingress.

Await every storage operation. A create refuses an existing document; a replacement refuses a missing or expired document; successful writes update timestamps and the single expiry alarm. An expired read deletes the one key and returns the stable unknown-list result; `alarm()` idempotently deletes the key. Do not add `blockConcurrencyWhile`, a constructor migration, `deleteAll`, or authoritative in-memory-only state.

In `operations.ts`, generate new list keys with Web Crypto only when creation is requested, call the limiter before every save, validate capabilities before obtaining a stub, and keep errors capability-free. `get_shopping_list` returns only stored state. `save_shopping_list` replaces it completely and returns the full canonical result.

Test with `cloudflare:test`, `runInDurableObject`, and `runDurableObjectAlarm`: creation/roundtrip, exactly one application storage key, 128-bit key format, replacement semantics, rejection of replacement through unknown/expired keys, empty and 20-line documents, schema caps, isolation, last-write-wins, reads not extending expiry, saves extending expiry, delayed-alarm expired reads, idempotent alarm deletion, stable unknown-capability errors, and rate-limit failures. Open a fresh MCP request sequence and retrieve using only the returned `listKey`.

**Verify**: `pnpm cf-typegen && pnpm exec vitest run test/groceries-state.test.ts` → generated types include `SHOPPING_LISTS` and `SHOPPING_LIST_WRITES`; all one-document, expiry, isolation, and limiter cases pass.

### Step 6: Wire Cloudflare bindings and public routes

Update `apps/edge/wrangler.jsonc` with:

- private R2 binding `GROCERIES_CATALOG` with `bucket_name: "stamppot-groceries-catalog"` and `jurisdiction: "eu"`; bucket names are account-scoped, so another Cloudflare account can create the same checked-in name;
- Durable Object binding `SHOPPING_LISTS` for exported class `ShoppingListObject`;
- migration tag `v1` with `new_sqlite_classes: ["ShoppingListObject"]`;
- `SHOPPING_LIST_WRITES` rate-limit binding with `namespace_id: "1763268921"`, limit 30, and period 60. Namespace IDs are account-wide positive integers; this checked-in project value needs no separate resource creation, but a self-hoster must replace it if their account already uses it. Keep the operation prefixes in runtime keys so counters cannot accidentally overlap.

Use only generated `CloudflareBindings`; never hand-write an environment interface. In `apps/edge/src/worker.ts`, import the platform adapters and `ShoppingListObject` from `@stamppot/mcp-groceries/cloudflare`, construct dependencies lazily from `cloudflare:workers` bindings without I/O, re-export the class for Wrangler, add groceries to the combined registry, and add `/mcp/groceries`. Keep `/mcp`, `/v1/tools/*`, sitemap, landing, and generated tool pages on existing shared paths. Do not log tool inputs/outputs or list capabilities.

Add `test/groceries-worker.test.ts` to prove:

- `/mcp/groceries` lists exactly four tools and `/mcp` lists calendar plus groceries;
- `tools/list` exposes complete nested field descriptions;
- planner calls return schema-conforming `structuredContent` plus serialized text, including unpinned `replayInput`;
- plain HTTP search and planner routes return fixture-backed results;
- two planner calls work in fresh 2025 and 2026 stateless sequences without caller IDs;
- list create/save/get works across fresh sequences using the returned `listKey` and get performs no R2 read;
- invalid input, unknown capability, corrupt/missing catalog, and rate limit use stable non-secret errors, while stale catalog data remains usable and visibly marked;
- injected dependency failures containing a secret sentinel expose it in neither HTTP/MCP responses nor captured Stamppot-controlled logs;
- generated landing Markdown/HTML, tool pages, and sitemap include four grocery tools without edits under `apps/edge/src/landing/**`.

Tests use local R2/DO bindings and deterministic fixture publication; they never fetch the production source.

**Verify**: `pnpm exec vitest run test/groceries-worker.test.ts test/worker.test.ts` → new and existing route tests pass. `git diff --name-only -- apps/edge/src/landing DESIGN.md` → no output.

### Step 7: Document clone-and-run, schedule sync, and release

Write `docs/runbooks/groceries-self-hosting.md` with copy-paste paths only; do not create a setup script.

1. **Local development**: clone, `pnpm install`, `pnpm dev`. Explain that `predev` populates local R2 only when empty and that normal tests use fixtures.
2. **Self-hosted Cloudflare**: authenticate with Wrangler, create the checked-in bucket name in the `eu` jurisdiction, run the remote catalog sync, build, and deploy the Worker so its Durable Object migration applies. State which commands mutate remote state and require operator confirmation. Explain how to choose a different Worker/bucket name and how to replace the rate-limit namespace integer if it collides in that Cloudflare account; these are the only checked-in identity fields a typical clone may need to edit.
3. **Official operation**: create the same private bucket before merging/deploying, provide a token with Cloudflare's bucket-scoped `Workers R2 Storage Bucket Item Write` permission plus the account variable used by catalog sync, and ensure the existing deployment token can bind the bucket and deploy the Durable Object migration. No delete/list implementation, lifecycle rule, custom domain, or public access is involved.

Add `.github/workflows/groceries-catalog-sync.yml` with daily schedule and manual dispatch. Install with the frozen lockfile and run the remote sync using account ID/bucket settings from GitHub variables and an R2-write-scoped token from a secret. Give it only `contents: read` and prevent overlapping publishes. Do not alter `.github/workflows/ci.yml` or add literal credentials.

Update the root README with `/mcp/groceries`, four tools, the source, and Hermes/OpenClaw/Claude usage. Include a birthday example that calls the planner without an ID and refines by resending `replayInput`; say results may refresh when prices change. Separately show create/get/save list calls and state that clients/users must retain `listKey`, call get before full replacement, and cannot recover it after context loss.

Add a manual post-deployment checklist with commands/UI checked against the linked official client documentation on 2026-08-27. Use `<MCP_URL>` as the full `/mcp/groceries` endpoint:

- Hermes: `hermes mcp add stamppot --url <MCP_URL>`, then `hermes mcp test stamppot` and `/reload-mcp` in an existing chat if needed.
- OpenClaw: `openclaw mcp set stamppot '{"url":"<MCP_URL>","transport":"streamable-http"}'`, then `openclaw mcp doctor stamppot --probe`.
- Claude: under Customize → Connectors, add a custom connector with `<MCP_URL>` and enable it for the conversation; note that Anthropic's cloud, not Claude Desktop's machine, originates the request.

For each client, ask “Where is 500 ml shampoo cheapest, and which offer has the best price per litre?”, then the 16-adult/6-child party prompt, then a refinement that resends the tool's complete `replayInput`. Create a two-line shopping list, copy the returned `listKey` outside the chat, start a fresh conversation/session, and retrieve it by explicitly supplying that key. Record pass/fail and client version; this checklist is operator-owned post-deployment evidence, not an offline implementation gate.

Do not claim any client automatically retains a list key across a new conversation.

Run `pnpm changeset` and select `@stamppot/mcp-adapter`, `@stamppot/mcp-groceries`, and `@stamppot/edge` for minor bumps. The user-facing summary says Stamppot enables stateless 2025 MCP compatibility and adds an authless Dutch grocery MCP with current-price search, replayable event/basket costing, and capability-held whole-document shopping lists. Do not select core or unrelated packages.

**Verify**:

```bash
rg -n "R2|Durable Object|listKey|replayInput|mcp/groceries|Claude Desktop|Tiered Cache|price history" README.md docs/runbooks/groceries-self-hosting.md docs/decisions/groceries.md
pnpm dlx ultracite fix
pnpm check
pnpm install --frozen-lockfile
pnpm exec wrangler deploy --config dist/stamppot/wrangler.json --dry-run
git status --short
```

Expected: docs distinguish shipped and deferred behavior; all commands exit 0; Wrangler performs only a dry run; status contains only in-scope files, one non-empty changeset, and the plan status update. No generated bindings, catalog builds, upstream snapshots, `dist`, `.wrangler`, secrets, or unrelated formatting changes are present.

## Test plan

Use `test/calendar.test.ts` for direct operation style and `test/worker.test.ts` for Worker/MCP routes. All fixtures are deterministic and all normal tests are offline.

- `test/mcp-adapter.test.ts`: current 2026 and stateless 2025 sequences can list/call twice without a session; nested schema descriptions survive; 64 KiB, invalid-JSON, Origin-ordering, and generic-error boundaries hold.
- `test/groceries-catalog.test.ts`: schemas, normalization/aliases, stable sharding/offer IDs, package parsing, current search ranking, checkout versus unit value, incompatible units, provenance, corrupt/missing objects, stale-but-usable marking, and read bounds.
- `test/groceries-basket.test.ts`: no IDs, line correlation, unpinned replay, current-version refresh, package rounding, retailer combinations, budget, optional/unmatched lines, honest partial totals, limits, and birthday fixture.
- `test/groceries-sync.test.ts`: strict source validation, deterministic manifest-plus-shards layout for a fixed clock, later-observation refresh, manifest-last publication, and failure safety; no history or deletion logic.
- `test/groceries-state.test.ts`: capability format, whole-document create/get/replace, no persisted line IDs/revisions, isolation, caps, last-write-wins, expiry alarm, fresh-sequence retrieval, and rate limiting.
- `test/groceries-worker.test.ts`: four-tool domain MCP, combined MCP, self-describing schemas, 2025/2026 repeat calls, HTTP routes, stable errors, R2/DO integration, generated pages, and sitemap.
- Existing `test/worker.test.ts` and the complete suite remain green.

Focused verification:

```bash
pnpm exec vitest run test/mcp-adapter.test.ts test/groceries-catalog.test.ts test/groceries-basket.test.ts test/groceries-state.test.ts test/groceries-worker.test.ts test/groceries-sync.test.ts
```

Expected: all six files pass without live network or remote Cloudflare access.

## Done criteria

- [ ] Execution occurred in an isolated worktree whose non-plan source tree matched `4afd9cf` after the documented current-plan handoff.
- [ ] Exactly four grocery operations are exported at `/mcp/groceries`, combined `/mcp`, and `/v1/tools/*`.
- [ ] No price-history, price-drop, watch, notification, annotation, D1, public R2, custom-domain/cache, or setup-wizard code was added.
- [ ] Search distinguishes checkout price from unit value and never compares incompatible units.
- [ ] Basket planning requires no domain ID, prices the birthday fixture, exposes assumptions, and never treats unmatched items as free.
- [ ] Every basket returns a schema-valid, unpinned `replayInput` plus output-only current catalog version/freshness.
- [ ] Current 2026 and stateless 2025 request sequences can repeatedly call tools without protocol sessions.
- [ ] MCP POST bodies are bounded at 64 KiB and unexpected tool failures cannot expose raw exception text.
- [ ] Catalog artifacts contain only one manifest and 128 immutable search shards; manifest is published last.
- [ ] V1 configures no catalog lifecycle and implements no remote object listing/deletion.
- [ ] Every deployed catalog read uses the private R2 binding; no HTTP catalog adapter or Cache API exists.
- [ ] Lists use a 128-bit bearer `listKey`, one key/value document on a SQLite-backed Durable Object, whole-document replacement, last-write-wins, 90-day save-based expiry, caps, and save rate limiting; there is no application SQL schema.
- [ ] `get_shopping_list` performs no catalog read and saved state is retrievable in a fresh sequence only when the caller supplies `listKey`.
- [ ] Stamppot puts no capability in URLs, logs, analytics, errors, or R2; docs acknowledge tool/client retention.
- [ ] `pnpm check:mcp-content`, the focused test command, `pnpm check`, frozen install, and Wrangler dry-run all exit 0.
- [ ] The manual runbook covers local, self-hosted, and official private-R2 deployment without a provisioning script.
- [ ] One changeset includes only `@stamppot/mcp-adapter`, `@stamppot/mcp-groceries`, and `@stamppot/edge` minor bumps.
- [ ] `git status --short` contains only in-scope files (including the unchanged handoff-copy diff when used) and `plans/README.md` is `DONE`.

## STOP conditions

Stop and report; do not improvise if:

- The isolated worktree has non-plan source drift from `4afd9cf`, or the current plan was not supplied by one of the documented handoff methods.
- Drift changes the registry/adapter/Worker/content conventions described above.
- Checkjebon no longer provides a legally reusable stable dataset with product name, retailer, product path/URL, price, and package text, or its licence/provenance cannot be documented.
- The real catalog cannot keep its largest 128-way index shard below 1 MiB uncompressed or a maximum basket below 21 catalog-object reads. Report measurements before changing shard count or input caps.
- Correct behavior requires price history, a direct offer lookup artifact, a public bucket, a custom domain/cache, D1, accounts, server-side AI, or a caller-pinned historical catalog.
- Cloudflare no longer supports private R2 bindings, SQLite-backed Durable Objects on the intended plan, one expiry alarm per object, or the configured Rate Limiting binding.
- Correct implementation requires changing `OperationContext`, packages/core, the HTTP adapter, MCP transport behavior beyond stateless legacy compatibility plus the 64 KiB/generic-error boundary, landing code/tokens, or `.github/workflows/ci.yml`.
- A list capability would need to appear in a URL, Stamppot-controlled log/analytics/error, or R2. Normal tool arguments/results are the documented exception.
- Wrangler cannot express the R2/DO/rate-limit bindings or generated types without hand-written environment types.
- A focused or full verification fails twice after one reasonable fix attempt.
- Remote resource creation, deployment, GitHub secret mutation, pushing, or PR creation is necessary to continue. Those require separate operator authority.

## Maintenance notes

- Review search false positives, package-unit compatibility, partial-total labeling, subrequest bounds, capability leakage, full-document replacement behavior, alarm cleanup, limiter placement, and manifest-last publication.
- Review the planner as an unfamiliar agent: plain-language call without IDs, one `replayInput` follow-up, then a later call after fixture manifest advancement. A changed current price is valid; a malformed replay is not.
- Review the list as an unfamiliar agent: create, retain key, get in a fresh sequence, modify the returned complete document, and save it. Tool prose cannot compensate for ambiguous schemas.
- The alias map is a reviewed product surface. Add aliases with deterministic tests; do not turn it into fuzzy uncontrolled translation.
- Monitor catalog age, R2 Class B reads, Worker CPU/subrequests, Durable Object requests/storage, rate-limited saves, and corrupt-artifact errors. Log aggregate error codes and catalog versions only, never tool payloads or capabilities.
- Price history/drops/watches should return only when there is demonstrated demand and a real polling/notification consumer. They require a separate data-retention design.
- Add the R2 custom-domain/Tiered Cache path only after measured latency or Class B cost justifies a second adapter and public bucket. Do not add it speculatively.
- Add protected catalog cleanup only when measured retained storage justifies an S3/listing dependency or another bounded operator path. Never use a blind prefix lifecycle that can delete the manifest's live version.
- If concurrent editing becomes real, add an explicit revision contract in a later version; do not smuggle partial mutations into the v1 replacement tool.
- Before the first official merge/deployment, an operator must create the private EU R2 bucket, ensure deployment credentials can bind it, and configure the catalog-sync variables and bucket-scoped secret. The implementation supplies publishing code and a runbook but performs no external mutation or deletion.
