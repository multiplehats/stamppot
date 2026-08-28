import { z } from "zod";
import {
  type GetRailDisruptionsInput,
  type GetTrainDeparturesInput,
  MAX_DISRUPTIONS,
  MAX_JOURNEY_LEGS,
  MAX_TRAIN_DEPARTURES,
  MAX_UPSTREAM_ADVICES,
  MAX_UPSTREAM_MESSAGES,
  MAX_UPSTREAM_TEXT_CHARACTERS,
  type PlanTrainJourneyInput,
  type RailDisruption,
  railDisruptionSchema,
  type TrainDeparture,
  type TrainJourney,
  trainDepartureSchema,
  trainJourneySchema,
  UnknownStationError,
  UpstreamUnavailableError,
} from "./contracts";
import type {
  OvCallContext,
  RailDisruptionsResult,
  TrainDeparturesResult,
  TrainJourneysResult,
  TrainTravelService,
} from "./operations";
import { NS_BASE_URL } from "./stops-format";
import {
  boundedList,
  DEPARTURES_CACHE_TTL_SECONDS,
  fetchUpstreamJson,
  globalUpstreamFetch,
  NS_TIMEOUT_MS,
  normalizeUpstreamInstant,
  optionalField,
  PLANNING_CACHE_TTL_SECONDS,
  trimUpstreamText,
  type UpstreamCache,
  type UpstreamFetch,
  UpstreamStatusError,
} from "./upstream";

const NS_API_KEY_HEADER = "Ocp-Apim-Subscription-Key";
/**
 * NS answers a rejected station parameter with 400 on the trip and departure
 * endpoints and with 404 on the per-station disruption endpoint. Every other
 * status is an availability problem, never a caller mistake.
 */
const UNKNOWN_STATION_STATUSES = new Set([400, 404]);
const MAX_UPSTREAM_ITEMS = 200;

/** Present-or-absent passthrough: every upstream field is read defensively. */
const looseText = z.unknown().optional();

const nsPointSchema = z
  .object({
    actualDateTime: looseText,
    actualTrack: looseText,
    name: looseText,
    plannedDateTime: looseText,
    plannedTrack: looseText,
  })
  .loose();

const nsProductSchema = z
  .object({
    categoryCode: looseText,
    displayName: looseText,
    longCategoryName: looseText,
    number: looseText,
    operatorName: looseText,
    shortCategoryName: looseText,
  })
  .loose();

const nsLegSchema = z
  .object({
    cancelled: looseText,
    destination: nsPointSchema.optional(),
    direction: looseText,
    origin: nsPointSchema.optional(),
    product: nsProductSchema.optional(),
  })
  .loose();

const nsTripSchema = z
  .object({
    actualDurationInMinutes: looseText,
    crowdForecast: looseText,
    legs: z.array(nsLegSchema).optional(),
    optimal: looseText,
    plannedDurationInMinutes: looseText,
    status: looseText,
    transfers: looseText,
  })
  .loose();

const nsTravelAdviceSchema = z
  .object({ trips: z.array(nsTripSchema).optional() })
  .loose();

/**
 * The published NS definition wraps the trip response in an array while the
 * live endpoint returns the object directly, so both shapes are accepted.
 */
const nsTripsResponseSchema = z.union([
  nsTravelAdviceSchema,
  z.array(nsTravelAdviceSchema),
]);

const nsMessageSchema = z.object({ head: looseText, text: looseText }).loose();

const nsDepartureSchema = z
  .object({
    actualDateTime: looseText,
    actualTrack: looseText,
    cancelled: looseText,
    departureStatus: looseText,
    direction: looseText,
    messages: z.array(nsMessageSchema).optional(),
    name: looseText,
    plannedDateTime: looseText,
    plannedTrack: looseText,
    product: nsProductSchema.optional(),
    trainCategory: looseText,
  })
  .loose();

const nsDeparturesResponseSchema = z
  .object({
    payload: z
      .object({ departures: z.array(nsDepartureSchema).optional() })
      .loose()
      .optional(),
  })
  .loose();

const nsLabelSchema = z.object({ label: looseText }).loose();

