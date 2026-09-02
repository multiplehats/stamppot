import { defineOperation, type Operation } from "@stamppot/core";
import {
  optionalField,
  type UpstreamLimiter,
  UpstreamUnavailableError,
} from "@stamppot/upstream";
import {
  type FindMarktplaatsListingsInput,
  findMarktplaatsListingsInputSchema,
  findMarktplaatsListingsOutputSchema,
  type GetMarktplaatsListingInput,
  getMarktplaatsListingInputSchema,
  getMarktplaatsListingOutputSchema,
  type MarktplaatsCategorySuggestion,
  type MarktplaatsListing,
  type MarktplaatsListingSummary,
  type ResolvedLocation,
  UnknownListingError,
  UnknownPlaceError,
  UPSTREAM_RETRY_AFTER_SECONDS,
} from "./contracts";
import { MARKTPLAATS_SOURCE, PDOK_SOURCE } from "./marktplaats-format";

const WHITESPACE_PATTERN = /\s+/g;

export interface MarktplaatsCallContext {
  readonly now: Date;
  readonly signal: AbortSignal;
}

/** A place resolved by the geocoder, before its provenance is attached. */
export type ResolvedPlace = Omit<ResolvedLocation, "source">;

/**
 * A search as the upstream sees it: the validated tool input plus the postcode
 * the operation resolved from it. Resolving a place is the operation's job, so
 * the search client never geocodes and never sees a place name.
 */
export interface MarktplaatsSearchQuery {
  readonly input: FindMarktplaatsListingsInput;
  readonly postcode?: string;
}

export interface ListingSearchResult {
  readonly categorySuggestions: readonly MarktplaatsCategorySuggestion[];
  readonly listings: readonly MarktplaatsListingSummary[];
  readonly observedAt: string;
  readonly totalCount?: number;
}

export interface ListingDetailResult {
  readonly listing: MarktplaatsListing;
  readonly observedAt: string;
}

export interface ListingSearchService {
  readonly search: (
    query: MarktplaatsSearchQuery,
    context: MarktplaatsCallContext
  ) => Promise<ListingSearchResult>;
}

export interface ListingDetailService {
  readonly read: (
    input: GetMarktplaatsListingInput,
    context: MarktplaatsCallContext
  ) => Promise<ListingDetailResult>;
}

export interface LocationResolver {
  readonly resolve: (
    place: string,
    context: MarktplaatsCallContext
  ) => Promise<ResolvedPlace>;
}

export type MarktplaatsUpstreamLimiter = UpstreamLimiter;

export interface MarktplaatsMcpDependencies {
  readonly listingDetail: ListingDetailService;
  readonly listings: ListingSearchService;
  readonly locations: LocationResolver;
  readonly upstreamLimiter: MarktplaatsUpstreamLimiter;
}

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

function genericDependencyFailure(): Error {
  return new Error("Marktplaats operation dependency failed");
}

/** A caller-supplied postcode is passed through, never geocoded. */
function normalizedPostcode(postcode: string): string {
  return postcode.replace(WHITESPACE_PATTERN, "").toUpperCase();
}

