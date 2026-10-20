// Asks a deployed Worker to price a grocery that is always stocked, and fails unless the
// catalog answers with offers and reports itself fresh. A catalog that nobody refreshes
// keeps answering `status: "ok"` with prices from the day it was published, marked only
// by `freshness: "stale"`, so availability alone is not a useful check.
//
// Usage: node scripts/check-groceries-catalog.mjs [origin] [--expect-version <version>]
//   (default origin https://stamppot.dev). --expect-version also requires the live
//   `catalogVersion` to match, which proves the Worker reads the snapshot just published.

import { parseArgs } from "node:util";

const DEFAULT_ORIGIN = "https://stamppot.dev";
const REQUEST_TIMEOUT_MS = 30_000;
const PROBE_QUERY = "melk";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { "expect-version": { type: "string" } },
  strict: true,
});
const origin = positionals[0] ?? DEFAULT_ORIGIN;
const expectedVersion = values["expect-version"];
const url = new URL("/v1/tools/find_grocery_options", origin);

const response = await fetch(url, {
  body: JSON.stringify({ query: PROBE_QUERY }),
  headers: { "content-type": "application/json" },
  method: "POST",
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});
const body = await response.text();

let result;
try {
  result = JSON.parse(body);
} catch (error) {
  throw new Error(
    `${url} answered HTTP ${response.status} with non-JSON: ${body.slice(0, 200)}`,
    { cause: error }
  );
}

if (
  result.status !== "ok" ||
  !Array.isArray(result.offers) ||
  result.offers.length === 0
) {
  throw new Error(
    `${url} found no offers for "${PROBE_QUERY}" (HTTP ${response.status}): ${body.slice(0, 200)}`
  );
}

if (result.freshness !== "fresh") {
  throw new Error(
    `${url} serves a ${result.freshness} catalog: snapshot ${result.catalogVersion}, observed ${result.observedAt}. Run the "Groceries catalog sync" workflow.`
  );
}

if (
  expectedVersion !== undefined &&
  result.catalogVersion !== expectedVersion
) {
  throw new Error(
    `${url} serves snapshot ${result.catalogVersion}, not the just-published ${expectedVersion}`
  );
}

process.stdout.write(
  `Grocery catalog is live and fresh: snapshot ${result.catalogVersion}, observed ${result.observedAt}, ${result.offers.length} offer(s) for "${PROBE_QUERY}".\n`
);