const nsTimespanSchema = z
  .object({
    advices: z.array(z.unknown()).optional(),
    cause: nsLabelSchema.optional(),
    end: looseText,
    situation: nsLabelSchema.optional(),
    start: looseText,
  })
  .loose();

const nsDisruptionSchema = z
  .object({
    end: looseText,
    expectedDuration: z.object({ description: looseText }).loose().optional(),
    id: looseText,
    isActive: looseText,
    phase: looseText,
    start: looseText,
    timespans: z.array(nsTimespanSchema).optional(),
    title: looseText,
    type: looseText,
  })
  .loose();

const nsDisruptionsResponseSchema = z.array(nsDisruptionSchema);

export interface NsClientOptions {
  readonly apiKey: () => string | undefined;
  readonly baseUrl?: string;
  readonly cache: UpstreamCache;
  readonly fetchImplementation?: UpstreamFetch;
}

function text(value: unknown): string | undefined {
  return trimUpstreamText(value, MAX_UPSTREAM_TEXT_CHARACTERS);
}

/** NS models several fields as either a plain string or a `{ label }` object. */
function labelText(value: unknown): string | undefined {
  if (typeof value === "object" && value !== null && "label" in value) {
    return text((value as { label: unknown }).label);
  }
  return text(value);
}

function boolean(value: unknown): boolean {
  return value === true;
}

function wholeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  const rounded = Math.round(value);
  return Number.isSafeInteger(rounded) ? rounded : undefined;
}

function stationCode(value: string): string {
  return value.trim().toUpperCase();
}

function journeyPoint(point: z.output<typeof nsPointSchema> | undefined) {
  const name = text(point?.name) ?? "Onbekend";
  return {
    ...optionalField(
      "actualDateTime",
      normalizeUpstreamInstant(point?.actualDateTime)
    ),
    ...optionalField("actualTrack", text(point?.actualTrack)),
    name,
    ...optionalField(
      "plannedDateTime",
      normalizeUpstreamInstant(point?.plannedDateTime)
    ),
    ...optionalField("plannedTrack", text(point?.plannedTrack)),
  };
}

function productCategory(
  product: z.output<typeof nsProductSchema> | undefined
): string | undefined {
  return (
    text(product?.longCategoryName) ??
    text(product?.shortCategoryName) ??
    text(product?.displayName) ??
    text(product?.categoryCode)
  );
}

function journeyLeg(leg: z.output<typeof nsLegSchema>) {
  return {
    cancelled: boolean(leg.cancelled),
    destination: journeyPoint(leg.destination),
    ...optionalField("direction", text(leg.direction)),
    ...optionalField("operatorName", text(leg.product?.operatorName)),
    origin: journeyPoint(leg.origin),
    ...optionalField("productCategory", productCategory(leg.product)),
    ...optionalField("productNumber", text(leg.product?.number)),
  };
}

function trainJourney(trip: z.output<typeof nsTripSchema>): TrainJourney {
  const legs = boundedList(trip.legs ?? [], MAX_UPSTREAM_ITEMS);
  const cancelled =
    legs.length > 0 && legs.every((leg) => boolean(leg.cancelled));
  return trainJourneySchema.parse({
    ...optionalField(
      "actualDurationInMinutes",
      wholeNumber(trip.actualDurationInMinutes)
    ),
    cancelled,
    ...optionalField("crowdForecast", text(trip.crowdForecast)),
    legs: legs.slice(0, MAX_JOURNEY_LEGS).map(journeyLeg),
    ...(typeof trip.optimal === "boolean" ? { optimal: trip.optimal } : {}),
    ...optionalField(
      "plannedDurationInMinutes",
      wholeNumber(trip.plannedDurationInMinutes)
    ),
    ...optionalField("status", text(trip.status)),
    ...optionalField("transfers", wholeNumber(trip.transfers)),
    truncatedLegCount: Math.max(0, legs.length - MAX_JOURNEY_LEGS),
  });
}

