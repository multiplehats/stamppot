import { defineOperation, type Operation } from "@stamppot/core";
import {
  type UpstreamLimiter,
  UpstreamUnavailableError,
} from "@stamppot/upstream";
import {
  type FindOvStopInput,
  type FindOvStopSuccess,
  findOvStopInputSchema,
  findOvStopOutputSchema,
  type GetRailDisruptionsInput,
  type GetStopDeparturesInput,
  type GetTrainDeparturesInput,
  getRailDisruptionsInputSchema,
  getRailDisruptionsOutputSchema,
  getStopDeparturesInputSchema,
  getStopDeparturesOutputSchema,
  getTrainDeparturesInputSchema,
  getTrainDeparturesOutputSchema,
  NS_PROVENANCE,
  OVAPI_PROVENANCE,
  type PlanTrainJourneyInput,
  planTrainJourneyInputSchema,
  planTrainJourneyOutputSchema,
  type RailDisruption,
  type StopDeparture,
  StopDirectoryUnavailableError,
  type TrainDeparture,
  type TrainJourney,
  UnknownStationError,
  UnknownStopError,
  UPSTREAM_RETRY_AFTER_SECONDS,
} from "./contracts";

export interface OvCallContext {
  readonly now: Date;
  readonly signal: AbortSignal;
}

export interface TrainDeparturesResult {
  readonly departures: readonly TrainDeparture[];
  readonly observedAt: string;
}

export interface TrainJourneysResult {
  readonly journeys: readonly TrainJourney[];
  readonly observedAt: string;
}

export interface RailDisruptionsResult {
  readonly disruptions: readonly RailDisruption[];
  readonly observedAt: string;
}

export interface StopDeparturesResult {
  readonly departures: readonly StopDeparture[];
  readonly observedAt: string;
  readonly stopName?: string;
  readonly stopTown?: string;
}

export interface TrainTravelService {
  readonly departures: (
    input: GetTrainDeparturesInput,
    context: OvCallContext
  ) => Promise<TrainDeparturesResult>;
  readonly disruptions: (
    input: GetRailDisruptionsInput,
    context: OvCallContext
  ) => Promise<RailDisruptionsResult>;
  readonly planJourney: (
    input: PlanTrainJourneyInput,
    context: OvCallContext
  ) => Promise<TrainJourneysResult>;
}

export interface StopDeparturesService {
  readonly departures: (
    input: GetStopDeparturesInput,
    context: OvCallContext
  ) => Promise<StopDeparturesResult>;
}

export interface StopDirectoryService {
  readonly search: (
    input: FindOvStopInput,
    context: OvCallContext
  ) => Promise<FindOvStopSuccess>;
}

export type OvUpstreamLimiter = UpstreamLimiter;

export interface OvMcpDependencies {
  readonly stopDepartures: StopDeparturesService;
  readonly stopDirectory: StopDirectoryService;
  readonly trains: TrainTravelService;
  readonly upstreamLimiter: OvUpstreamLimiter;
}

const NS_TIMEZONE = "Europe/Amsterdam" as const;

type RetryAfterSeconds = typeof UPSTREAM_RETRY_AFTER_SECONDS;

function rateLimitedResult(): {
  retryAfterSeconds: RetryAfterSeconds;
  retryable: boolean;
  status: "rate_limited";
} {
  return {
    retryAfterSeconds: UPSTREAM_RETRY_AFTER_SECONDS,
    retryable: true,
    status: "rate_limited",
  };
}

function upstreamUnavailableResult(): {
  retryAfterSeconds: RetryAfterSeconds;
  retryable: boolean;
  status: "upstream_unavailable";
} {
  return {
    retryAfterSeconds: UPSTREAM_RETRY_AFTER_SECONDS,
    retryable: true,
    status: "upstream_unavailable",
  };
}

function unknownStationResult() {
  return {
    retryable: false,
    status: "unknown_station" as const,
  };
}

function unknownStopResult() {
  return {
    retryable: false,
    status: "unknown_stop" as const,
  };
}

function genericDependencyFailure(): Error {
  return new Error("Public transport operation dependency failed");
}

/**
 * Maps only the errors the contracts model. Anything else is replaced so no
 * upstream detail crosses this public boundary.
 */
function trainFailureResult(error: unknown) {
  if (error instanceof UnknownStationError) {
    return unknownStationResult();
  }
  if (error instanceof UpstreamUnavailableError) {
    return upstreamUnavailableResult();
  }
  throw genericDependencyFailure();
}

