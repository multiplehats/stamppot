# Second-hand listings MCP: an unofficial search endpoint, a Dutch postcode resolver, and a stateless cursor

Date: 2026-09-02

## Decision

Stamppot ships exactly two read-only tools under the `marktplaats` MCP:

- `find_marktplaats_listings` searches Marktplaats by free-text query and/or category, with an optional place or postcode and radius, price bounds, condition, a posted-since cursor, sorting and paging.
- `get_marktplaats_listing` reads one listing's full detail by id, including the description, images, seller summary and bidding state.

The target use case is an agent that keeps an eye out for a second-hand PS5 in good condition within 20 km of Enschede every day. That loop, the schedule and the memory of which listings were already seen, belongs to the calling agent or its harness. Stamppot supplies stateless, bounded primitives: it does not remember a query between calls, does not run on a timer, and does not store a watch server-side. `find_marktplaats_listings` returns `observedAt` on every call specifically so an agent can pass it back as `postedSince` next time and get only what is new.

## Source posture

Marktplaats has no public read API. The partner API that exists needs manual approval and is built for sellers integrating their own inventory, not for third-party read access. This package instead reads the unofficial JSON endpoint the marktplaats.nl website itself calls for search results (`GET https://www.marktplaats.nl/lrp/api/search`), plus the listing page's embedded `window.__CONFIG__` JSON and description DOM. Neither needs authentication or cookies, and `robots.txt` does not disallow either path. Verified live on 2026-09-02 (see [Edge egress verification](#edge-egress-verification) below).

Marktplaats' Gebruiksvoorwaarden (22 juli 2026) constrain what a client may do with the site's content:

- Content may not be copied except "RSS feeds voor persoonlijk gebruik ... tot een maximum van 100 Advertenties" (RSS feeds for personal use, up to a maximum of 100 listings).
- The database right forbids "herhaald en systematisch opvragen" (repeated and systematic retrieval).
- Collecting advertisers' personal data is forbidden.

The bounds in this release answer each of those directly:

- `limit` is 1-30 per call and `offset + limit` may not exceed 100, so a single query can page through at most 100 listings, matching the 100-listing personal-use ceiling the ToS names for its own RSS feeds.
- A search result is cached for 60 seconds, a listing for 120 seconds, and a resolved place for 24 hours, all keyed on the upstream URL, so repeat calls for the same query or listing do not repeat the retrieval.
- A per-IP rate limiter (`MARKTPLAATS_UPSTREAM_READS`, namespace id `1763268923`) allows 30 upstream reads per 60 seconds, which bounds "systematic" retrieval at the account level regardless of cache hits.
- Requests carry an honest `User-Agent: stamppot (+https://stamppot.dev)` rather than impersonating a browser.
- The only personal data returned is a seller's display name and their listing-scoped id, both of which Marktplaats already shows to any visitor of the page. Phone numbers, bank details, `encryptedSellerId` and bidder nicknames are never read or returned (see [Listing-page parsing](#listing-page-parsing-and-its-degrade-path) below).
- Nothing is stored server-side. Every result carries `official: false` and `note: "onofficiële bron"`, matching the convention `mcp-ov` established for OVapi.

## Location resolution

Marktplaats' own location filter only accepts a Dutch postcode (PC4 or PC6). It does not accept a city name or coordinates: passing either is silently ignored by the search endpoint, and passing a syntactically valid but non-existent postcode is also silently ignored, which widens the search to the whole country rather than failing.

Because `find_marktplaats_listings` accepts a `place` name for convenience, that name is resolved first through PDOK Locatieserver, the official, free, keyless Dutch geocoder ("open en gratis"): a woonplaats (settlement) lookup returns a centroid, and the nearest valid postcode to that centroid is looked up and passed to Marktplaats (Enschede resolves to `7513CN`, for example). An unknown place name is reported as `unknown_place` rather than silently falling through to a nationwide search. A `postcode` given directly by the caller is validated for PC4/PC6 shape before use for the same reason: a search that silently widens to all of the Netherlands looks identical to a working, narrow search unless the tool is explicit about what it resolved. `resolvedLocation` echoes `place`, `municipality`, `province`, `postcode` and `source` on every result so the caller can see exactly what was searched, not just what was asked for.

## The stateless cursor model

`find_marktplaats_listings` takes `postedSince`, an ISO instant, and returns `observedAt`, the instant the returned snapshot was fetched. A fresh search reports the moment it ran; a search served from the 60-second cache reports the earliest instant its snapshot could have been fetched rather than the request time, so an agent that advances its cursor by `observedAt` re-reads a small overlap instead of skipping a listing posted during the cache window. An agent polling daily for new PS5 listings passes the previous call's `observedAt` back as the next call's `postedSince` and gets only listings posted after that point. Stamppot does not track which ids a caller has already seen, does not accept a saved query, and does not run anything on a schedule.

