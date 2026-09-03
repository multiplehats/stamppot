import { z } from "zod";

export const STOPS_FORMAT_VERSION = 1;
export const MAX_STOPS_OBJECT_BYTES = 1024 * 1024;
export const MAX_STOP_NAME_CHARACTERS = 200;
export const MAX_STOP_CODE_CHARACTERS = 40;
export const MAX_SNAPSHOT_STOPS = 50_000;
export const STOPS_MANIFEST_KEY = "stops/manifest.json";

/**
 * Only the `v0` virtual host serves this data, and its TLS certificate is
 * issued for unrelated names, so the plain-HTTP origin is the only reachable
 * one. See `docs/runbooks/ov-self-hosting.md`.
 */
export const OVAPI_BASE_URL = "http://v0.ovapi.nl";
export const OVAPI_STOP_AREAS_URL = `${OVAPI_BASE_URL}/stopareacode`;
export const NS_BASE_URL = "https://gateway.apiportal.ns.nl/reisinformatie-api";
export const NS_STATIONS_URL = `${NS_BASE_URL}/api/v2/stations`;

export const NS_SOURCE = {
  licence: "NS Reisinformatie API voorwaarden",
  name: "NS Reisinformatie API",
  url: "https://apiportal.ns.nl/",
} as const;

export const OVAPI_SOURCE = {
  licence: "onbekend, niet-commercieel gebruik",
  name: "OVapi",
  note: "onofficiële bron",
  url: "http://ovapi.nl/",
} as const;

/** Kind 0 is an NS train station; kind 1 is an OVapi stop area. */
export const TRAIN_STATION_KIND = 0;
export const STOP_AREA_KIND = 1;

const DIACRITIC_PATTERN = /\p{Mark}+/gu;
const NON_SEARCH_CHARACTER_PATTERN = /[^\p{Letter}\p{Number}]+/gu;
const WHITESPACE_PATTERN = /\s+/g;
const BASE64_PADDING_PATTERN = /[=]+$/u;

/**
 * Deliberately duplicated rather than imported from `mcp-groceries`: the two
 * domains own their own matching rules and must be free to diverge.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(DIACRITIC_PATTERN, "")
    .toLowerCase()
    .replace(NON_SEARCH_CHARACTER_PATTERN, " ")
    .replace(WHITESPACE_PATTERN, " ")
    .trim();
}

export function searchTokens(value: string): string[] {
  const normalized = normalizeSearchText(value);
  return normalized === "" ? [] : normalized.split(" ");
}

export const stopKindCodeSchema = z.union([
  z.literal(TRAIN_STATION_KIND),
  z.literal(STOP_AREA_KIND),
]);

/** `[kind, code, name, town, normalizedSearchText]`. */
export const stopRecordSchema = z.tuple([
  stopKindCodeSchema,
  z.string().min(1).max(MAX_STOP_CODE_CHARACTERS),
  z.string().min(1).max(MAX_STOP_NAME_CHARACTERS),
  z.string().max(MAX_STOP_NAME_CHARACTERS),
  z
    .string()
    .min(1)
    .max(2 * MAX_STOP_NAME_CHARACTERS),
]);

export const stopsSnapshotSchema = z
  .object({
    formatVersion: z.literal(STOPS_FORMAT_VERSION),
    records: z.array(stopRecordSchema).min(1).max(MAX_SNAPSHOT_STOPS),
    snapshotVersion: z.string().min(1).max(200),
  })
  .strict();

export const stopsManifestSchema = z
  .object({
    currentVersion: z.string().min(1).max(200),
    formatVersion: z.literal(STOPS_FORMAT_VERSION),
    observedAt: z.string().datetime({ offset: true }),
    snapshot: z
      .object({
        byteLength: z
          .number()
          .int()
          .positive()
          .max(MAX_STOPS_OBJECT_BYTES)
          .safe(),
        key: z.string().regex(/^stops\/versions\/[^/]+\/stops\.json$/),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    sources: z
      .object({
        ns: z
          .object({
            licence: z.literal(NS_SOURCE.licence),
            name: z.literal(NS_SOURCE.name),
            url: z.literal(NS_SOURCE.url),
          })
          .strict(),
        ovapi: z
          .object({
            licence: z.literal(OVAPI_SOURCE.licence),
            name: z.literal(OVAPI_SOURCE.name),
            note: z.literal(OVAPI_SOURCE.note),
            url: z.literal(OVAPI_SOURCE.url),
          })
          .strict(),
      })
      .strict(),
    stationCount: z.number().int().nonnegative().safe(),
    stopAreaCount: z.number().int().nonnegative().safe(),
    stopCount: z.number().int().positive().max(MAX_SNAPSHOT_STOPS).safe(),
  })
  .strict();

/** Loose view of `GET /api/v2/stations`, covering only the fields we publish. */
export const nsStationsSourceSchema = z
  .object({
    payload: z.array(
      z
        .object({
          code: z.string().trim().min(1).max(40),
          land: z.string().optional(),
          namen: z
            .object({
              kort: z.string().optional(),
              lang: z.string().optional(),
              middel: z.string().optional(),
            })
            .loose()
            .optional(),
          stationType: z.string().optional(),
        })
        .loose()
    ),
  })
  .loose();

/** Loose view of `GET /stopareacode`, covering only the fields we publish. */
export const ovApiStopAreasSourceSchema = z.record(
  z.string(),
  z
    .object({
      StopAreaCode: z
        .string()
        .trim()
        .min(1)
        .max(MAX_STOP_CODE_CHARACTERS)
        .optional(),
      TimingPointName: z.string().optional(),
      TimingPointTown: z.string().optional(),
    })
    .loose()
);

export type StopRecord = z.output<typeof stopRecordSchema>;
export type StopsSnapshot = z.output<typeof stopsSnapshotSchema>;
export type StopsManifest = z.output<typeof stopsManifestSchema>;

export function snapshotKey(version: string): string {
  return `stops/versions/${version}/stops.json`;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_PADDING_PATTERN, "");
}

export async function sha256Hex(value: Uint8Array): Promise<string> {
  const bytes = new Uint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
