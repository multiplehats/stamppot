import { z } from "zod";
import {
  MAX_STOP_NAME_CHARACTERS,
  NS_SOURCE,
  OVAPI_SOURCE,
} from "./stops-format";

export const MAX_STOP_QUERY_CHARACTERS = 120;
export const MAX_STOP_RESULTS = 10;
export const MAX_TRAIN_JOURNEYS = 6;
export const MAX_JOURNEY_LEGS = 8;
export const MAX_TRAIN_DEPARTURES = 15;
export const MAX_STOP_DEPARTURES = 15;
export const MAX_DISRUPTIONS = 20;
export const MAX_UPSTREAM_TEXT_CHARACTERS = 300;
export const MAX_UPSTREAM_ADVICES = 5;
export const MAX_UPSTREAM_MESSAGES = 5;
export const UPSTREAM_RETRY_AFTER_SECONDS = 60;

const AMSTERDAM_TIME_ZONE = "Europe/Amsterdam";
const STATION_CODE_PATTERN = /^[A-Za-z0-9]{2,10}$/;
const STOP_AREA_CODE_PATTERN = /^[A-Za-z0-9_-]{2,20}$/;

/** The upstream answered too slowly, unreachably, or with an unusable body. */
export class UpstreamUnavailableError extends Error {
  constructor() {
    super("Public transport upstream is unavailable");
    this.name = "UpstreamUnavailableError";
  }
}

/** NS rejected the supplied station code. */
export class UnknownStationError extends Error {
  constructor() {
    super("Train station code is unknown");
    this.name = "UnknownStationError";
  }
}

/** OVapi returned no stop area for the supplied code. */
export class UnknownStopError extends Error {
  constructor() {
    super("Stop area code is unknown");
    this.name = "UnknownStopError";
  }
}

/** The published stops snapshot is missing or corrupt. */
export class StopDirectoryUnavailableError extends Error {
  constructor() {
    super("Stop directory is unavailable");
    this.name = "StopDirectoryUnavailableError";
  }
}

export const stopQuerySchema = z
  .string()
  .trim()
  .min(2)
  .max(MAX_STOP_QUERY_CHARACTERS)
  .describe(
    "Place or stop name to resolve, for example 'amsterdam centraal' or 'utrecht jaarbeurs'. Leading and trailing whitespace is removed; use 2-120 characters."
  );

export const stationCodeSchema = z
  .string()
  .trim()
  .regex(STATION_CODE_PATTERN)
  .describe(
    "NS station code of 2-10 letters or digits, for example 'asd' for Amsterdam Centraal. Resolve it with find_ov_stop first; matching is case-insensitive."
  );

export const stopAreaCodeSchema = z
  .string()
  .trim()
  .regex(STOP_AREA_CODE_PATTERN)
  .describe(
    "OVapi stop-area code of 2-20 letters, digits, hyphens or underscores, for example '09500'. Resolve it with find_ov_stop first; the code is case-sensitive."
  );

export const stopKindSchema = z
  .enum(["train_station", "stop_area"])
  .describe(
    "Either an NS train station usable with the train tools, or a bus, tram or metro stop area usable with get_stop_departures."
  );

export const nsSourceSchema = z
  .object({
    licence: z.literal(NS_SOURCE.licence),
    name: z.literal(NS_SOURCE.name),
    official: z.literal(true),
    url: z.literal(NS_SOURCE.url),
  })
  .strict();

export const ovApiSourceSchema = z
  .object({
    licence: z.literal(OVAPI_SOURCE.licence),
    name: z.literal(OVAPI_SOURCE.name),
    note: z.literal(OVAPI_SOURCE.note),
    official: z.literal(false),
    url: z.literal(OVAPI_SOURCE.url),
  })
  .strict();

export const NS_PROVENANCE = {
  licence: NS_SOURCE.licence,
  name: NS_SOURCE.name,
  official: true,
  url: NS_SOURCE.url,
} as const;

