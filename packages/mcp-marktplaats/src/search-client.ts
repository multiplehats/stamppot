import {
  boundedList,
  fetchUpstreamJson,
  globalUpstreamFetch,
  optionalField,
  trimUpstreamText,
  type UpstreamCache,
  type UpstreamFetch,
  UpstreamUnavailableError,
} from "@stamppot/upstream";
import { z } from "zod";
import {
  type FindMarktplaatsListingsInput,
  MARKTPLAATS_TIMEOUT_MS,
  MAX_CATEGORY_SUGGESTIONS,
  type MarktplaatsCategorySuggestion,
  type MarktplaatsListingSummary,
  marktplaatsCategorySuggestionSchema,
  marktplaatsListingSummarySchema,
  SEARCH_CACHE_TTL_SECONDS,
} from "./contracts";
import {
  absoluteMarktplaatsUrl,
  CONDITIONS,
  conditionFromLabel,
  deliveryFromLabel,
  imageUrl,
  MARKTPLAATS_ORIGIN,
  MARKTPLAATS_SEARCH_URL,
  postedOnFromLabel,
  priceTypeFromUpstream,
  REQUEST_HEADERS,
  SORTS,
} from "./marktplaats-format";
import type {
  ListingSearchResult,
  ListingSearchService,
  MarktplaatsCallContext,
  MarktplaatsSearchQuery,
} from "./operations";

const MAX_UPSTREAM_ITEMS = 200;
const MAX_TEXT_CHARACTERS = 300;
const MAX_IDENTIFIER_CHARACTERS = 40;
const LISTING_ID_PATTERN = /^m\d+$/;
const RELEVANT_CATEGORIES_FACET = "RelevantCategories";
const UNPROMOTED_PRIORITY = "NONE";
const CENTS_PER_EURO = 100;
const METRES_PER_KILOMETRE = 1000;
/** The upstream price range needs both bounds, so an open end gets a wide one. */
const MAX_PRICE_RANGE_CENTS = 100_000_000;
const CONDITION_KEY = "condition";
const DELIVERY_KEY = "delivery";

/** Present-or-absent passthrough: every upstream field is read defensively. */
const looseValue = z.unknown().optional();

const searchAttributeSchema = z
  .object({ key: looseValue, value: looseValue })
  .loose();

const searchListingSchema = z
  .object({
    attributes: z.array(searchAttributeSchema).optional(),
    categoryId: looseValue,
    date: looseValue,
    description: looseValue,
    imageUrls: z.array(z.unknown()).optional(),
    itemId: looseValue,
    location: z
      .object({
        cityName: looseValue,
        distanceMeters: looseValue,
      })
      .loose()
      .optional(),
    pictures: z.array(z.object({ mediumUrl: looseValue }).loose()).optional(),
    priceInfo: z
      .object({ priceCents: looseValue, priceType: looseValue })
      .loose()
      .optional(),
    priorityProduct: looseValue,
    reserved: looseValue,
    sellerInformation: z
      .object({
        isVerified: looseValue,
        sellerId: looseValue,
        sellerName: looseValue,
      })
      .loose()
      .optional(),
    title: looseValue,
    vipUrl: looseValue,
  })
  .loose();

const facetCategorySchema = z
  .object({
    histogramCount: looseValue,
    id: looseValue,
    label: looseValue,
    parentId: looseValue,
  })
  .loose();

const facetSchema = z
  .object({
    categories: z.array(facetCategorySchema).optional(),
    key: looseValue,
  })
  .loose();

const searchResponseSchema = z
  .object({
    facets: z.array(facetSchema).optional(),
    listings: z.array(searchListingSchema).optional(),
    totalResultCount: looseValue,
  })
  .loose();

export interface MarktplaatsSearchClientOptions {
  readonly cache: UpstreamCache;
  readonly fetchImplementation?: UpstreamFetch;
  readonly searchUrl?: string;
}

function text(value: unknown): string | undefined {
  return trimUpstreamText(value, MAX_TEXT_CHARACTERS);
}

function wholeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  const rounded = Math.round(value);
  return Number.isSafeInteger(rounded) ? rounded : undefined;
}

function positiveId(value: unknown): number | undefined {
  const whole = wholeNumber(value);
  return whole === undefined || whole === 0 ? undefined : whole;
}

/** Marktplaats reports `-1000` when no postcode was supplied. */
function distanceKilometres(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.round(value / (METRES_PER_KILOMETRE / 10)) / 10;
}

