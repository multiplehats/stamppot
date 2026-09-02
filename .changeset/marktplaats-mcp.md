---
"@stamppot/upstream": minor
"@stamppot/mcp-marktplaats": minor
"@stamppot/edge": minor
"@stamppot/mcp-ov": patch
---

Add the Dutch second-hand listings MCP at `/mcp/marktplaats` with two read-only tools: `find_marktplaats_listings` searches by query, category, location and price/condition filters, and `get_marktplaats_listing` reads one listing's full detail. Both read the unofficial JSON endpoint the marktplaats.nl website itself uses, since Marktplaats has no public read API, bounded by short-TTL caching, capped page sizes and a per-IP rate limit.

The shared outbound-fetch policy (bounded, GET-only, cache-before-fetch) used by `mcp-ov` has been extracted into a new `@stamppot/upstream` package so other upstream-reaching MCPs share it instead of re-implementing it. `mcp-ov` now depends on `@stamppot/upstream` with no behavior change.
