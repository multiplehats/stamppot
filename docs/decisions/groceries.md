# Groceries MCP: lean current-price catalog and capability-held lists

Date: 2026-08-27

## Decision

Stamppot will ship exactly four grocery tools:

- `find_grocery_options` searches a current Dutch grocery snapshot and distinguishes checkout price from comparable unit value.
- `plan_grocery_basket` prices up to 20 concrete lines, rounds quantities to sale packages, compares bounded retailer combinations and returns a complete, unpinned `replayInput` for current-price follow-ups.
- `get_shopping_list` retrieves one anonymous saved-list document when the caller supplies its bearer capability.
- `save_shopping_list` creates or replaces that complete document using last-write-wins semantics.

The calling agent remains responsible for conversational planning, including decomposing an occasion into concrete items and quantities. Stamppot performs deterministic matching, package arithmetic, retailer comparison, totals and explicit unmatched-item reporting. It never treats an unmatched item as free.

## Catalog topology

The searchable catalog is a private, dedicated R2 bucket reached directly through the Worker's `GROCERIES_CATALOG` binding in hosted, local and self-hosted modes. The Worker does not use an R2 public domain, the Workers Cache API, an HTTP catalog adapter or Tiered Cache.

Each publication contains one immutable current-price version with 128 self-contained search shards. Version objects are uploaded and validated before `catalog/manifest.json` is replaced, so the manifest is the only mutable pointer. Public tools return the current catalog version for provenance but do not accept a caller-selected version. Replaying an input intentionally uses the newest published prices.

The previous source investigation measured roughly 105,000 offers. Its 128-shard prototype was about 38.4 MB uncompressed, with approximately 300 KB average and 764 KB maximum shards. A basket reads one manifest and at most one unique shard per input line, keeping the 20-line maximum within 21 catalog-object reads.

V1 does not list or delete retained catalog versions and configures no bucket lifecycle. At about 38.4 MB per daily publication, immutable retention adds roughly 14 GB in a year. That initial trade-off keeps manifest-last publication safe and avoids broader credentials or cleanup machinery. Retained objects are not a supported price-history API.

The grocery bucket belongs only to this source boundary: its publisher, provenance, retention and credentials travel together. A future MCP with different ownership gets its own bucket. Cloudflare products and implementation patterns may be reused; unrelated domain data is not co-located.

## Anonymous shopping-list state

Each saved list is one bounded document stored under the single `shopping-list` key in one SQLite-backed Durable Object addressed by `SHOPPING_LISTS.getByName(listKey)`. The `listKey` contains 128 random bits and is a bearer capability for exactly one document. It is not an account, profile, MCP session or chat identity, and there is no enumeration or recovery path.

Creating a list requires an omitted key. Updating requires the existing capability and replaces the whole canonical document. Callers should read, edit and resend the complete document; concurrent valid replacements are deliberately last-write-wins. The document has at most 20 lines and 16 KiB of serialized JSON. No relational application schema, line rows, revision, quote or catalog data is stored.

A successful create or replacement sets one alarm for 90 days after the save. A save extends expiry; a read does not. Expired reads remove the single storage key, and the idempotent alarm removes that key and its alarm.

Every save first consumes the `SHOPPING_LIST_WRITES` rate-limit binding. Existing-list counters use a one-way digest derived from the capability. Creation counters use `CF-Connecting-IP`, with a fixed fallback only for local/test requests that lack the header. Cloudflare's limiter is approximate and local to a Cloudflare location. IP-based creation limiting can group unrelated users behind Claude, another proxy or carrier NAT, so it is only an abuse brake—not authorization, accounting or identity.

The capability necessarily appears in `get_shopping_list` and `save_shopping_list` tool arguments and successful results. Third-party MCP clients may retain those values according to their own policies. Stamppot never puts a capability in a URL, R2, logs, analytics or an error result.

## Authless and bounded posture

MCP transport remains stateless. Catalog search and basket planning are public read-only operations. The one state mutation is a bounded whole-document list save authorized solely by possession of its unguessable capability and guarded by input caps, expiry and rate limiting. There are no accounts or OAuth identities.

All catalog results include source, licence, observation time, version and freshness. Prices are indicative snapshots, may differ by location or checkout time and do not guarantee inventory. Catalog corruption or absence, unknown lists and rate limiting are explicit schema-conforming results; unexpected failures cross public boundaries only as generic errors.

## Explicitly deferred

The following are not part of v1:

- price history, price drops, watches, notifications, temporal deletion and historical-version replay;
- D1, public R2 access, a custom domain, Cache Rules, the Workers Cache API and Smart Tiered Cache;
- stored quotes, caller-provided catalog versions, direct offer lookup artifacts and checkout automation;
- fine-grained list mutations, persisted line IDs, revisions, multi-row list schemas and list recovery;
- shared buckets or Durable Object namespaces across unrelated MCP domains;
- accounts, OAuth, consumer API keys, Turnstile, webhooks, email and user profiles;
- server-side AI, recipe generation, dietary advice, inventory guarantees and a provisioning wizard.

These features require separate evidence and designs. Catalog cleanup or a cached public read path may be added only after measured storage, latency or R2 Class B cost justifies their extra topology.