function identifier(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return String(value);
  }
  return typeof value === "string" && value.trim() !== ""
    ? value.trim().slice(0, MAX_IDENTIFIER_CHARACTERS)
    : undefined;
}

function attributeValue(
  attributes: readonly z.output<typeof searchAttributeSchema>[],
  key: string
): unknown {
  for (const attribute of attributes) {
    if (attribute.key === key) {
      return attribute.value;
    }
  }
}

function summaryImageUrl(
  listing: z.output<typeof searchListingSchema>
): string | undefined {
  const [firstImage] = boundedList(listing.imageUrls ?? [], MAX_UPSTREAM_ITEMS);
  const [firstPicture] = boundedList(
    listing.pictures ?? [],
    MAX_UPSTREAM_ITEMS
  );
  return imageUrl(firstImage, "82") ?? imageUrl(firstPicture?.mediumUrl, "82");
}

function listingSummary(
  listing: z.output<typeof searchListingSchema>,
  now: Date
): MarktplaatsListingSummary | undefined {
  const id = text(listing.itemId);
  const title = text(listing.title);
  const categoryId = positiveId(listing.categoryId);
  if (
    id === undefined ||
    !LISTING_ID_PATTERN.test(id) ||
    title === undefined ||
    categoryId === undefined
  ) {
    return undefined;
  }

  const attributes = boundedList(listing.attributes ?? [], MAX_UPSTREAM_ITEMS);
  const postedLabel = text(listing.date);
  return marktplaatsListingSummarySchema.parse({
    categoryId,
    ...optionalField(
      "condition",
      conditionFromLabel(attributeValue(attributes, CONDITION_KEY))
    ),
    ...optionalField(
      "delivery",
      deliveryFromLabel(attributeValue(attributes, DELIVERY_KEY))
    ),
    id,
    ...optionalField("imageUrl", summaryImageUrl(listing)),
    location: {
      ...optionalField("city", text(listing.location?.cityName)),
      ...optionalField(
        "distanceKm",
        distanceKilometres(listing.location?.distanceMeters)
      ),
    },
    ...optionalField("postedLabel", postedLabel),
    ...optionalField(
      "postedOn",
      postedLabel === undefined
        ? undefined
        : postedOnFromLabel(postedLabel, now)
    ),
    ...optionalField("priceCents", wholeNumber(listing.priceInfo?.priceCents)),
    priceType: priceTypeFromUpstream(listing.priceInfo?.priceType),
    promoted:
      typeof listing.priorityProduct === "string" &&
      listing.priorityProduct !== UNPROMOTED_PRIORITY,
    reserved: listing.reserved === true,
    seller: {
      id: identifier(listing.sellerInformation?.sellerId) ?? "onbekend",
      name: text(listing.sellerInformation?.sellerName) ?? "Onbekende verkoper",
      verified: listing.sellerInformation?.isVerified === true,
    },
    ...optionalField("snippet", text(listing.description)),
    title,
    url:
      absoluteMarktplaatsUrl(listing.vipUrl) ?? `${MARKTPLAATS_ORIGIN}/${id}`,
  });
}

function suggestionOrder(
  left: MarktplaatsCategorySuggestion,
  right: MarktplaatsCategorySuggestion
): number {
  if (left.count === right.count) {
    return 0;
  }
  if (left.count === undefined) {
    return 1;
  }
  if (right.count === undefined) {
    return -1;
  }
  return right.count - left.count;
}

function categorySuggestions(
  facets: readonly z.output<typeof facetSchema>[]
): MarktplaatsCategorySuggestion[] {
  const facet = facets.find((entry) => entry.key === RELEVANT_CATEGORIES_FACET);
  const suggestions = boundedList(
    facet?.categories ?? [],
    MAX_UPSTREAM_ITEMS
  ).flatMap((category) => {
    const id = positiveId(category.id);
    const name = text(category.label);
    if (id === undefined || name === undefined) {
      return [];
    }
    return [
      marktplaatsCategorySuggestionSchema.parse({
        ...optionalField("count", wholeNumber(category.histogramCount)),
        id,
        name,
        ...optionalField("parentId", positiveId(category.parentId)),
      }),
    ];
  });
  suggestions.sort(suggestionOrder);
  return suggestions.slice(0, MAX_CATEGORY_SUGGESTIONS);
}

