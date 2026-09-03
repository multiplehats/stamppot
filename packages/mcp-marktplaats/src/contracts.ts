import { z } from "zod";
import { MARKTPLAATS_SOURCE, PDOK_SOURCE } from "./marktplaats-format";

export const MAX_LISTINGS = 30;
export const DEFAULT_LISTINGS = 10;
/**
 * The accessible result window: `offset + limit` may never exceed this, so a
 * single query can reach at most 100 listings, matching the personal-use ceiling
 * the ToS names for its own RSS feeds.
 */
export const MAX_RESULT_WINDOW = 100;
export const MAX_OFFSET = MAX_RESULT_WINDOW - 1;
export const MAX_RADIUS_KM = 200;
export const DEFAULT_RADIUS_KM = 25;
export const MAX_DESCRIPTION_CHARACTERS = 4000;
export const MAX_LISTING_IMAGES = 8;
export const MAX_ATTRIBUTES = 20;
export const MAX_CATEGORY_SUGGESTIONS = 10;
export const UPSTREAM_RETRY_AFTER_SECONDS = 60;
export const SEARCH_CACHE_TTL_SECONDS = 60;
export const LISTING_CACHE_TTL_SECONDS = 120;
export const PLACE_CACHE_TTL_SECONDS = 86_400;
export const MARKTPLAATS_TIMEOUT_MS = 10_000;
export const PDOK_TIMEOUT_MS = 5000;

const MAX_TEXT_CHARACTERS = 300;
const MAX_QUERY_CHARACTERS = 120;
const MAX_PLACE_CHARACTERS = 80;
const MIN_PLACE_CHARACTERS = 2;
const MAX_IDENTIFIER_CHARACTERS = 40;
const LISTING_ID_PATTERN = /^m\d+$/;
const LISTING_INPUT_ID_PATTERN = /^m\d{5,15}$/;
/** PC4 (`7511`) or PC6 (`7511 AB`); a Dutch postcode never starts at zero. */
const POSTCODE_PATTERN = /^[1-9]\d{3}(?:\s?[A-Za-z]{2})?$/;
const CALENDAR_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** PDOK knows no place by that name. */
export class UnknownPlaceError extends Error {
  constructor() {
    super("Place is unknown");
    this.name = "UnknownPlaceError";
  }
}

/** Marktplaats has no listing with that id, or it has been withdrawn. */
export class UnknownListingError extends Error {
  constructor() {
    super("Listing is unknown");
    this.name = "UnknownListingError";
  }
}

export const marktplaatsSourceSchema = z
  .object({
    licence: z.literal(MARKTPLAATS_SOURCE.licence),
    name: z.literal(MARKTPLAATS_SOURCE.name),
    note: z.literal(MARKTPLAATS_SOURCE.note),
    official: z.literal(false),
    url: z.literal(MARKTPLAATS_SOURCE.url),
  })
  .strict();

export const pdokSourceSchema = z
  .object({
    licence: z.literal(PDOK_SOURCE.licence),
    name: z.literal(PDOK_SOURCE.name),
    official: z.literal(true),
    url: z.literal(PDOK_SOURCE.url),
  })
  .strict();

const upstreamTextSchema = z.string().min(1).max(MAX_TEXT_CHARACTERS);
const optionalUpstreamTextSchema = upstreamTextSchema.optional();
const upstreamInstantSchema = z.iso.datetime({ offset: true });
const positiveIdSchema = z.number().int().positive().safe();
const countSchema = z.number().int().nonnegative().safe();
const centsSchema = z.number().int().nonnegative().safe();

export const marktplaatsConditionSchema = z.enum([
  "new",
  "like_new",
  "used",
  "refurbished",
  "not_working",
]);

export const marktplaatsSortSchema = z.enum([
  "newest",
  "relevance",
  "price_asc",
  "price_desc",
  "distance",
]);