export function createOvOperations(
  dependencies: OvMcpDependencies
): readonly Operation[] {
  const findOvStop = defineOperation({
    description:
      "Zoek een Nederlandse treinstation- of haltecode op aan de hand van een plaats- of haltenaam. Dit is het startpunt van elke andere ov-tool: die accepteren alleen codes en nooit namen. Een treinstationcode werkt bij plan_train_journey, get_train_departures en get_rail_disruptions; een halteplaatscode uitsluitend bij get_stop_departures. De momentopname komt uit een gepubliceerde haltelijst en bevat geen actuele vertrektijden.",
    async execute(context, input) {
      try {
        return await dependencies.stopDirectory.search(input, {
          now: context.now(),
          signal: context.signal,
        });
      } catch (error) {
        if (error instanceof StopDirectoryUnavailableError) {
          return { retryable: true, status: "directory_unavailable" as const };
        }
        throw genericDependencyFailure();
      }
    },
    input: findOvStopInputSchema,
    name: "find_ov_stop",
    output: findOvStopOutputSchema,
    title: "Zoek een station- of haltecode (alleen-lezen)",
  });

  const planTrainJourney = defineOperation({
    description:
      "Plan een treinreis tussen twee Nederlandse stations met de officiële NS Reisinformatie API. Zoek beide stationscodes eerst op met find_ov_stop. Het antwoord geeft per reis de geplande en verwachte tijden, het aantal overstappen, de perrons en of een rit is uitgevallen. Tijden zijn ISO 8601 met offset. Resultaten zijn een momentopname van maximaal een minuut oud en zijn geen reservering, prijsopgave of vervoerbewijs.",
    async execute(context, input) {
      try {
        const isAllowed = await dependencies.upstreamLimiter.consume(
          context.request,
          "trains"
        );
        if (!isAllowed) {
          return rateLimitedResult();
        }
        const result = await dependencies.trains.planJourney(input, {
          now: context.now(),
          signal: context.signal,
        });
        const journeys: TrainJourney[] = [...result.journeys];
        return {
          journeys,
          observedAt: result.observedAt,
          source: NS_PROVENANCE,
          status: "ok" as const,
        };
      } catch (error) {
        return trainFailureResult(error);
      }
    },
    input: planTrainJourneyInputSchema,
    name: "plan_train_journey",
    output: planTrainJourneyOutputSchema,
    title: "Plan een Nederlandse treinreis (alleen-lezen)",
  });

  const getTrainDepartures = defineOperation({
    description:
      "Lees het actuele vertrekbord van één Nederlands treinstation via de officiële NS Reisinformatie API. Zoek de stationscode eerst op met find_ov_stop. Per vertrek volgen de bestemming, de geplande en verwachte tijd, het geplande en actuele spoor, de vervoerder en of de trein is uitgevallen, plus eventuele meldingen. Tijden zijn ISO 8601 met offset en het antwoord is een momentopname van maximaal een halve minuut oud.",
    async execute(context, input) {
      try {
        const isAllowed = await dependencies.upstreamLimiter.consume(
          context.request,
          "trains"
        );
        if (!isAllowed) {
          return rateLimitedResult();
        }
        const result = await dependencies.trains.departures(input, {
          now: context.now(),
          signal: context.signal,
        });
        const departures: TrainDeparture[] = [...result.departures];
        return {
          departures,
          observedAt: result.observedAt,
          source: NS_PROVENANCE,
          status: "ok" as const,
        };
      } catch (error) {
        return trainFailureResult(error);
      }
    },
    input: getTrainDeparturesInputSchema,
    name: "get_train_departures",
    output: getTrainDeparturesOutputSchema,
    title: "Lees een actueel treinvertrekbord (alleen-lezen)",
  });

  const getRailDisruptions = defineOperation({
    description:
      "Haal actuele storingen, calamiteiten en geplande werkzaamheden op het Nederlandse spoor op via de officiële NS Reisinformatie API. Laat station weg voor het landelijke overzicht, of geef een met find_ov_stop opgezochte stationscode mee voor de meldingen bij dat station. Standaard komen alleen meldingen terug die nu spelen; zet activeOnly op false om geplande werkzaamheden mee te nemen. Reisadviezen komen letterlijk van NS.",
    async execute(context, input) {
      try {
        const isAllowed = await dependencies.upstreamLimiter.consume(
          context.request,
          "trains"
        );
        if (!isAllowed) {
          return rateLimitedResult();
        }
        const result = await dependencies.trains.disruptions(input, {
          now: context.now(),
          signal: context.signal,
        });
        const disruptions: RailDisruption[] = [...result.disruptions];
        return {
          disruptions,
          observedAt: result.observedAt,
          source: NS_PROVENANCE,
          status: "ok" as const,
        };
      } catch (error) {
        return trainFailureResult(error);
      }
    },
    input: getRailDisruptionsInputSchema,
    name: "get_rail_disruptions",
    output: getRailDisruptionsOutputSchema,
    title: "Lees actuele storingen op het spoor (alleen-lezen)",
  });

  const getStopDepartures = defineOperation({
    description:
      "Lees de actuele vertrekken van bus, tram of metro bij één halteplaats via OVapi, een onofficiële bron. Zoek de halteplaatscode eerst op met find_ov_stop; een treinstationcode werkt hier niet. Per vertrek volgen de lijn, de bestemming, de vervoerssoort en de geplande en verwachte tijd. OVapi levert lokale klokttijden zonder tijdzone-offset, dus die komen ongewijzigd terug in de velden op Local met timezone Europe/Amsterdam.",
    async execute(context, input) {
      try {
        const isAllowed = await dependencies.upstreamLimiter.consume(
          context.request,
          "stops"
        );
        if (!isAllowed) {
          return rateLimitedResult();
        }
        const result = await dependencies.stopDepartures.departures(input, {
          now: context.now(),
          signal: context.signal,
        });
        const departures: StopDeparture[] = [...result.departures];
        return {
          departures,
          observedAt: result.observedAt,
          source: OVAPI_PROVENANCE,
          status: "ok" as const,
          ...(result.stopName === undefined
            ? {}
            : { stopName: result.stopName }),
          ...(result.stopTown === undefined
            ? {}
            : { stopTown: result.stopTown }),
          timezone: NS_TIMEZONE,
        };
      } catch (error) {
        if (error instanceof UnknownStopError) {
          return unknownStopResult();
        }
        if (error instanceof UpstreamUnavailableError) {
          return upstreamUnavailableResult();
        }
        throw genericDependencyFailure();
      }
    },
    input: getStopDeparturesInputSchema,
    name: "get_stop_departures",
    output: getStopDeparturesOutputSchema,
    title: "Lees actuele bus-, tram- en metrovertrekken (alleen-lezen)",
  });

  return [
    findOvStop,
    planTrainJourney,
    getTrainDepartures,
    getRailDisruptions,
    getStopDepartures,
  ];
}