export const OVAPI_PROVENANCE = {
  licence: OVAPI_SOURCE.licence,
  name: OVAPI_SOURCE.name,
  note: OVAPI_SOURCE.note,
  official: false,
  url: OVAPI_SOURCE.url,
} as const;

const upstreamTextSchema = z.string().min(1).max(MAX_UPSTREAM_TEXT_CHARACTERS);
const optionalUpstreamTextSchema = upstreamTextSchema.optional();
const upstreamInstantSchema = z.string().datetime({ offset: true });
const localWallClockSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/);

export const findOvStopInputSchema = z
  .object({
    kinds: z
      .array(stopKindSchema)
      .min(1)
      .max(2)
      .refine((kinds) => new Set(kinds).size === kinds.length, {
        message: "Stop kinds must be unique",
      })
      .optional()
      .describe(
        "Optional filter on stop kind. Omit it to search train stations and stop areas together."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_STOP_RESULTS)
      .default(MAX_STOP_RESULTS)
      .describe(
        "Maximum relevance-ranked stops to return, from 1 through 10. Defaults to 10."
      ),
    query: stopQuerySchema,
  })
  .strict();

export const ovStopSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .max(20)
      .describe(
        "Code to pass to the follow-up tool named in usableWith. Never guess this value."
      ),
    kind: stopKindSchema,
    matchReason: upstreamTextSchema.describe(
      "Why this stop matched the query, so an agent can explain an ambiguous choice."
    ),
    name: z.string().min(1).max(MAX_STOP_NAME_CHARACTERS),
    town: z.string().max(MAX_STOP_NAME_CHARACTERS),
    usableWith: z
      .array(z.string().min(1).max(40))
      .min(1)
      .max(3)
      .describe(
        "Names of the tools that accept this code. A stop-area code is never valid for a train tool and the reverse."
      ),
  })
  .strict();

export const findOvStopOutputSchema = z
  .object({
    observedAt: upstreamInstantSchema.optional(),
    retryable: z.boolean().optional(),
    snapshotVersion: z.string().min(1).max(200).optional(),
    sources: z.array(z.union([nsSourceSchema, ovApiSourceSchema])).optional(),
    status: z.enum(["ok", "directory_unavailable"]),
    stops: z.array(ovStopSchema).max(MAX_STOP_RESULTS).optional(),
  })
  .strict();

export const planTrainJourneyInputSchema = z
  .object({
    dateTime: upstreamInstantSchema
      .optional()
      .describe(
        "Optional ISO 8601 instant with offset, for example 2026-08-28T14:00:00+02:00. Omit it to plan from now."
      ),
    fromStation: stationCodeSchema.describe(
      "Origin NS station code. Resolve a place name with find_ov_stop first."
    ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_TRAIN_JOURNEYS)
      .default(MAX_TRAIN_JOURNEYS)
      .describe(
        "Maximum journeys to return, from 1 through 6. Defaults to 6; NS decides which journeys those are."
      ),
    searchForArrival: z
      .boolean()
      .default(false)
      .describe(
        "Treat dateTime as the desired arrival time instead of the departure time. Defaults to false."
      ),
    toStation: stationCodeSchema.describe("Destination NS station code."),
    viaStation: stationCodeSchema
      .optional()
      .describe("Optional intermediate NS station code the journey must use."),
  })
  .strict();

export const journeyPointSchema = z
  .object({
    actualDateTime: upstreamInstantSchema.optional(),
    actualTrack: optionalUpstreamTextSchema,
    name: upstreamTextSchema,
    plannedDateTime: upstreamInstantSchema.optional(),
    plannedTrack: optionalUpstreamTextSchema,
  })
  .strict();