export const marktplaatsPriceTypeSchema = z.enum([
  "fixed",
  "bidding",
  "free",
  "see_description",
  "negotiable",
  "on_request",
  "exchange",
  "reserved",
  "unknown",
]);

export const marktplaatsListingConditionSchema = z.enum([
  "new",
  "like_new",
  "used",
  "refurbished",
  "not_working",
  "unknown",
]);

export const marktplaatsDeliverySchema = z.enum([
  "pickup",
  "shipping",
  "pickup_or_shipping",
  "unknown",
]);

const postcodeSchema = z
  .string()
  .trim()
  .regex(POSTCODE_PATTERN)
  .describe(
    "Dutch postcode as four digits, optionally followed by two letters, for example '7511' or '7511 AB'. Marktplaats silently ignores a postcode that does not exist and then searches the whole country, so never invent one."
  );

const searchLocationSchema = z
  .object({
    place: z
      .string()
      .trim()
      .min(MIN_PLACE_CHARACTERS)
      .max(MAX_PLACE_CHARACTERS)
      .optional()
      .describe(
        "Dutch town or city name, for example 'Enschede'. It is geocoded to a postcode first and the resolved place is echoed back in resolvedLocation. Supply either place or postcode, never both."
      ),
    postcode: postcodeSchema
      .optional()
      .describe(
        "Dutch postcode to search around, used as-is without a geocoding lookup. Supply either place or postcode, never both."
      ),
    radiusKm: z
      .number()
      .int()
      .min(1)
      .max(MAX_RADIUS_KM)
      .default(DEFAULT_RADIUS_KM)
      .describe(
        "Search radius in kilometres around the place or postcode, from 1 through 200. Defaults to 25."
      ),
  })
  .strict()
  .refine(
    (location) =>
      (location.place === undefined) !== (location.postcode === undefined),
    { message: "Supply exactly one of place or postcode" }
  );

export const findMarktplaatsListingsInputSchema = z
  .object({
    categoryId: positiveIdSchema
      .optional()
      .describe(
        "Marktplaats category id to restrict the search to. Never guess it: copy an id from the categorySuggestions of an earlier call, and copy that entry's parentId into parentCategoryId as well. Supply query, categoryId, or both."
      ),
    conditions: z
      .array(marktplaatsConditionSchema)
      .min(1)
      .refine((conditions) => new Set(conditions).size === conditions.length, {
        message: "Conditions must be unique",
      })
      .optional()
      .describe(
        "Optional filter on the condition the seller declared. Several values widen the search rather than narrowing it: a listing matching any of them is returned. Omit it to accept every condition."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LISTINGS)
      .default(DEFAULT_LISTINGS)
      .describe(
        "Maximum listings to return, from 1 through 30. Defaults to 10; keep it small, because the source only permits modest personal use."
      ),
    location: searchLocationSchema
      .optional()
      .describe(
        "Optional geographic filter. Omit it to search the whole country; without it every distanceKm is absent and sortBy 'distance' is rejected."
      ),
    maxPriceEuro: z
      .number()
      .nonnegative()
      .optional()
      .describe(
        "Optional upper bound on the asking price in euros, not cents. It must be at least minPriceEuro when both are supplied."
      ),
    minPriceEuro: z
      .number()
      .nonnegative()
      .optional()
      .describe(
        "Optional lower bound on the asking price in euros, not cents. A listing without a plain asking price may still match."
      ),
    offset: z
      .number()
      .int()
      .min(0)
      .max(MAX_OFFSET)
      .default(0)
      .describe(
        "How many listings to skip, from 0 through 99, for paging through totalCount. Defaults to 0. offset plus limit may not exceed 100, the personal-use ceiling on how far a single query may page."
      ),
    parentCategoryId: positiveIdSchema
      .optional()
      .describe(
        "Parent category id belonging to categoryId. Marktplaats ignores a subcategory that arrives without its parent, so copy both id and parentId from the same categorySuggestions entry. Only valid together with categoryId."
      ),
    postedSince: upstreamInstantSchema
      .optional()
      .describe(
        "Optional ISO 8601 instant with offset or Z, for example 2026-09-02T08:00:00Z. Pass the observedAt of your previous call to see only listings offered since then, which is how a repeated watch stays cheap."
      ),
    query: z
      .string()
      .trim()
      .min(1)
      .max(MAX_QUERY_CHARACTERS)
      .optional()
      .describe(
        "Free-text search terms in Dutch, for example 'playstation 5' or 'eettafel eiken'. Supply query, categoryId, or both."
      ),
    sortBy: marktplaatsSortSchema
      .default("newest")
      .describe(
        "Result order. 'newest' lists most recently offered first and is the default; 'relevance' is the source's own ranking; 'price_asc' and 'price_desc' order by asking price; 'distance' requires location."
      ),
  })
  .strict()
  .refine(
    (input) => input.query !== undefined || input.categoryId !== undefined,
    { message: "Supply query, categoryId, or both" }
  )
  .refine(
    (input) =>
      input.parentCategoryId === undefined || input.categoryId !== undefined,
    { message: "parentCategoryId is only valid together with categoryId" }
  )
  .refine(
    (input) =>
      input.minPriceEuro === undefined ||
      input.maxPriceEuro === undefined ||
      input.minPriceEuro <= input.maxPriceEuro,
    { message: "minPriceEuro must not exceed maxPriceEuro" }
  )
  .refine(
    (input) => input.sortBy !== "distance" || input.location !== undefined,
    { message: "sortBy 'distance' requires location" }
  )
  .refine((input) => input.offset + input.limit <= MAX_RESULT_WINDOW, {
    message: "offset plus limit must not exceed 100",
  });

