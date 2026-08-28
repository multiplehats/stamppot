import {
  type FindOvStopInput,
  type FindOvStopSuccess,
  findOvStopOutputSchema,
  NS_PROVENANCE,
  OVAPI_PROVENANCE,
  type OvStop,
  StopDirectoryUnavailableError,
} from "./contracts";
import type { OvCallContext, StopDirectoryService } from "./operations";
import {
  MAX_STOPS_OBJECT_BYTES,
  normalizeSearchText,
  STOP_AREA_KIND,
  STOPS_MANIFEST_KEY,
  type StopRecord,
  type StopsManifest,
  type StopsSnapshot,
  searchTokens,
  stopsManifestSchema,
  stopsSnapshotSchema,
  TRAIN_STATION_KIND,
} from "./stops-format";

const TRAIN_TOOLS = [
  "plan_train_journey",
  "get_train_departures",
  "get_rail_disruptions",
] as const;
const STOP_AREA_TOOLS = ["get_stop_departures"] as const;
const textDecoder = new TextDecoder();

export interface StopsObjectStore {
  readonly getJson: (key: string, signal?: AbortSignal) => Promise<unknown>;
}

export class MemoryStopsObjectStore implements StopsObjectStore {
  readonly reads: string[] = [];
  readonly #objects: Map<string, unknown>;

  constructor(entries: Iterable<readonly [string, unknown]> = []) {
    this.#objects = new Map(entries);
  }

  static fromArtifacts(artifacts: {
    readonly objects: readonly {
      readonly body: Uint8Array;
      readonly key: string;
    }[];
  }): MemoryStopsObjectStore {
    return new MemoryStopsObjectStore(
      artifacts.objects.map((object) => [
        object.key,
        JSON.parse(textDecoder.decode(object.body)) as unknown,
      ])
    );
  }

  getJson(key: string, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    this.reads.push(key);
    return Promise.resolve(this.#objects.get(key));
  }

  deleteJson(key: string): void {
    this.#objects.delete(key);
  }

  setJson(key: string, value: unknown): void {
    this.#objects.set(key, value);
  }
}

interface RankedStop {
  readonly rank: number;
  readonly reason: string;
  readonly record: StopRecord;
}

function throwDirectoryUnavailable(): never {
  throw new StopDirectoryUnavailableError();
}

function matchStop(
  record: StopRecord,
  normalizedQuery: string,
  queryTokens: readonly string[]
): Omit<RankedStop, "record"> | undefined {
  const [, , , , recordText] = record;
  if (recordText === normalizedQuery) {
    return {
      rank: 0,
      reason: "De genormaliseerde haltenaam is exact gelijk aan de zoekterm.",
    };
  }
  const recordTokens = recordText.split(" ");
  const everyTokenPresent = queryTokens.every((token) =>
    recordTokens.includes(token)
  );
  if (everyTokenPresent) {
    return {
      rank: 1,
      reason: "Elk woord uit de zoekterm komt voor in de haltenaam.",
    };
  }
  const everyTokenPrefixes = queryTokens.every((token) =>
    recordTokens.some((recordToken) => recordToken.startsWith(token))
  );
  if (everyTokenPrefixes) {
    return {
      rank: 2,
      reason:
        "Elk woord uit de zoekterm is het begin van een woord in de haltenaam.",
    };
  }
  return undefined;
}

function compareRanked(left: RankedStop, right: RankedStop): number {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }
  const [, leftCode, , , leftText] = left.record;
  const [, rightCode, , , rightText] = right.record;
  const leftLength = leftText.length;
  const rightLength = rightText.length;
  if (leftLength !== rightLength) {
    return leftLength - rightLength;
  }
  const [leftKind] = left.record;
  const [rightKind] = right.record;
  if (leftKind !== rightKind) {
    return leftKind - rightKind;
  }
  return leftCode < rightCode ? -1 : 1;
}

function publicStop(ranked: RankedStop): OvStop {
  const [kindCode, code, name, town] = ranked.record;
  const isStation = kindCode === TRAIN_STATION_KIND;
  return {
    code,
    kind: isStation ? "train_station" : "stop_area",
    matchReason: ranked.reason,
    name,
    town,
    usableWith: isStation ? [...TRAIN_TOOLS] : [...STOP_AREA_TOOLS],
  };
}

export class StopDirectory implements StopDirectoryService {
  readonly #store: StopsObjectStore;
  /**
   * A published snapshot is immutable, so parsing one costs the isolate roughly
   * ten milliseconds of CPU that every later call can skip. The manifest is
   * still read on every call, so publishing a new version takes effect on the
   * next request rather than on the next isolate.
   */
  #parsed: { snapshot: StopsSnapshot; version: string } | undefined;

  constructor(store: StopsObjectStore) {
    this.#store = store;
  }

  async search(
    input: FindOvStopInput,
    context: OvCallContext
  ): Promise<FindOvStopSuccess> {
    const manifest = await this.#manifest(context);
    const snapshot = await this.#snapshot(manifest, context);
    const normalizedQuery = normalizeSearchText(input.query);
    const queryTokens = searchTokens(input.query);
    const wantedKinds =
      input.kinds === undefined
        ? undefined
        : new Set(
            input.kinds.map((kind) =>
              kind === "train_station" ? TRAIN_STATION_KIND : STOP_AREA_KIND
            )
          );

    const ranked: RankedStop[] = [];
    if (queryTokens.length > 0) {
      for (const record of snapshot.records) {
        const [kindCode] = record;
        if (wantedKinds !== undefined && !wantedKinds.has(kindCode)) {
          continue;
        }
        const match = matchStop(record, normalizedQuery, queryTokens);
        if (match !== undefined) {
          ranked.push({ ...match, record });
        }
      }
      ranked.sort(compareRanked);
    }

    return findOvStopOutputSchema.parse({
      observedAt: manifest.observedAt,
      snapshotVersion: manifest.currentVersion,
      sources: [NS_PROVENANCE, OVAPI_PROVENANCE],
      status: "ok",
      stops: ranked.slice(0, input.limit).map(publicStop),
    }) as FindOvStopSuccess;
  }

  async #manifest(context: OvCallContext): Promise<StopsManifest> {
    let value: unknown;
    try {
      value = await this.#store.getJson(STOPS_MANIFEST_KEY, context.signal);
    } catch (error) {
      if (context.signal.aborted) {
        throw error;
      }
      return throwDirectoryUnavailable();
    }
    const parsed = stopsManifestSchema.safeParse(value);
    return parsed.success ? parsed.data : throwDirectoryUnavailable();
  }

  async #snapshot(
    manifest: StopsManifest,
    context: OvCallContext
  ): Promise<StopsSnapshot> {
    if (this.#parsed?.version === manifest.currentVersion) {
      return this.#parsed.snapshot;
    }
    if (manifest.snapshot.byteLength > MAX_STOPS_OBJECT_BYTES) {
      return throwDirectoryUnavailable();
    }
    let value: unknown;
    try {
      value = await this.#store.getJson(manifest.snapshot.key, context.signal);
    } catch (error) {
      if (context.signal.aborted) {
        throw error;
      }
      return throwDirectoryUnavailable();
    }
    const parsed = stopsSnapshotSchema.safeParse(value);
    if (
      !parsed.success ||
      parsed.data.snapshotVersion !== manifest.currentVersion
    ) {
      return throwDirectoryUnavailable();
    }
    this.#parsed = { snapshot: parsed.data, version: manifest.currentVersion };
    return parsed.data;
  }
}
