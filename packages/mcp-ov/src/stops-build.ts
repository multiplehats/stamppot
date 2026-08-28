import {
  MAX_STOP_NAME_CHARACTERS,
  MAX_STOPS_OBJECT_BYTES,
  NS_SOURCE,
  normalizeSearchText,
  nsStationsSourceSchema,
  OVAPI_SOURCE,
  ovApiStopAreasSourceSchema,
  STOP_AREA_KIND,
  STOPS_FORMAT_VERSION,
  STOPS_MANIFEST_KEY,
  type StopRecord,
  type StopsManifest,
  sha256Hex,
  snapshotKey,
  stopsManifestSchema,
  stopsSnapshotSchema,
  TRAIN_STATION_KIND,
} from "./stops-format";

const textEncoder = new TextEncoder();
const VERSION_HASH_LENGTH = 12;
const WHITESPACE_PATTERN = /\s+/g;
/** NS publishes stations abroad too; only Dutch ones are in scope. */
const DUTCH_COUNTRY_CODE = "NL";

export interface StopsArtifactObject {
  readonly body: Uint8Array;
  readonly key: string;
  readonly sha256: string;
}

export interface BuiltStopsArtifacts {
  readonly manifest: StopsManifest;
  readonly manifestHash: string;
  readonly manifestObject: StopsArtifactObject;
  readonly objects: readonly StopsArtifactObject[];
  readonly snapshotObject: StopsArtifactObject;
  readonly stationCount: number;
  readonly stopAreaCount: number;
  readonly stopCount: number;
  readonly version: string;
}

export interface StopsPublisher {
  readonly put: (object: StopsArtifactObject) => Promise<void>;
}

export interface BuildStopsOptions {
  readonly nsStations: unknown;
  readonly observedAt: Date;
  readonly ovApiStopAreas: unknown;
}

function cleanName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const collapsed = value.replace(WHITESPACE_PATTERN, " ").trim();
  if (collapsed === "") {
    return undefined;
  }
  return collapsed.slice(0, MAX_STOP_NAME_CHARACTERS);
}

function normalizeObservationTime(observedAt: Date): string {
  if (!Number.isFinite(observedAt.getTime())) {
    throw new Error("Observation time must be a valid instant");
  }
  return observedAt.toISOString();
}

function versionTimestamp(observedAt: string): string {
  return observedAt.replaceAll("-", "").replaceAll(":", "").replace(".", "");
}

function stopRecord(
  kind: typeof STOP_AREA_KIND | typeof TRAIN_STATION_KIND,
  code: string,
  name: string,
  town: string
): StopRecord | undefined {
  const searchText = normalizeSearchText(`${town} ${name}`).slice(
    0,
    2 * MAX_STOP_NAME_CHARACTERS
  );
  if (searchText === "") {
    return undefined;
  }
  return [kind, code, name, town, searchText];
}

function trainStationRecords(source: unknown): StopRecord[] {
  const parsed = nsStationsSourceSchema.parse(source);
  const records: StopRecord[] = [];
  const seen = new Set<string>();
  for (const station of parsed.payload) {
    const code = station.code.trim();
    if (code === "" || seen.has(code)) {
      continue;
    }
    if (station.land !== undefined && station.land !== DUTCH_COUNTRY_CODE) {
      continue;
    }
    const name =
      cleanName(station.namen?.lang) ??
      cleanName(station.namen?.middel) ??
      cleanName(station.namen?.kort);
    if (name === undefined) {
      continue;
    }
    const record = stopRecord(TRAIN_STATION_KIND, code, name, "");
    if (record !== undefined) {
      seen.add(code);
      records.push(record);
    }
  }
  return records;
}

function stopAreaRecords(source: unknown): StopRecord[] {
  const parsed = ovApiStopAreasSourceSchema.parse(source);
  const records: StopRecord[] = [];
  const seen = new Set<string>();
  for (const [key, area] of Object.entries(parsed)) {
    const code = (area.StopAreaCode ?? key).trim();
    if (code === "" || seen.has(code)) {
      continue;
    }
    const name = cleanName(area.TimingPointName);
    if (name === undefined) {
      continue;
    }
    const record = stopRecord(
      STOP_AREA_KIND,
      code,
      name,
      cleanName(area.TimingPointTown) ?? ""
    );
    if (record !== undefined) {
      seen.add(code);
      records.push(record);
    }
  }
  return records;
}

