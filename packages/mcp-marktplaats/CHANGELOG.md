# @stamppot/mcp-marktplaats

## 0.2.0

### Minor Changes

- 8c9849d: Add the Dutch second-hand listings MCP at `/mcp/marktplaats` with two read-only tools: `find_marktplaats_listings` searches by query, category, location and price/condition filters, and `get_marktplaats_listing` reads one listing's full detail. Both read the unofficial JSON endpoint the marktplaats.nl website itself uses, since Marktplaats has no public read API, bounded by short-TTL caching, capped page sizes and a per-IP rate limit.
  
  The shared outbound-fetch policy (bounded, GET-only, cache-before-fetch) used by `mcp-ov` has been extracted into a new `@stamppot/upstream` package so other upstream-reaching MCPs share it instead of re-implementing it. `mcp-ov` now depends on `@stamppot/upstream` with no behavior change.

### Patch Changes

- Updated dependencies [8c9849d]
- Updated dependencies [2d40f1f]
  - @stamppot/upstream@0.2.0
  - @stamppot/core@0.2.0