export const marktplaatsListingSummarySchema = z
  .object({
    categoryId: positiveIdSchema,
    condition: marktplaatsListingConditionSchema.optional(),
    delivery: marktplaatsDeliverySchema.optional(),
    id: z.string().regex(LISTING_ID_PATTERN),
    imageUrl: z.url().optional(),
    location: z
      .object({
        city: optionalUpstreamTextSchema,
        distanceKm: z.number().nonnegative().optional(),
      })
      .strict(),
    postedLabel: optionalUpstreamTextSchema,
    postedOn: z.string().regex(CALENDAR_DAY_PATTERN).optional(),
    priceCents: centsSchema.optional(),
    priceType: marktplaatsPriceTypeSchema,
    promoted: z.boolean(),
    reserved: z.boolean(),
    seller: z
      .object({
        id: z.string().min(1).max(MAX_IDENTIFIER_CHARACTERS),
        name: upstreamTextSchema,
        verified: z.boolean(),
      })
      .strict(),
    snippet: optionalUpstreamTextSchema,
    title: upstreamTextSchema,
    url: z.url(),
  })
  .strict();

export const marktplaatsCategorySuggestionSchema = z
  .object({
    count: countSchema.optional(),
    id: positiveIdSchema,
    name: upstreamTextSchema,
    parentId: positiveIdSchema.optional(),
  })
  .strict();

export const resolvedLocationSchema = z
  .object({
    municipality: optionalUpstreamTextSchema,
    place: upstreamTextSchema,
    postcode: z.string().min(1).max(MAX_IDENTIFIER_CHARACTERS),
    province: optionalUpstreamTextSchema,
    source: pdokSourceSchema,
  })
  .strict();

const upstreamFailureShape = {
  retryAfterSeconds: z.literal(UPSTREAM_RETRY_AFTER_SECONDS).optional(),
  retryable: z.boolean().optional(),
} as const;