export const journeyLegSchema = z
  .object({
    cancelled: z.boolean(),
    destination: journeyPointSchema,
    direction: optionalUpstreamTextSchema,
    operatorName: optionalUpstreamTextSchema,
    origin: journeyPointSchema,
    productCategory: optionalUpstreamTextSchema,
    productNumber: optionalUpstreamTextSchema,
  })
  .strict();

export const trainJourneySchema = z
  .object({
    actualDurationInMinutes: z.number().int().nonnegative().safe().optional(),
    cancelled: z.boolean(),
    crowdForecast: optionalUpstreamTextSchema,
    legs: z.array(journeyLegSchema).max(MAX_JOURNEY_LEGS),
    optimal: z.boolean().optional(),
    plannedDurationInMinutes: z.number().int().nonnegative().safe().optional(),
    status: optionalUpstreamTextSchema,
    transfers: z.number().int().nonnegative().safe().optional(),
    truncatedLegCount: z.number().int().nonnegative().safe(),
  })
  .strict();

const upstreamFailureShape = {
  retryAfterSeconds: z.literal(UPSTREAM_RETRY_AFTER_SECONDS).optional(),
  retryable: z.boolean().optional(),
} as const;

export const planTrainJourneyOutputSchema = z
  .object({
    ...upstreamFailureShape,
    journeys: z.array(trainJourneySchema).max(MAX_TRAIN_JOURNEYS).optional(),
    observedAt: upstreamInstantSchema.optional(),
    source: nsSourceSchema.optional(),
    status: z.enum([
      "ok",
      "unknown_station",
      "upstream_unavailable",
      "rate_limited",
    ]),
  })
  .strict();

export const getTrainDeparturesInputSchema = z
  .object({
    dateTime: upstreamInstantSchema
      .optional()
      .describe(
        "Optional ISO 8601 instant with offset to list departures from. Omit it to list departures from now."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_TRAIN_DEPARTURES)
      .default(MAX_TRAIN_DEPARTURES)
      .describe(
        "Maximum departures to return, from 1 through 15. Defaults to 15."
      ),
    station: stationCodeSchema.describe(
      "NS station code to read the departure board of."
    ),
  })
  .strict();

export const trainDepartureSchema = z
  .object({
    actualDateTime: upstreamInstantSchema.optional(),
    actualTrack: optionalUpstreamTextSchema,
    cancelled: z.boolean(),
    departureStatus: optionalUpstreamTextSchema,
    direction: upstreamTextSchema,
    messages: z.array(upstreamTextSchema).max(MAX_UPSTREAM_MESSAGES),
    name: optionalUpstreamTextSchema,
    operatorName: optionalUpstreamTextSchema,
    plannedDateTime: upstreamInstantSchema.optional(),
    plannedTrack: optionalUpstreamTextSchema,
    trainCategory: optionalUpstreamTextSchema,
  })
  .strict();

export const getTrainDeparturesOutputSchema = z
  .object({
    ...upstreamFailureShape,
    departures: z
      .array(trainDepartureSchema)
      .max(MAX_TRAIN_DEPARTURES)
      .optional(),
    observedAt: upstreamInstantSchema.optional(),
    source: nsSourceSchema.optional(),
    status: z.enum([
      "ok",
      "unknown_station",
      "upstream_unavailable",
      "rate_limited",
    ]),
  })
  .strict();

export const disruptionTypeSchema = z.enum([
  "CALAMITY",
  "DISRUPTION",
  "MAINTENANCE",
]);

export const getRailDisruptionsInputSchema = z
  .object({
    activeOnly: z
      .boolean()
      .default(true)
      .describe(
        "Return only disruptions that are happening now. Defaults to true; set it to false to include planned maintenance."
      ),
    station: stationCodeSchema
      .optional()
      .describe(
        "Optional NS station code. Omit it for the national list; supplying it returns the disruptions NS publishes for that station."
      ),
    types: z
      .array(disruptionTypeSchema)
      .min(1)
      .max(3)
      .refine((types) => new Set(types).size === types.length, {
        message: "Disruption types must be unique",
      })
      .optional()
      .describe(
        "Optional filter on disruption type. Omit it to return every type."
      ),
  })
  .strict();

