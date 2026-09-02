import { defineMcp, type McpDefinition } from "@stamppot/core";
import { createOvOperations, type OvMcpDependencies } from "./operations";

export type { UpstreamCache, UpstreamFetch } from "@stamppot/upstream";
// biome-ignore lint/performance/noBarrelFile: This package entrypoint defines the supported public transport API.
export {
  MemoryUpstreamCache,
  UpstreamUnavailableError,
} from "@stamppot/upstream";
export type {
  FindOvStopInput,
  GetRailDisruptionsInput,
  GetStopDeparturesInput,
  GetTrainDeparturesInput,
  PlanTrainJourneyInput,
} from "./contracts";
export {
  findOvStopInputSchema,
  findOvStopOutputSchema,
  getRailDisruptionsInputSchema,
  getRailDisruptionsOutputSchema,
  getStopDeparturesInputSchema,
  getStopDeparturesOutputSchema,
  getTrainDeparturesInputSchema,
  getTrainDeparturesOutputSchema,
  planTrainJourneyInputSchema,
  planTrainJourneyOutputSchema,
  StopDirectoryUnavailableError,
  UnknownStationError,
  UnknownStopError,
} from "./contracts";
export { NsClient } from "./ns-client";
export type {
  OvCallContext,
  OvMcpDependencies,
  OvUpstreamLimiter,
  StopDeparturesService,
  StopDirectoryService,
  TrainTravelService,
} from "./operations";
export { OvApiClient } from "./ovapi-client";
export type { StopsObjectStore } from "./stops-directory";
export { MemoryStopsObjectStore, StopDirectory } from "./stops-directory";
export {
  NS_BASE_URL,
  OVAPI_BASE_URL,
  STOPS_MANIFEST_KEY,
} from "./stops-format";

export function createOvMcp(dependencies: OvMcpDependencies): McpDefinition {
  return defineMcp({
    description:
      "Beantwoordt vragen over Nederlands openbaar vervoer: treinreizen plannen, vertrekborden lezen en storingen op het spoor volgen via de officiële NS Reisinformatie API, plus actuele bus-, tram- en metrovertrekken via OVapi. Elke tool werkt met codes, dus begin altijd met find_ov_stop om een plaats- of haltenaam op te zoeken. Resultaten zijn kortstondig gecachte momentopnames en zijn geen reservering of vervoerbewijs.",
    id: "ov",
    operations: createOvOperations(dependencies),
    title: "Nederlands openbaar vervoer",
  });
}