function trainDeparture(
  departure: z.output<typeof nsDepartureSchema>
): TrainDeparture {
  const messages = boundedList(
    departure.messages ?? [],
    MAX_UPSTREAM_ITEMS
  ).flatMap((message) => {
    const value = text(message.text) ?? text(message.head);
    return value === undefined ? [] : [value];
  });
  return trainDepartureSchema.parse({
    ...optionalField(
      "actualDateTime",
      normalizeUpstreamInstant(departure.actualDateTime)
    ),
    ...optionalField("actualTrack", text(departure.actualTrack)),
    cancelled: boolean(departure.cancelled),
    ...optionalField("departureStatus", text(departure.departureStatus)),
    direction: text(departure.direction) ?? "Onbekende bestemming",
    messages: messages.slice(0, MAX_UPSTREAM_MESSAGES),
    ...optionalField("name", text(departure.name)),
    ...optionalField("operatorName", text(departure.product?.operatorName)),
    ...optionalField(
      "plannedDateTime",
      normalizeUpstreamInstant(departure.plannedDateTime)
    ),
    ...optionalField("plannedTrack", text(departure.plannedTrack)),
    ...optionalField("trainCategory", text(departure.trainCategory)),
  });
}

function railDisruption(
  disruption: z.output<typeof nsDisruptionSchema>
): RailDisruption | undefined {
  const id = text(disruption.id);
  const title = text(disruption.title);
  const type = text(disruption.type);
  const isKnownType =
    type === "CALAMITY" || type === "DISRUPTION" || type === "MAINTENANCE";
  if (id === undefined || title === undefined || !isKnownType) {
    return undefined;
  }
  const [timespan] = boundedList(
    disruption.timespans ?? [],
    MAX_UPSTREAM_ITEMS
  );
  const advices = boundedList(timespan?.advices ?? [], MAX_UPSTREAM_ITEMS)
    .flatMap((advice) => {
      const value = text(advice);
      return value === undefined ? [] : [value];
    })
    .slice(0, MAX_UPSTREAM_ADVICES);
  return railDisruptionSchema.parse({
    advices,
    ...optionalField("cause", labelText(timespan?.cause)),
    ...optionalField(
      "end",
      normalizeUpstreamInstant(disruption.end) ??
        normalizeUpstreamInstant(timespan?.end)
    ),
    ...optionalField(
      "expectedDuration",
      text(disruption.expectedDuration?.description)
    ),
    id: id.slice(0, 200),
    isActive: boolean(disruption.isActive),
    ...optionalField("phase", labelText(disruption.phase)),
    ...optionalField("situation", labelText(timespan?.situation)),
    ...optionalField(
      "start",
      normalizeUpstreamInstant(disruption.start) ??
        normalizeUpstreamInstant(timespan?.start)
    ),
    title,
    type,
  });
}

export class NsClient implements TrainTravelService {
  readonly #apiKey: () => string | undefined;
  readonly #baseUrl: string;
  readonly #cache: UpstreamCache;
  readonly #fetchImplementation: UpstreamFetch;

  constructor(options: NsClientOptions) {
    this.#apiKey = options.apiKey;
    this.#baseUrl = options.baseUrl ?? NS_BASE_URL;
    this.#cache = options.cache;
    this.#fetchImplementation =
      options.fetchImplementation ?? globalUpstreamFetch;
  }

