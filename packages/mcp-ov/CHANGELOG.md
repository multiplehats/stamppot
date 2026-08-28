# @stamppot/mcp-ov

## 0.2.0

### Minor Changes

- d9ad7d6: Add the Dutch public transport MCP at `/mcp/ov` with five read-only tools: `find_ov_stop` resolves a place or stop name to a code, `plan_train_journey`, `get_train_departures` and `get_rail_disruptions` read the official NS Reisinformatie API, and `get_stop_departures` reads real-time bus, tram and metro departures from OVapi.
  
  Station codes and stop-area codes are separate namespaces, so every `find_ov_stop` result states its `kind` and the tools that accept it. Stop-area codes are not alphanumeric — `C.S.` is Rotterdam Centraal perron F — so `get_stop_departures` accepts them as published and they must be passed back verbatim. NS times are ISO 8601 with an offset; OVapi wall-clock times are returned verbatim with `timezone: "Europe/Amsterdam"`. Unreachable upstreams, unknown codes and rate limiting are explicit statuses rather than errors, and every result carries its source and whether that source is official.
  
  Self-hosting this domain needs three new pieces of Cloudflare state: an R2 bucket `stamppot-ov-stops` bound as `OV_STOPS` holding the stop directory, a rate-limit binding `OV_UPSTREAM_READS` on namespace `1763268922`, and an `NS_API_KEY` Worker secret. See `docs/runbooks/ov-self-hosting.md`. The groceries domain is unchanged.