export function createMarktplaatsOperations(
  dependencies: MarktplaatsMcpDependencies
): readonly Operation[] {
  const findMarktplaatsListings = defineOperation({
    description:
      "Zoek tweedehands advertenties op Marktplaats, een onofficiële bron zonder publieke API of beschikbaarheidsgarantie. Zoek op tekst, op categorie of op beide, en filter optioneel op plaats en straal, op prijs, op staat en op de datum waarop de advertentie is aangeboden. Neem categoryId én parentCategoryId letterlijk over uit de categorySuggestions van een eerdere aanroep; een subcategorie zonder zijn bovenliggende categorie wordt door de bron genegeerd. Het antwoord is een kortstondig gecachte momentopname: geef de observedAt van deze aanroep mee als postedSince van de volgende om alleen nieuwe advertenties te zien. Kent de bron een plaatsnaam niet, dan volgt unknown_place; probeer dan een andere schrijfwijze of geef een postcode mee. De samenvattingen zijn afgekapt, dus gebruik get_marktplaats_listing om de staat van een advertentie echt te beoordelen.",
    async execute(context, input) {
      const callContext = { now: context.now(), signal: context.signal };
      try {
        const isAllowed = await dependencies.upstreamLimiter.consume(
          context.request,
          "search"
        );
        if (!isAllowed) {
          return rateLimitedResult();
        }

        const place = input.location?.place;
        const resolvedPlace =
          place === undefined
            ? undefined
            : await dependencies.locations.resolve(place, callContext);
        const postcode =
          resolvedPlace?.postcode ??
          (input.location?.postcode === undefined
            ? undefined
            : normalizedPostcode(input.location.postcode));

        const result = await dependencies.listings.search(
          { input, ...optionalField("postcode", postcode) },
          callContext
        );
        const listings: MarktplaatsListingSummary[] = [...result.listings];
        const categorySuggestions: MarktplaatsCategorySuggestion[] = [
          ...result.categorySuggestions,
        ];
        return {
          categorySuggestions,
          listings,
          observedAt: result.observedAt,
          ...optionalField(
            "resolvedLocation",
            resolvedPlace === undefined
              ? undefined
              : { ...resolvedPlace, source: PDOK_SOURCE }
          ),
          source: MARKTPLAATS_SOURCE,
          status: "ok" as const,
          ...optionalField("totalCount", result.totalCount),
        };
      } catch (error) {
        if (error instanceof UnknownPlaceError) {
          return { retryable: false, status: "unknown_place" as const };
        }
        if (error instanceof UpstreamUnavailableError) {
          return upstreamUnavailableResult();
        }
        throw genericDependencyFailure();
      }
    },
    input: findMarktplaatsListingsInputSchema,
    name: "find_marktplaats_listings",
    output: findMarktplaatsListingsOutputSchema,
    title: "Zoek tweedehands advertenties op Marktplaats (alleen-lezen)",
  });

  const getMarktplaatsListing = defineOperation({
    description:
      "Lees één Marktplaats-advertentie volledig uit, via een onofficiële bron zonder publieke API of beschikbaarheidsgarantie. Neem de id letterlijk over uit een resultaat van find_marktplaats_listings. Alleen deze tool geeft de volledige beschrijving en de kenmerkentabel terug; daarmee beoordeel je de staat, de compleetheid en de leveringsvoorwaarden, want de samenvatting in een zoekresultaat is afgekapt. Verder volgen de prijs en prijssoort, de biedingen, de categorie, het aantal weergaven en een beknopt verkopersprofiel. Telefoonnummers, coördinaten en de namen van bieders komen nooit terug. Het antwoord is een momentopname van maximaal twee minuten oud; een onbekende of ingetrokken advertentie geeft unknown_listing.",
    async execute(context, input) {
      try {
        const isAllowed = await dependencies.upstreamLimiter.consume(
          context.request,
          "listing"
        );
        if (!isAllowed) {
          return rateLimitedResult();
        }
        const result = await dependencies.listingDetail.read(input, {
          now: context.now(),
          signal: context.signal,
        });
        return {
          listing: result.listing,
          observedAt: result.observedAt,
          source: MARKTPLAATS_SOURCE,
          status: "ok" as const,
        };
      } catch (error) {
        if (error instanceof UnknownListingError) {
          return { retryable: false, status: "unknown_listing" as const };
        }
        if (error instanceof UpstreamUnavailableError) {
          return upstreamUnavailableResult();
        }
        throw genericDependencyFailure();
      }
    },
    input: getMarktplaatsListingInputSchema,
    name: "get_marktplaats_listing",
    output: getMarktplaatsListingOutputSchema,
    title: "Lees één Marktplaats-advertentie volledig (alleen-lezen)",
  });

  return [findMarktplaatsListings, getMarktplaatsListing];
}
