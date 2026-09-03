import { defineMcp, type McpDefinition } from "@stamppot/core";
import {
  createMarktplaatsOperations,
  type MarktplaatsMcpDependencies,
} from "./operations";

export type { UpstreamCache, UpstreamFetch } from "@stamppot/upstream";
// biome-ignore lint/performance/noBarrelFile: This package entrypoint defines the supported Marktplaats API.
export {
  MemoryUpstreamCache,
  UpstreamUnavailableError,
} from "@stamppot/upstream";
export type {
  FindMarktplaatsListingsInput,
  GetMarktplaatsListingInput,
  MarktplaatsCategorySuggestion,
  MarktplaatsListing,
  MarktplaatsListingSummary,
  ResolvedLocation,
} from "./contracts";
export {
  findMarktplaatsListingsInputSchema,
  findMarktplaatsListingsOutputSchema,
  getMarktplaatsListingInputSchema,
  getMarktplaatsListingOutputSchema,
  marktplaatsListingSchema,
  marktplaatsListingSummarySchema,
  UnknownListingError,
  UnknownPlaceError,
} from "./contracts";
export { MarktplaatsListingClient } from "./listing-client";
export {
  extractJsonLdDescription,
  extractListingDom,
  extractWindowConfig,
} from "./listing-html";
export {
  MARKTPLAATS_ORIGIN,
  MARKTPLAATS_SEARCH_URL,
  MARKTPLAATS_SOURCE,
  PDOK_FREE_URL,
  PDOK_SOURCE,
  postedOnFromLabel,
} from "./marktplaats-format";
export type {
  ListingDetailResult,
  ListingDetailService,
  ListingSearchResult,
  ListingSearchService,
  LocationResolver,
  MarktplaatsCallContext,
  MarktplaatsMcpDependencies,
  MarktplaatsSearchQuery,
  MarktplaatsUpstreamLimiter,
  ResolvedPlace,
} from "./operations";
export { PdokLocationResolver } from "./pdok-client";
export { MarktplaatsSearchClient } from "./search-client";

export function createMarktplaatsMcp(
  dependencies: MarktplaatsMcpDependencies
): McpDefinition {
  return defineMcp({
    description:
      "Doorzoekt tweedehands advertenties op Marktplaats en leest één advertentie volledig uit. Marktplaats is een onofficiële bron zonder publieke API: de Gebruiksvoorwaarden staan alleen persoonlijk gebruik toe, dus de aantallen zijn klein gehouden en er geldt een rate limit. Zoek op tekst of categorie, filter op plaats en straal via de open PDOK Locatieserver, op prijs, op staat en op de datum waarop de advertentie is aangeboden. Resultaten zijn kortstondig gecachte momentopnames, geen bod en geen koopovereenkomst; contactgegevens en coördinaten komen nooit terug.",
    id: "marktplaats",
    operations: createMarktplaatsOperations(dependencies),
    title: "Marktplaats tweedehands",
  });
}