function compareRecords(left: StopRecord, right: StopRecord): number {
  if (left[0] !== right[0]) {
    return left[0] - right[0];
  }
  if (left[1] !== right[1]) {
    return left[1] < right[1] ? -1 : 1;
  }
  return 0;
}

function canonicalJson(value: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(value));
}

async function artifactObject(
  key: string,
  value: unknown
): Promise<StopsArtifactObject> {
  const body = canonicalJson(value);
  return { body, key, sha256: await sha256Hex(body) };
}

function assertSnapshotSize(object: StopsArtifactObject): void {
  if (object.body.byteLength > MAX_STOPS_OBJECT_BYTES) {
    throw new Error(
      `Stops snapshot ${object.key} exceeds the ${MAX_STOPS_OBJECT_BYTES}-byte limit`
    );
  }
}

export async function buildStopsArtifacts(
  options: BuildStopsOptions
): Promise<BuiltStopsArtifacts> {
  const observedAt = normalizeObservationTime(options.observedAt);
  const stations = trainStationRecords(options.nsStations);
  const stopAreas = stopAreaRecords(options.ovApiStopAreas);
  const records = [...stations, ...stopAreas].sort(compareRecords);
  if (records.length === 0) {
    throw new Error("Stops source must contain at least one stop");
  }

  const contentHash = await sha256Hex(canonicalJson(records));
  const version = `${versionTimestamp(observedAt)}-${contentHash.slice(
    0,
    VERSION_HASH_LENGTH
  )}`;
  const snapshot = stopsSnapshotSchema.parse({
    formatVersion: STOPS_FORMAT_VERSION,
    records,
    snapshotVersion: version,
  });
  const snapshotObject = await artifactObject(snapshotKey(version), snapshot);
  assertSnapshotSize(snapshotObject);

  const manifest = stopsManifestSchema.parse({
    currentVersion: version,
    formatVersion: STOPS_FORMAT_VERSION,
    observedAt,
    snapshot: {
      byteLength: snapshotObject.body.byteLength,
      key: snapshotObject.key,
      sha256: snapshotObject.sha256,
    },
    sources: { ns: NS_SOURCE, ovapi: OVAPI_SOURCE },
    stationCount: stations.length,
    stopAreaCount: stopAreas.length,
    stopCount: records.length,
  } satisfies StopsManifest);
  const manifestObject = await artifactObject(STOPS_MANIFEST_KEY, manifest);

  return {
    manifest,
    manifestHash: manifestObject.sha256,
    manifestObject,
    objects: [snapshotObject, manifestObject],
    snapshotObject,
    stationCount: stations.length,
    stopAreaCount: stopAreas.length,
    stopCount: records.length,
    version,
  };
}

export async function validateStopsArtifacts(
  artifacts: BuiltStopsArtifacts
): Promise<void> {
  const manifest = stopsManifestSchema.parse(artifacts.manifest);
  if (artifacts.objects.at(-1)?.key !== STOPS_MANIFEST_KEY) {
    throw new Error("Stops manifest must be the final artifact object");
  }
  if (artifacts.objects.length !== 2) {
    throw new Error("Stops build must contain one snapshot and one manifest");
  }
  assertSnapshotSize(artifacts.snapshotObject);
  if (
    manifest.snapshot.key !== artifacts.snapshotObject.key ||
    manifest.snapshot.byteLength !== artifacts.snapshotObject.body.byteLength ||
    manifest.snapshot.sha256 !== artifacts.snapshotObject.sha256 ||
    (await sha256Hex(artifacts.snapshotObject.body)) !==
      artifacts.snapshotObject.sha256
  ) {
    throw new Error("Stops snapshot integrity validation failed");
  }
  const snapshot = stopsSnapshotSchema.parse(
    JSON.parse(new TextDecoder().decode(artifacts.snapshotObject.body))
  );
  if (snapshot.snapshotVersion !== manifest.currentVersion) {
    throw new Error("Stops snapshot version does not match the manifest");
  }
  if (
    (await sha256Hex(artifacts.manifestObject.body)) !== artifacts.manifestHash
  ) {
    throw new Error("Stops manifest integrity validation failed");
  }
}

/** Publishes the immutable snapshot first so the manifest is never dangling. */
export async function publishStopsArtifacts(
  artifacts: BuiltStopsArtifacts,
  publisher: StopsPublisher
): Promise<void> {
  await validateStopsArtifacts(artifacts);
  await publisher.put(artifacts.snapshotObject);
  await publisher.put(artifacts.manifestObject);
}
