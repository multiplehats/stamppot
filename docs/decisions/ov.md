# Public transport MCP: two upstreams, a server-held key, and a stop-code directory

Date: 2026-08-28

## Decision

Stamppot ships exactly five public transport tools under the `ov` MCP:

- `find_ov_stop` resolves a Dutch place or stop name to the code every other tool requires.
- `plan_train_journey` plans a train journey between two NS stations.
- `get_train_departures` reads one station's departure board.
- `get_rail_disruptions` reads national or per-station rail disruptions.
- `get_stop_departures` reads real-time bus, tram and metro departures for one stop area.

The calling agent stays responsible for conversation: choosing between ambiguous stops, deciding what "leave in time for my 14:00" means, and relaying NS's own advice. Stamppot performs code resolution, bounded upstream reads, deterministic mapping and explicit in-band failure reporting.

## Two upstreams with different postures

Train data comes from the **NS Reisinformatie API** (`gateway.apiportal.ns.nl/reisinformatie-api`), the official source, over HTTPS, authenticated with an `Ocp-Apim-Subscription-Key` header. Bus, tram and metro data comes from **OVapi** (`v0.ovapi.nl`), an unofficial keyless community source with no published licence and no availability guarantee. Every OVapi result carries `official: false` and `note: "onofficiële bron"`; NS results carry `official: true`.

The two are not interchangeable and their code spaces are disjoint. An NS station code is never valid for `get_stop_departures` and an OVapi stop-area code is never valid for a train tool. `find_ov_stop` therefore returns a `kind` and an explicit `usableWith` tool list on every result, so an agent cannot silently cross the boundary.

### OVapi codes are not alphanumeric

NS station codes are two to ten letters or digits. OVapi codes are not: eleven of the 4,599 published stop areas carry a space, a dot, an ampersand, a plus or an accented letter, and two are a single character. `C.S.` is Rotterdam Centraal perron F and `Bd CS` is Breda Centraal Station W, so this is not a tail worth dropping. `get_stop_departures` therefore accepts one to forty characters beginning with a letter or digit rather than a narrow slug, and the client percent-encodes the code into the request path — verified against the live endpoint for `C.S.`, `Bd CS` and `NmBlé`, each of which is echoed back verbatim as the response's top-level key.

The rule that matters is the invariant, not the character class: every code the published snapshot can hand out must be one the tool named in `usableWith` accepts. A narrower input rule made `find_ov_stop` return codes its own follow-up tool rejected with `invalid_input`, which is worse than returning nothing. `MAX_STOP_CODE_CHARACTERS` is the single bound the snapshot record, the public result and the input rule all share, and the build test asserts the invariant across every published record.

### OVapi is reachable only over plain HTTP

`https://v0.ovapi.nl/` presents a certificate issued for `1313.nl`, whose subject alternative names are `1313.nl`, `iepenbierferfier.frl`, `iepenbierferfier.nl` and their `www` forms. None of those hosts serve the OVapi paths — they answer 404 — and neither does `ovapi.nl`. Only the `v0` virtual host serves the data, and only its plain-HTTP origin validates.

Cloudflare Workers cannot disable certificate verification, so `get_stop_departures` fetches `http://v0.ovapi.nl`. The consequence is stated plainly, here and in the tool's own documentation: **OVapi responses are not protected against on-path modification.** The trade-off is accepted because the data is public, read-only, low-stakes real-time information, and because deferring the tool would have removed the only non-train modality. If OVapi ever publishes a matching certificate, only `OVAPI_BASE_URL` changes.

That plain-HTTP subrequest works from the Cloudflare edge, not only from local workerd. A throwaway Worker deployed to confirm it fetched `http://v0.ovapi.nl/stopareacode/09500` and got HTTP 200 with 40,815 bytes of OVapi JSON, with `response.url` unchanged — so the edge neither refuses the request nor silently upgrades the scheme. The same probe requested the `https://` form and received Cloudflare's own **526 Invalid SSL Certificate**, which independently corroborates the certificate defect described above. The failure mode stays contained either way: if a future platform change did refuse plain HTTP, `get_stop_departures` would answer `upstream_unavailable` and no other tool would be affected.

## Outbound fetch policy

This is the repository's first MCP that reaches an upstream from a tool handler, so the policy is fixed here rather than per client:

- **GET only.** No upstream write path exists.
- **Bounded.** `AbortSignal.any([context.signal, AbortSignal.timeout(timeoutMs)])`, with 10 s for NS and 5 s for OVapi, and an 8 MiB response bound.
- **Cache before fetch.** A short-TTL cache keyed on the upstream URL: 30 s for departures, 60 s for trips and disruptions. In the Worker this is a dedicated `caches.open("stamppot-ov-upstream-v1")` namespace rather than `caches.default`, so Stamppot's upstream cache never collides with the zone's HTTP cache.
- **Credentials in headers only.** The NS key never appears in a URL, so it never appears in a cache key, a log or an error.
- **`redirect: "manual"`.** workerd rejects `redirect: "error"`, and following a redirect could carry the NS key to another host. A 3xx therefore arrives as a non-ok response and is reported as unavailable.
- **Permissive upstream schemas.** Each client validates only the fields it reads, with every field optional, then trims prose and caps arrays before the strict output parse. Upstream drift degrades to missing data rather than a parse failure.
- **Canonical timestamps.** NS and OVapi both emit colon-less UTC offsets such as `+0200`, which ISO 8601 profile validation rejects. Clients rewrite `±HHMM` to `±HH:MM` before the output parse.
- **A cache write never fails a read.** The upstream answer is already parsed by the time the entry is written, so a cache that refuses the write costs a later caller one extra upstream read and nothing else. Reporting `upstream_unavailable` for a request that succeeded would be a lie about the upstream.

