import {
  boundedList,
  fetchUpstreamText,
  globalUpstreamFetch,
  normalizeUpstreamInstant,
  noUpstreamCache,
  optionalField,
  trimUpstreamText,
  type UpstreamCache,
  type UpstreamFetch,
  UpstreamStatusError,
  UpstreamUnavailableError,
} from "@stamppot/upstream";
import { z } from "zod";
import {
  type GetMarktplaatsListingInput,
  LISTING_CACHE_TTL_SECONDS,
  MARKTPLAATS_TIMEOUT_MS,
  MAX_LISTING_IMAGES,
  type MarktplaatsListing,
  marktplaatsListingSchema,
  UnknownListingError,
} from "./contracts";
import {
  extractJsonLdDescription,
  extractListingDom,
  extractWindowConfig,
} from "./listing-html";
import {
  conditionFromLabel,
  imageUrl,
  MARKTPLAATS_ORIGIN,
  priceTypeFromUpstream,
  REQUEST_HEADERS,
} from "./marktplaats-format";
import type {
  ListingDetailResult,
  ListingDetailService,
  MarktplaatsCallContext,
} from "./operations";

const MAX_TEXT_CHARACTERS = 300;
const MAX_IDENTIFIER_CHARACTERS = 40;
const MAX_UPSTREAM_ITEMS = 100;
const MAX_REDIRECT_HOPS = 3;
const HTML_ACCEPT = "text/html";
const CONDITION_ATTRIBUTE_LABEL = "Conditie";
const CONSUMER_SELLER_TYPE = "CONSUMER";
const NOT_FOUND_STATUS = 404;
const REDIRECT_STATUSES = new Set([301, 302, 307, 308]);
/**
 * A listing id redirects twice before it lands on its canonical path. Only that
 * shape is followed, so a redirect can never walk the Worker onto another page.
 */
const CANONICAL_LISTING_PATH_PATTERN =
  /^\/v\/[a-z0-9-]+\/[a-z0-9-]+\/m\d+-[^/]*$/;

/** Present-or-absent passthrough: every upstream field is read defensively. */
const looseValue = z.unknown().optional();

/** Only `value` is read, so a bidder's nickname can never escape this module. */
const bidSchema = z.object({ value: looseValue }).loose();

const listingConfigSchema = z
  .object({
    bidsInfo: z
      .object({
        bids: z.array(bidSchema).optional(),
        currentMinimumBid: looseValue,
        isBiddingEnabled: looseValue,
      })
      .loose()
      .optional(),
    category: z
      .object({
        fullName: looseValue,
        id: looseValue,
        name: looseValue,
        parentId: looseValue,
        parentName: looseValue,
      })
      .loose()
      .optional(),
    gallery: z
      .object({ imageUrls: z.array(z.unknown()).optional() })
      .loose()
      .optional(),
    isReserved: looseValue,
    priceInfo: z
      .object({ priceCents: looseValue, priceType: looseValue })
      .loose()
      .optional(),
    seller: z
      .object({
        activeSinceDiff: looseValue,
        id: looseValue,
        location: z.object({ cityName: looseValue }).loose().optional(),
        name: looseValue,
        sellerType: looseValue,
      })
      .loose()
      .optional(),
    stats: z
      .object({
        favoritedCount: looseValue,
        since: looseValue,
        viewCount: looseValue,
      })
      .loose()
      .optional(),
    title: looseValue,
  })
  .loose();

const windowConfigSchema = z
  .object({ listing: listingConfigSchema.optional() })
  .loose();

interface FetchedPage {
  readonly html: string;
  readonly url: string;
}

export interface MarktplaatsListingClientOptions {
  readonly cache: UpstreamCache;
  readonly fetchImplementation?: UpstreamFetch;
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

function identifier(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return String(value);
  }
  return typeof value === "string" && value.trim() !== ""
    ? value.trim().slice(0, MAX_IDENTIFIER_CHARACTERS)
    : undefined;
}

