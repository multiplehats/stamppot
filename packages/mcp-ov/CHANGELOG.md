# @stamppot/mcp-ov

## 0.2.1

### Patch Changes

- 8c9849d: Add the Dutch second-hand listings MCP at `/mcp/marktplaats` with two read-only tools: `find_marktplaats_listings` searches by query, category, location and price/condition filters, and `get_marktplaats_listing` reads one listing's full detail. Both read the unofficial JSON endpoint the marktplaats.nl website itself uses, since Marktplaats has no public read API, bounded by short-TTL caching, capped page sizes and a per-IP rate limit.
  
  The shared outbound-fetch policy (bounded, GET-only, cache-before-fetch) used by `mcp-ov` has been extracted into a new `@stamppot/upstream` package so other upstream-reaching MCPs share it instead of re-implementing it. `mcp-ov` now depends on `@stamppot/upstream` with no behavior change.
- Updated dependencies [8c9849d]
- Updated dependencies [2d40f1f]
  - @stamppot/upstream@0.2.0
  - @stamppot/core@0.2.0

## 0.2.0

### Minor Changes

- d9ad7d6: Add the Dutch public transport MCP at `/mcp/ov` with five read-only tools: `find_ov_stop` resolves a place or stop name to a code, `plan_train_journey`, `get_train_departures` and `get_rail_disruptions` read the official NS Reisinformatie API, and `get_stop_departures` reads real-time bus, tram and metro departures from OVapi.
  
  Station codes and stop-area codes are separate namespaces, so every `find_ov_stop` result states its `kind` and the tools that accept it. Stop-area codes are not alphanumeric — `C.S.` is Rotterdam Centraal perron F — so `get_stop_departures` accepts them as published and they must be passed back verbatim. NS times are ISO 8601 with an offset; OVapi wall-clock times are returned verbatim with `timezone: "Europe/Amsterdam"`. Unreachable upstreams, unknown codes and rate limiting are explicit statuses rather than errors, and every result carries its source and whether that source is official.
  
  Self-hosting this domain needs three new pieces of Cloudflare state: an R2 bucket `stamppot-ov-stops` bound as `OV_STOPS` holding the stop directory, a rate-limit binding `OV_UPSTREAM_READS` on namespace `1763268922`, and an `NS_API_KEY` Worker secret. See `docs/runbooks/ov-self-hosting.md`. The groceries domain is unchanged.