  async planJourney(
    input: PlanTrainJourneyInput,
    context: OvCallContext
  ): Promise<TrainJourneysResult> {
    const url = new URL(`${this.#baseUrl}/api/v3/trips`);
    url.searchParams.set("fromStation", stationCode(input.fromStation));
    url.searchParams.set("toStation", stationCode(input.toStation));
    if (input.viaStation !== undefined) {
      url.searchParams.set("viaStation", stationCode(input.viaStation));
    }
    if (input.dateTime !== undefined) {
      url.searchParams.set("dateTime", input.dateTime);
      url.searchParams.set(
        "searchForArrival",
        input.searchForArrival ? "true" : "false"
      );
    }
    url.searchParams.set("lang", "nl");

    const value = await this.#read(
      url.toString(),
      PLANNING_CACHE_TTL_SECONDS,
      context
    );
    const parsed = nsTripsResponseSchema.safeParse(value);
    if (!parsed.success) {
      throw new UpstreamUnavailableError();
    }
    const advice = Array.isArray(parsed.data) ? parsed.data[0] : parsed.data;
    const trips = boundedList(advice?.trips ?? [], MAX_UPSTREAM_ITEMS);
    return {
      journeys: trips.slice(0, input.limit).map(trainJourney),
      observedAt: context.now.toISOString(),
    };
  }

  async departures(
    input: GetTrainDeparturesInput,
    context: OvCallContext
  ): Promise<TrainDeparturesResult> {
    const url = new URL(`${this.#baseUrl}/api/v2/departures`);
    url.searchParams.set("station", stationCode(input.station));
    url.searchParams.set("maxJourneys", String(MAX_TRAIN_DEPARTURES));
    if (input.dateTime !== undefined) {
      url.searchParams.set("dateTime", input.dateTime);
    }
    url.searchParams.set("lang", "nl");

    const value = await this.#read(
      url.toString(),
      DEPARTURES_CACHE_TTL_SECONDS,
      context
    );
    const parsed = nsDeparturesResponseSchema.safeParse(value);
    if (!parsed.success) {
      throw new UpstreamUnavailableError();
    }
    const departures = boundedList(
      parsed.data.payload?.departures ?? [],
      MAX_UPSTREAM_ITEMS
    );
    return {
      departures: departures.slice(0, input.limit).map(trainDeparture),
      observedAt: context.now.toISOString(),
    };
  }

  async disruptions(
    input: GetRailDisruptionsInput,
    context: OvCallContext
  ): Promise<RailDisruptionsResult> {
    const path =
      input.station === undefined
        ? "/api/v3/disruptions"
        : `/api/v3/disruptions/station/${encodeURIComponent(stationCode(input.station))}`;
    const url = new URL(`${this.#baseUrl}${path}`);
    if (input.station === undefined) {
      url.searchParams.set("isActive", input.activeOnly ? "true" : "false");
    }

    const value = await this.#read(
      url.toString(),
      PLANNING_CACHE_TTL_SECONDS,
      context
    );
    const parsed = nsDisruptionsResponseSchema.safeParse(value);
    if (!parsed.success) {
      throw new UpstreamUnavailableError();
    }
    const wantedTypes =
      input.types === undefined ? undefined : new Set<string>(input.types);
    const disruptions = boundedList(parsed.data, MAX_UPSTREAM_ITEMS)
      .flatMap((entry) => {
        const mapped = railDisruption(entry);
        return mapped === undefined ? [] : [mapped];
      })
      .filter((entry) => !input.activeOnly || entry.isActive)
      .filter(
        (entry) => wantedTypes === undefined || wantedTypes.has(entry.type)
      );
    return {
      disruptions: disruptions.slice(0, MAX_DISRUPTIONS),
      observedAt: context.now.toISOString(),
    };
  }

  async #read(
    url: string,
    ttlSeconds: number,
    context: OvCallContext
  ): Promise<unknown> {
    const apiKey = this.#apiKey();
    if (apiKey === undefined || apiKey === "") {
      throw new UpstreamUnavailableError();
    }
    try {
      return await fetchUpstreamJson({
        cache: this.#cache,
        fetchImplementation: this.#fetchImplementation,
        headers: { [NS_API_KEY_HEADER]: apiKey },
        signal: context.signal,
        timeoutMs: NS_TIMEOUT_MS,
        ttlSeconds,
        url,
      });
    } catch (error) {
      if (context.signal.aborted) {
        throw error;
      }
      if (
        error instanceof UpstreamStatusError &&
        UNKNOWN_STATION_STATUSES.has(error.status)
      ) {
        // biome-ignore lint/style/useErrorCause: Upstream detail must not reach a public error.
        throw new UnknownStationError();
      }
      if (error instanceof UpstreamUnavailableError) {
        throw error;
      }
      // biome-ignore lint/style/useErrorCause: Upstream detail must not reach a public error.
      throw new UpstreamUnavailableError();
    }
  }
}