function sellerType(value: unknown): "business" | "consumer" | "unknown" {
  if (value === CONSUMER_SELLER_TYPE) {
    return "consumer";
  }
  return typeof value === "string" && value.trim() !== ""
    ? "business"
    : "unknown";
}

function bidding(
  bidsInfo: z.output<typeof listingConfigSchema>["bidsInfo"]
): MarktplaatsListing["bidding"] {
  if (bidsInfo === undefined) {
    return undefined;
  }
  const bids = boundedList(bidsInfo.bids ?? [], MAX_UPSTREAM_ITEMS);
  let highest: number | undefined;
  for (const bid of bids) {
    const value = wholeNumber(bid.value);
    if (value !== undefined && (highest === undefined || value > highest)) {
      highest = value;
    }
  }
  return {
    bidCount: bids.length,
    enabled: bidsInfo.isBiddingEnabled === true,
    ...optionalField("highestBidCents", highest),
    ...optionalField(
      "minimumBidCents",
      wholeNumber(bidsInfo.currentMinimumBid)
    ),
  };
}

export class MarktplaatsListingClient implements ListingDetailService {
  readonly #cache: UpstreamCache;
  readonly #fetchImplementation: UpstreamFetch;

  constructor(options: MarktplaatsListingClientOptions) {
    this.#cache = options.cache;
    this.#fetchImplementation =
      options.fetchImplementation ?? globalUpstreamFetch;
  }

  async read(
    input: GetMarktplaatsListingInput,
    context: MarktplaatsCallContext
  ): Promise<ListingDetailResult> {
    const id = input.id.trim();
    const key = `${MARKTPLAATS_ORIGIN}/${id}`;
    const observedAt = context.now.toISOString();

    const cached = await this.#readCache(key, context);
    if (cached !== undefined) {
      return { listing: cached, observedAt };
    }

    const page = await this.#fetchFollowing(key, MAX_REDIRECT_HOPS, context);
    const listing = await this.#listing(id, page, context);
    await this.#writeCache(key, listing);
    return { listing, observedAt };
  }

