// Asks a deployed Worker to resolve a stop that always exists, and fails unless the
// stop directory answers. An empty or unreadable `stops/manifest.json` surfaces only as
// `directory_unavailable` at request time, so this is the one place it shows up loudly.
//
// Usage: node scripts/check-ov-directory.mjs [origin]   (default https://stamppot.dev)

const DEFAULT_ORIGIN = "https://stamppot.dev";
const REQUEST_TIMEOUT_MS = 30_000;
const PROBE_QUERY = "amsterdam centraal";

const origin = process.argv[2] ?? DEFAULT_ORIGIN;
const url = new URL("/v1/tools/find_ov_stop", origin);

const response = await fetch(url, {
  body: JSON.stringify({ kinds: ["train_station"], query: PROBE_QUERY }),
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
  !Array.isArray(result.stops) ||
  result.stops.length === 0
) {
  throw new Error(
    `${url} did not resolve "${PROBE_QUERY}" (HTTP ${response.status}): ${body.slice(0, 200)}`
  );
}

process.stdout.write(
  `Stop directory is live: snapshot ${result.snapshotVersion}, observed ${result.observedAt}, ${result.stops.length} match(es) for "${PROBE_QUERY}".\n`
);