function appendCategory(
  parameters: URLSearchParams,
  input: FindMarktplaatsListingsInput
): void {
  if (input.categoryId === undefined) {
    return;
  }
  if (input.parentCategoryId === undefined) {
    parameters.append("l1CategoryId", String(input.categoryId));
    return;
  }
  parameters.append("l1CategoryId", String(input.parentCategoryId));
  parameters.append("l2CategoryId", String(input.categoryId));
}

function appendPrice(
  parameters: URLSearchParams,
  input: FindMarktplaatsListingsInput
): void {
  if (input.minPriceEuro === undefined && input.maxPriceEuro === undefined) {
    return;
  }
  const from =
    input.minPriceEuro === undefined
      ? 0
      : Math.round(input.minPriceEuro * CENTS_PER_EURO);
  const to =
    input.maxPriceEuro === undefined
      ? MAX_PRICE_RANGE_CENTS
      : Math.round(input.maxPriceEuro * CENTS_PER_EURO);
  parameters.append("attributeRanges[]", `PriceCents:${from}:${to}`);
}

export class MarktplaatsSearchClient implements ListingSearchService {
  readonly #cache: UpstreamCache;
  readonly #fetchImplementation: UpstreamFetch;
  readonly #searchUrl: string;

  constructor(options: MarktplaatsSearchClientOptions) {
    this.#cache = options.cache;
    this.#fetchImplementation =
      options.fetchImplementation ?? globalUpstreamFetch;
    this.#searchUrl = options.searchUrl ?? MARKTPLAATS_SEARCH_URL;
  }

  async search(
    query: MarktplaatsSearchQuery,
    context: MarktplaatsCallContext
  ): Promise<ListingSearchResult> {
    const value = await this.#read(this.#url(query), context);
    const parsed = searchResponseSchema.safeParse(value);
    if (!parsed.success) {
      throw new UpstreamUnavailableError();
    }

    const listings = boundedList(parsed.data.listings ?? [], MAX_UPSTREAM_ITEMS)
      .flatMap((listing) => {
        const summary = listingSummary(listing, context.now);
        return summary === undefined ? [] : [summary];
      })
      .slice(0, query.input.limit);

    return {
      categorySuggestions: categorySuggestions(parsed.data.facets ?? []),
      listings,
      observedAt: context.now.toISOString(),
      ...optionalField("totalCount", wholeNumber(parsed.data.totalResultCount)),
    };
  }

  /**
   * The URL is the cache key, so the parameters are appended in a fixed order
   * and never sorted: two identical searches must produce the same string.
   */
  #url(query: MarktplaatsSearchQuery): string {
    const { input } = query;
    const parameters = new URLSearchParams();
    if (input.query !== undefined) {
      parameters.append("query", input.query);
    }
    appendCategory(parameters, input);
    if (query.postcode !== undefined && input.location !== undefined) {
      parameters.append("postcode", query.postcode);
      parameters.append(
        "distanceMeters",
        String(input.location.radiusKm * METRES_PER_KILOMETRE)
      );
    }
    appendPrice(parameters, input);
    for (const condition of input.conditions ?? []) {
      parameters.append(
        "attributesById[]",
        String(CONDITIONS[condition].attributeValueId)
      );
    }
    if (input.postedSince !== undefined) {
      parameters.append(
        "attributesByKey[]",
        `offeredSince:${Date.parse(input.postedSince)}`
      );
    }
    const sort = SORTS[input.sortBy];
    parameters.append("sortBy", sort.sortBy);
    parameters.append("sortOrder", sort.sortOrder);
    parameters.append("limit", String(input.limit));
    parameters.append("offset", String(input.offset));
    parameters.append("viewOptions", "list-view");
    return `${this.#searchUrl}?${parameters.toString()}`;
  }

  async #read(url: string, context: MarktplaatsCallContext): Promise<unknown> {
    try {
      return await fetchUpstreamJson({
        cache: this.#cache,
        fetchImplementation: this.#fetchImplementation,
        headers: REQUEST_HEADERS,
        signal: context.signal,
        timeoutMs: MARKTPLAATS_TIMEOUT_MS,
        ttlSeconds: SEARCH_CACHE_TTL_SECONDS,
        url,
      });
    } catch (error) {
      if (context.signal.aborted) {
        throw error;
      }
      if (error instanceof UpstreamUnavailableError) {
        throw error;
      }
      // biome-ignore lint/style/useErrorCause: Upstream detail must not reach a public error.
      throw new UpstreamUnavailableError();
    }
  }
}