export const railDisruptionSchema = z
  .object({
    advices: z.array(upstreamTextSchema).max(MAX_UPSTREAM_ADVICES),
    cause: optionalUpstreamTextSchema,
    end: upstreamInstantSchema.optional(),
    expectedDuration: optionalUpstreamTextSchema,
    id: z.string().min(1).max(200),
    isActive: z.boolean(),
    phase: optionalUpstreamTextSchema,
    situation: optionalUpstreamTextSchema,
    start: upstreamInstantSchema.optional(),
    title: upstreamTextSchema,
    type: disruptionTypeSchema,
  })
  .strict();

export const getRailDisruptionsOutputSchema = z
  .object({
    ...upstreamFailureShape,
    disruptions: z.array(railDisruptionSchema).max(MAX_DISRUPTIONS).optional(),
    observedAt: upstreamInstantSchema.optional(),
    source: nsSourceSchema.optional(),
    status: z.enum([
      "ok",
      "unknown_station",
      "upstream_unavailable",
      "rate_limited",
    ]),
  })
  .strict();

export const getStopDeparturesInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_STOP_DEPARTURES)
      .default(MAX_STOP_DEPARTURES)
      .describe(
        "Maximum departures to return, from 1 through 15. Defaults to 15."
      ),
    stopAreaCode: stopAreaCodeSchema.describe(
      "OVapi stop-area code to read. Resolve a stop name with find_ov_stop first."
    ),
  })
  .strict();

export const stopDepartureSchema = z
  .object({
    destination: upstreamTextSchema,
    expectedDepartureLocal: localWallClockSchema.optional(),
    lineName: optionalUpstreamTextSchema,
    lineNumber: optionalUpstreamTextSchema,
    operatorCode: optionalUpstreamTextSchema,
    plannedDepartureLocal: localWallClockSchema.optional(),
    timingPointCode: z.string().min(1).max(40),
    timingPointName: optionalUpstreamTextSchema,
    transportType: optionalUpstreamTextSchema,
    tripStopStatus: optionalUpstreamTextSchema,
  })
  .strict();

export const getStopDeparturesOutputSchema = z
  .object({
    ...upstreamFailureShape,
    departures: z
      .array(stopDepartureSchema)
      .max(MAX_STOP_DEPARTURES)
      .optional(),
    observedAt: upstreamInstantSchema.optional(),
    source: ovApiSourceSchema.optional(),
    status: z.enum([
      "ok",
      "unknown_stop",
      "upstream_unavailable",
      "rate_limited",
    ]),
    stopName: optionalUpstreamTextSchema,
    stopTown: optionalUpstreamTextSchema,
    timezone: z.literal(AMSTERDAM_TIME_ZONE).optional(),
  })
  .strict();

export type FindOvStopInput = z.output<typeof findOvStopInputSchema>;
export type OvStop = z.output<typeof ovStopSchema>;
export type FindOvStopSuccess = Omit<
  z.output<typeof findOvStopOutputSchema>,
  "retryable" | "status"
> & { readonly status: "ok" };
export type PlanTrainJourneyInput = z.output<
  typeof planTrainJourneyInputSchema
>;
export type TrainJourney = z.output<typeof trainJourneySchema>;
export type GetTrainDeparturesInput = z.output<
  typeof getTrainDeparturesInputSchema
>;
export type TrainDeparture = z.output<typeof trainDepartureSchema>;
export type GetRailDisruptionsInput = z.output<
  typeof getRailDisruptionsInputSchema
>;
export type RailDisruption = z.output<typeof railDisruptionSchema>;
export type GetStopDeparturesInput = z.output<
  typeof getStopDeparturesInputSchema
>;
export type StopDeparture = z.output<typeof stopDepartureSchema>;