  /** A cache entry holds the normalized listing, so a stale shape is a miss. */
  async #readCache(
    key: string,
    context: MarktplaatsCallContext
  ): Promise<MarktplaatsListing | undefined> {
    let body: string | undefined;
    try {
      body = await this.#cache.read(key, context.signal);
    } catch (error) {
      if (context.signal.aborted) {
        throw error;
      }
      return undefined;
    }
    if (body === undefined) {
      return undefined;
    }
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      return undefined;
    }
    const parsed = marktplaatsListingSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  }

  /** Losing the entry costs one later read and must never fail this one. */
  async #writeCache(key: string, listing: MarktplaatsListing): Promise<void> {
    try {
      await this.#cache.write(
        key,
        JSON.stringify(listing),
        LISTING_CACHE_TTL_SECONDS
      );
    } catch {
      // A cache that refuses the write must never fail the read it just served.
    }
  }

  async #listing(
    id: string,
    page: FetchedPage,
    context: MarktplaatsCallContext
  ): Promise<MarktplaatsListing> {
    const parsed = windowConfigSchema.safeParse(extractWindowConfig(page.html));
    const config = parsed.success ? parsed.data.listing : undefined;
    const title = text(config?.title);
    const categoryId = positiveId(config?.category?.id);
    const categoryName =
      text(config?.category?.name) ?? text(config?.category?.fullName);
    if (
      config === undefined ||
      title === undefined ||
      categoryId === undefined ||
      categoryName === undefined
    ) {
      throw new UpstreamUnavailableError();
    }

    const dom = await extractListingDom(page.html);
    context.signal.throwIfAborted();
    const fallbackDescription =
      dom.description === undefined
        ? extractJsonLdDescription(page.html)
        : undefined;
    const conditionLabel = dom.attributes.find(
      (attribute) => attribute.label === CONDITION_ATTRIBUTE_LABEL
    )?.value;
    const images = boundedList(
      config.gallery?.imageUrls ?? [],
      MAX_UPSTREAM_ITEMS
    )
      .flatMap((value) => {
        const resolved = imageUrl(value, "83");
        return resolved === undefined ? [] : [resolved];
      })
      .slice(0, MAX_LISTING_IMAGES);

    return marktplaatsListingSchema.parse({
      attributes: dom.attributes,
      ...optionalField("bidding", bidding(config.bidsInfo)),
      category: {
        ...optionalField("fullName", text(config.category?.fullName)),
        id: categoryId,
        name: categoryName,
        ...optionalField("parentId", positiveId(config.category?.parentId)),
        ...optionalField("parentName", text(config.category?.parentName)),
      },
      ...optionalField("condition", conditionFromLabel(conditionLabel)),
      ...optionalField("description", dom.description ?? fallbackDescription),
      ...(dom.description === undefined && fallbackDescription !== undefined
        ? { descriptionTruncated: true }
        : {}),
      ...optionalField(
        "favoritedCount",
        wholeNumber(config.stats?.favoritedCount)
      ),
      id,
      images,
      ...optionalField(
        "postedAt",
        normalizeUpstreamInstant(config.stats?.since)
      ),
      ...optionalField("priceCents", wholeNumber(config.priceInfo?.priceCents)),
      priceType: priceTypeFromUpstream(config.priceInfo?.priceType),
      reserved: config.isReserved === true,
      seller: {
        ...optionalField("activeSince", text(config.seller?.activeSinceDiff)),
        ...optionalField("city", text(config.seller?.location?.cityName)),
        id: identifier(config.seller?.id) ?? "onbekend",
        name: text(config.seller?.name) ?? "Onbekende verkoper",
        type: sellerType(config.seller?.sellerType),
      },
      title,
      url: page.url,
      ...optionalField("viewCount", wholeNumber(config.stats?.viewCount)),
    });
  }

  /**
   * The listing id resolves through two same-origin redirects. Nothing is
   * cached along the way, so a cache entry can only ever hold the final page's
   * normalized listing.
   */
  async #fetchFollowing(
    url: string,
    hopsLeft: number,
    context: MarktplaatsCallContext
  ): Promise<FetchedPage> {
    let html: string;
    try {
      html = await fetchUpstreamText({
        accept: HTML_ACCEPT,
        cache: noUpstreamCache,
        fetchImplementation: this.#fetchImplementation,
        headers: REQUEST_HEADERS,
        signal: context.signal,
        timeoutMs: MARKTPLAATS_TIMEOUT_MS,
        ttlSeconds: LISTING_CACHE_TTL_SECONDS,
        url,
      });
    } catch (error) {
      if (context.signal.aborted) {
        throw error;
      }
      return await this.#followRedirect(url, hopsLeft, context, error);
    }
    return { html, url };
  }

  #followRedirect(
    url: string,
    hopsLeft: number,
    context: MarktplaatsCallContext,
    error: unknown
  ): Promise<FetchedPage> {
    if (!(error instanceof UpstreamStatusError)) {
      throw new UpstreamUnavailableError();
    }
    if (error.status === NOT_FOUND_STATUS) {
      throw new UnknownListingError();
    }
    if (
      !REDIRECT_STATUSES.has(error.status) ||
      hopsLeft <= 0 ||
      error.location === undefined
    ) {
      throw new UpstreamUnavailableError();
    }
    let next: URL;
    try {
      next = new URL(error.location, url);
    } catch {
      // biome-ignore lint/style/useErrorCause: Upstream detail must not reach a public error.
      throw new UpstreamUnavailableError();
    }
    if (
      next.origin !== MARKTPLAATS_ORIGIN ||
      !CANONICAL_LISTING_PATH_PATTERN.test(next.pathname)
    ) {
      throw new UpstreamUnavailableError();
    }
    return this.#fetchFollowing(next.toString(), hopsLeft - 1, context);
  }
}