Failure mapping is total and leaks nothing. A network error, timeout, unusable body or unexpected status becomes `upstream_unavailable`. NS answering 400 or 404 to a station-scoped request becomes `unknown_station`. OVapi answering 200 with an empty object — its way of saying "no such stop" — becomes `unknown_stop`. A missing NS key short-circuits to `upstream_unavailable` without a fetch. Anything unmodelled is replaced by a generic error at the operation boundary.

## Secret and rate-limit posture

End users stay authless. The NS key is a Worker secret (`NS_API_KEY`), set with `wrangler secret put` in production and via `apps/edge/.dev.vars` locally, and it is never returned, logged or echoed. `wrangler types` only emits secret keys when a `.dev.vars` file exists, so `cloudflare.ts` reads the key through a local `OvSecretBindings` intersection rather than depending on the generated bindings interface; `pnpm check` passes with and without that file.

Every upstream-reaching tool first consumes the `OV_UPSTREAM_READS` rate-limit binding, keyed on a one-way digest of `CF-Connecting-IP` with a fixed fallback for local requests that lack the header. Exhausting it returns `rate_limited` with `retryAfterSeconds: 60`. Together with the short-TTL cache this is what keeps the free NS tier's daily request budget and OVapi's fair-use expectations intact. Cloudflare's limiter is approximate and per-location, and IP keying groups users behind a shared proxy, so it is an abuse brake — not authorization, accounting or identity.

## Stops snapshot topology

`find_ov_stop` reads a published snapshot from a private R2 bucket (`stamppot-ov-stops`, `OV_STOPS` binding, EU jurisdiction) rather than querying an upstream. OVapi has no text search at all, and resolving names against NS on every call would spend the key's budget on a lookup that barely changes.

The snapshot merges the OVapi `/stopareacode` dump with NS `/api/v2/stations`, filtered to Dutch stations. That pairing was chosen over GTFS `stops.txt` because it is keyed by exactly the codes the departure tools consume, so a code can never drift from its source, and because it is one small JSON document per source.

Records are compact tuples of `[kind, code, name, town, normalizedSearchText]`. Measured against the real 4,599-entry OVapi dump the snapshot is about 342 KB, comfortably under the 1 MiB `MAX_STOPS_OBJECT_BYTES` bound, so there is **no sharding**: one `stops/versions/<version>/stops.json` plus one mutable `stops/manifest.json` pointer, published in that order. Sharding is the documented escape hatch if the bound is ever hit; the build hard-fails rather than publishing an oversized object.

Two fields are deliberately absent. The OVapi dump carries **no modality field**, so stop areas report no modality rather than a guess; only NS stations are known to be trains. It also carries a sentinel coordinate — `3.3135424, 47.974766`, in central France — for stops whose location is unknown, including Amsterdam Centraal's `asdcs`. Publishing that would be actively wrong, and a name-to-code resolver does not need coordinates, so **no coordinates are published at all**.

A parsed snapshot is memoised per isolate under its version. The manifest is still read from R2 on every call, so publishing a new version takes effect on the next request rather than on the next isolate; only the parse is skipped, which is the expensive half at roughly ten milliseconds of CPU for 4,600 records. That matters because `find_ov_stop` reaches no upstream and therefore consumes no rate limiter, so the parse would otherwise repeat on every authless call.

The bucket belongs to this source boundary alone, following the ownership rule established for groceries: publisher, provenance, retention and credentials travel together.

## NS fixtures are authored, not recorded

No NS subscription key was available while building this, so the recorded fixtures under `packages/mcp-ov/fixtures/` were derived from the published Reisinformatie API OpenAPI definition rather than from live responses; only the OVapi fixtures are live recordings. The upstream schemas are permissive precisely because of this. The first real call an operator makes with their own key is the actual verification of the NS response shapes, and the runbook says so.

## Timezone stance

NS timestamps are instants and pass through as ISO 8601 with an offset. OVapi timestamps are local wall-clock times with no offset at all. Rather than invent one, `get_stop_departures` returns them verbatim in `plannedDepartureLocal` and `expectedDepartureLocal` alongside `timezone: "Europe/Amsterdam"`. Stamppot performs no server-side DST arithmetic and never converts an offset-less time to UTC.

## Explicitly deferred

The following are not part of this release:

- fares, pricing, tickets, reservations, seat data and checkout;
- GTFS-based multimodal routing, walking or cycling legs, and door-to-door planning;
- pushed or subscribed disruption updates, and the NS `topic` subscription channel;
- quay-level OVapi endpoints (`/tpc`), vehicle positions and journey-detail lookups;
- a scheduled trigger to refresh the stops snapshot, and snapshot retention or cleanup;
- per-key NS quota accounting, usage analytics and caller-selected snapshot versions;
- station facilities, accessibility routing and travel-assistance booking;
- coordinates, modality classification for stop areas, and geographic or radius search.

Each needs its own evidence and design. Coordinates and stop-area modality in particular need a source that actually carries them.