This is deliberate, not a missing feature. A server-side saved watch needs an identity to save it against, a scheduler to run it, and a notification channel to deliver a result through, none of which this package has any way to do safely without accounts, and all of which the calling agent or its harness already has. The stateless cursor is the smallest primitive that makes a daily poll correct without Stamppot taking on any of that. See [Explicitly deferred](#explicitly-deferred).

## Listing-page parsing and its degrade path

`GET /m<id>` redirects twice before it reaches the real page: `/m<id>` (301) to `/v/<l1>/<short-l2>/m<id>-<slug>` (301) to `/v/<l1>/<l2-key>/m<id>-<slug>` (200). The slugs in the intermediate hops must be exact, which is why the redirect chain cannot be shortcut by guessing a final URL. The client follows at most 3 same-origin hops matching that path shape and never follows a redirect to a different origin. An id that does not resolve returns 404 at the first hop, which is reported as `unknown_listing`.

On the final page, the full description lives only in the DOM, in an element with `data-collapsable="description"`, parsed with HTMLRewriter. The page also embeds a JSON-LD `Product` block whose `description` field is truncated to 150 characters; that is used only as a fallback when the DOM element is missing, and the result then carries `descriptionTruncated: true` so a caller can tell the two apart. If `window.__CONFIG__`, the page's embedded state blob, is missing entirely, the page is treated as unusable and the result is `upstream_unavailable`, because everything else the tool reads (price, condition, attributes, seller) also comes from that blob.

The listing detail deliberately excludes phone numbers, bank data, `encryptedSellerId`, bidder nicknames and coordinates, none of which are needed to describe a listing and some of which the ToS' personal-data prohibition covers directly. The related seller-profile endpoint (`/v/api/seller-profile`) that does expose phone and bank data is not called by this package at all; see [Explicitly deferred](#explicitly-deferred).

## Edge egress verification

On 2026-09-02 a throwaway Worker (`stamppot-marktplaats-probe`, deleted after the check) was deployed to `workers.dev` and run four times between 13:16 and 13:53 UTC: three times from the AMS colo and once from LHR.

Every run:

- `GET /lrp/api/search` returned HTTP 200 with a parseable JSON body, `totalResultCount` of 335 to 338 for the probe query, served via CloudFront (`x-cache: Miss from cloudfront`), with no `x-amzn-waf-action` header.
- `GET /m2437783300` followed 301 -> 301 -> 200 to a 109,161-byte page containing both `window.__CONFIG__` and a `data-collapsable="description"` element, with no WAF challenge page.
- Two sequential calls to PDOK Locatieserver both returned HTTP 200.
- A burst of 10 sequential search calls all returned HTTP 200.

Conclusion: Cloudflare's egress to Marktplaats and PDOK is not blocked as of this date. If Marktplaats starts answering 403 or 429, or serves a challenge page instead of the search JSON or the listing page, that surfaces to callers as `upstream_unavailable` rather than a crash. The policy on that day is not to add a proxy, spoof additional headers, or attempt to solve a challenge; if Marktplaats asks Stamppot to stop, the route is disabled instead.

## Outbound fetch policy

The fetch policy is inherited from `docs/decisions/ov.md` via the shared `@stamppot/upstream` package, extracted from `mcp-ov` in this same change so `mcp-marktplaats` does not reimplement it:

- GET only.
- `redirect: "manual"`, with the listing client itself following same-origin redirects explicitly rather than letting the fetch layer do it, per [Listing-page parsing](#listing-page-parsing-and-its-degrade-path) above.
- An 8 MiB response bound and a timeout derived from the caller's `AbortSignal`: 10 s for Marktplaats, 5 s for PDOK.
- Cache-before-fetch in a dedicated `stamppot-marktplaats-upstream-v1` Cache API namespace, so this domain's cached responses never collide with `mcp-ov`'s or the zone's HTTP cache.
- A cache write never fails a read: the upstream answer is already parsed by the time the entry is written, so a rejected cache write costs a later caller one extra upstream read and nothing else.

## Failure mapping

- Network error, timeout, an unusable response body, or an unexpected HTTP status from Marktplaats or PDOK becomes `upstream_unavailable`, marked retryable with `retryAfterSeconds: 60`.
- The rate limiter being exhausted becomes `rate_limited`.
- PDOK returning zero results for a place name becomes `unknown_place`.
- A listing id that 404s becomes `unknown_listing`.
- Anything unmodelled is replaced by a generic error at the operation boundary, following the pattern in `docs/decisions/ov.md`.

## Explicitly deferred

The following are not part of this release:

- server-side saved watches and push or scheduled notifications;
- a seller-profile tool (`/v/api/seller-profile` exposes phone numbers and bank data, neither of which this package will surface);
- category tree browsing as its own tool;
- a delivery filter;
- 2dehands.be, the Belgian sibling site;
- Admarkt `topBlock` promoted items;
- migrating the groceries domain's rate limiter onto `CloudflareIpRateLimiter`;
- any login-based feature: saved searches, favourites, or messages.

Each needs its own evidence and design, and several need an account this package deliberately does not hold.
