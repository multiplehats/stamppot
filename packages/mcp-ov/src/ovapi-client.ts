import { z } from "zod";
import {
  type GetStopDeparturesInput,
  MAX_UPSTREAM_TEXT_CHARACTERS,
  type StopDeparture,
  stopDepartureSchema,
  UnknownStopError,
  UpstreamUnavailableError,
} from "./contracts";
import type {
  OvCallContext,
  StopDeparturesResult,
  StopDeparturesService,
} from "./operations";
import { OVAPI_BASE_URL } from "./stops-format";
import {
  boundedList,
  DEPARTURES_CACHE_TTL_SECONDS,
  fetchUpstreamJson,
  globalUpstreamFetch,
  normalizeLocalWallClock,
  OVAPI_TIMEOUT_MS,
  optionalField,
  trimUpstreamText,
  type UpstreamCache,
  type UpstreamFetch,
  UpstreamStatusError,
} from "./upstream";

const MAX_UPSTREAM_ITEMS = 500;
/** Present-or-absent passthrough: every upstream field is read defensively. */
const looseValue = z.unknown().optional();

const ovPassSchema = z
  .object({
    DestinationName50: looseValue,
    ExpectedDepartureTime: looseValue,
    LineName: looseValue,
    LinePublicNumber: looseValue,
    OperatorCode: looseValue,
    TargetDepartureTime: looseValue,
    TimingPointCode: looseValue,
    TimingPointName: looseValue,
    TransportType: looseValue,
    TripStopStatus: looseValue,
  })
  .loose();

const ovStopSchema = z
  .object({
    TimingPointCode: looseValue,
    TimingPointName: looseValue,
    TimingPointTown: looseValue,
  })
  .loose();

const ovTimingPointSchema = z
  .object({
    Passes: z.record(z.string(), ovPassSchema).optional(),
    Stop: ovStopSchema.optional(),
  })
  .loose();

/** `{ stopAreaCode: { timingPointCode: { Stop, Passes } } }`. */
const ovStopAreaResponseSchema = z.record(
  z.string(),
  z.record(z.string(), ovTimingPointSchema)
);

export interface OvApiClientOptions {
  readonly baseUrl?: string;
  readonly cache: UpstreamCache;
  readonly fetchImplementation?: UpstreamFetch;
}

function text(value: unknown): string | undefined {
  return trimUpstreamText(value, MAX_UPSTREAM_TEXT_CHARACTERS);
}

function stopDeparture(
  pass: z.output<typeof ovPassSchema>,
  fallbackTimingPointCode: string
): StopDeparture | undefined {
  const destination = text(pass.DestinationName50);
  if (destination === undefined) {
    return undefined;
  }
  return stopDepartureSchema.parse({
    destination,
    ...optionalField(
      "expectedDepartureLocal",
      normalizeLocalWallClock(pass.ExpectedDepartureTime)
    ),
    ...optionalField("lineName", text(pass.LineName)),
    ...optionalField("lineNumber", text(pass.LinePublicNumber)),
    ...optionalField("operatorCode", text(pass.OperatorCode)),
    ...optionalField(
      "plannedDepartureLocal",
      normalizeLocalWallClock(pass.TargetDepartureTime)
    ),
    timingPointCode: (
      text(pass.TimingPointCode) ?? fallbackTimingPointCode
    ).slice(0, 40),
    ...optionalField("timingPointName", text(pass.TimingPointName)),
    ...optionalField("transportType", text(pass.TransportType)),
    ...optionalField("tripStopStatus", text(pass.TripStopStatus)),
  });
}

function departureOrder(left: StopDeparture, right: StopDeparture): number {
  const leftTime =
    left.expectedDepartureLocal ?? left.plannedDepartureLocal ?? "";
  const rightTime =
    right.expectedDepartureLocal ?? right.plannedDepartureLocal ?? "";
  if (leftTime !== rightTime) {
    return leftTime < rightTime ? -1 : 1;
  }
  if (left.timingPointCode !== right.timingPointCode) {
    return left.timingPointCode < right.timingPointCode ? -1 : 1;
  }
  return left.destination < right.destination ? -1 : 1;
}

export class OvApiClient implements StopDeparturesService {
  readonly #baseUrl: string;
  readonly #cache: UpstreamCache;
  readonly #fetchImplementation: UpstreamFetch;

  constructor(options: OvApiClientOptions) {
    this.#baseUrl = options.baseUrl ?? OVAPI_BASE_URL;
    this.#cache = options.cache;
    this.#fetchImplementation =
      options.fetchImplementation ?? globalUpstreamFetch;
  }

  async departures(
    input: GetStopDeparturesInput,
    context: OvCallContext
  ): Promise<StopDeparturesResult> {
    const code = input.stopAreaCode.trim();
    const url = `${this.#baseUrl}/stopareacode/${encodeURIComponent(code)}`;
    const value = await this.#read(url, context);
    const parsed = ovStopAreaResponseSchema.safeParse(value);
    if (!parsed.success) {
      throw new UpstreamUnavailableError();
    }

    // OVapi answers an unknown code with 200 and an empty object rather than
    // a 404, and it echoes the requested code as the single top-level key.
    const timingPoints = parsed.data[code] ?? Object.values(parsed.data)[0];
    if (timingPoints === undefined || Object.keys(timingPoints).length === 0) {
      throw new UnknownStopError();
    }

    const departures: StopDeparture[] = [];
    let stopName: string | undefined;
    let stopTown: string | undefined;
    for (const [timingPointCode, timingPoint] of boundedList(
      Object.entries(timingPoints),
      MAX_UPSTREAM_ITEMS
    )) {
      stopName ??= text(timingPoint.Stop?.TimingPointName);
      stopTown ??= text(timingPoint.Stop?.TimingPointTown);
      for (const pass of boundedList(
        Object.values(timingPoint.Passes ?? {}),
        MAX_UPSTREAM_ITEMS
      )) {
        const departure = stopDeparture(pass, timingPointCode);
        if (departure !== undefined) {
          departures.push(departure);
        }
      }
    }
    departures.sort(departureOrder);

    return {
      departures: departures.slice(0, input.limit),
      observedAt: context.now.toISOString(),
      ...optionalField("stopName", stopName),
      ...optionalField("stopTown", stopTown),
    };
  }

  async #read(url: string, context: OvCallContext): Promise<unknown> {
    try {
      return await fetchUpstreamJson({
        cache: this.#cache,
        fetchImplementation: this.#fetchImplementation,
        signal: context.signal,
        timeoutMs: OVAPI_TIMEOUT_MS,
        ttlSeconds: DEPARTURES_CACHE_TTL_SECONDS,
        url,
      });
    } catch (error) {
      if (context.signal.aborted) {
        throw error;
      }
      if (error instanceof UpstreamStatusError && error.status === 404) {
        // biome-ignore lint/style/useErrorCause: Upstream detail must not reach a public error.
        throw new UnknownStopError();
      }
      if (error instanceof UpstreamUnavailableError) {
        throw error;
      }
      // biome-ignore lint/style/useErrorCause: Upstream detail must not reach a public error.
      throw new UpstreamUnavailableError();
    }
  }
}
