# `@stamppot/mcp-groceries`

Transport-neutral operations for current Dutch grocery retrieval and optional anonymous shopping lists.

The MCP exposes exactly four tools:

- `find_grocery_options` searches real packages and distinguishes checkout price from compatible unit value.
- `plan_grocery_basket` rounds targets to packages, compares bounded retailer combinations, reports unmatched lines, and returns unpinned `replayInput` for current-price follow-ups.
- `get_shopping_list` retrieves one bounded saved document using its bearer `listKey`.
- `save_shopping_list` creates or replaces the complete document with last-write-wins semantics.

Catalog data comes from [Checkjebon](https://github.com/supermarkt/checkjebon) under the MIT licence. Prices are indicative snapshots, may differ by location or checkout time, and do not guarantee inventory.

Saved lists are separate from quotes and catalog data. A random 128-bit `listKey` grants access to exactly one list, is not tied to an account or MCP session, and cannot be recovered if lost. Read before replacing an existing document and retain every line the user still wants.

Use the domain endpoint at `/mcp/groceries`. See the [self-hosting runbook](../../docs/runbooks/groceries-self-hosting.md) for local catalog sync and Cloudflare resource setup.