export const findMarktplaatsListingsOutputSchema = z
  .object({
    ...upstreamFailureShape,
    categorySuggestions: z
      .array(marktplaatsCategorySuggestionSchema)
      .max(MAX_CATEGORY_SUGGESTIONS)
      .optional(),
    listings: z
      .array(marktplaatsListingSummarySchema)
      .max(MAX_LISTINGS)
      .optional(),
    observedAt: upstreamInstantSchema.optional(),
    resolvedLocation: resolvedLocationSchema.optional(),
    source: marktplaatsSourceSchema.optional(),
    status: z.enum([
      "ok",
      "unknown_place",
      "upstream_unavailable",
      "rate_limited",
    ]),
    totalCount: countSchema.optional(),
  })
  .strict();

export const getMarktplaatsListingInputSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(LISTING_INPUT_ID_PATTERN)
      .describe(
        "Marktplaats listing id: the letter m followed by 5-15 digits, for example 'm2437783300'. Copy it verbatim from the id of a find_marktplaats_listings result; never derive it from a URL you have not seen."
      ),
  })
  .strict();

export const marktplaatsListingSchema = z
  .object({
    attributes: z
      .array(
        z
          .object({ label: upstreamTextSchema, value: upstreamTextSchema })
          .strict()
      )
      .max(MAX_ATTRIBUTES),
    bidding: z
      .object({
        bidCount: countSchema,
        enabled: z.boolean(),
        highestBidCents: centsSchema.optional(),
        minimumBidCents: centsSchema.optional(),
      })
      .strict()
      .optional(),
    category: z
      .object({
        fullName: optionalUpstreamTextSchema,
        id: positiveIdSchema,
        name: upstreamTextSchema,
        parentId: positiveIdSchema.optional(),
        parentName: optionalUpstreamTextSchema,
      })
      .strict(),
    condition: marktplaatsListingConditionSchema.optional(),
    description: z.string().min(1).max(MAX_DESCRIPTION_CHARACTERS).optional(),
    descriptionTruncated: z.boolean().optional(),
    favoritedCount: countSchema.optional(),
    id: z.string().regex(LISTING_ID_PATTERN),
    images: z.array(z.url()).max(MAX_LISTING_IMAGES),
    postedAt: upstreamInstantSchema.optional(),
    priceCents: centsSchema.optional(),
    priceType: marktplaatsPriceTypeSchema,
    reserved: z.boolean(),
    seller: z
      .object({
        activeSince: optionalUpstreamTextSchema,
        city: optionalUpstreamTextSchema,
        id: z.string().min(1).max(MAX_IDENTIFIER_CHARACTERS),
        name: upstreamTextSchema,
        type: z.enum(["consumer", "business", "unknown"]),
      })
      .strict(),
    title: upstreamTextSchema,
    url: z.url(),
    viewCount: countSchema.optional(),
  })
  .strict();

export const getMarktplaatsListingOutputSchema = z
  .object({
    ...upstreamFailureShape,
    listing: marktplaatsListingSchema.optional(),
    observedAt: upstreamInstantSchema.optional(),
    source: marktplaatsSourceSchema.optional(),
    status: z.enum([
      "ok",
      "unknown_listing",
      "upstream_unavailable",
      "rate_limited",
    ]),
  })
  .strict();

export type FindMarktplaatsListingsInput = z.output<
  typeof findMarktplaatsListingsInputSchema
>;
export type FindMarktplaatsListingsSuccess = Omit<
  z.output<typeof findMarktplaatsListingsOutputSchema>,
  "retryAfterSeconds" | "retryable" | "status"
> & { readonly status: "ok" };
export type MarktplaatsListingSummary = z.output<
  typeof marktplaatsListingSummarySchema
>;
export type MarktplaatsCategorySuggestion = z.output<
  typeof marktplaatsCategorySuggestionSchema
>;
export type ResolvedLocation = z.output<typeof resolvedLocationSchema>;
export type GetMarktplaatsListingInput = z.output<
  typeof getMarktplaatsListingInputSchema
>;
export type MarktplaatsListing = z.output<typeof marktplaatsListingSchema>;
