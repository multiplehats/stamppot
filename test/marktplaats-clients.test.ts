import {
  MemoryUpstreamCache,
  type UpstreamCache,
  type UpstreamFetch,
  UpstreamUnavailableError,
} from "@stamppot/upstream";
import { describe, expect, it } from "vitest";
import listingHtml from "../packages/mcp-marktplaats/fixtures/marktplaats-listing.html?raw";
import searchText from "../packages/mcp-marktplaats/fixtures/marktplaats-search.json?raw";
import searchEmptyText from "../packages/mcp-marktplaats/fixtures/marktplaats-search-empty.json?raw";
import pdokEmptyText from "../packages/mcp-marktplaats/fixtures/pdok-empty.json?raw";
import pdokPostcodeText from "../packages/mcp-marktplaats/fixtures/pdok-postcode.json?raw";
import pdokWoonplaatsText from "../packages/mcp-marktplaats/fixtures/pdok-woonplaats.json?raw";
import {
  findMarktplaatsListingsInputSchema,
  PLACE_CACHE_TTL_SECONDS,
  UnknownListingError,
  UnknownPlaceError,
} from "../packages/mcp-marktplaats/src/contracts";
import { MarktplaatsListingClient } from "../packages/mcp-marktplaats/src/listing-client";
import {
  MARKTPLAATS_ORIGIN,
  MARKTPLAATS_SEARCH_URL,
  REQUEST_HEADERS,
} from "../packages/mcp-marktplaats/src/marktplaats-format";
import { PdokLocationResolver } from "../packages/mcp-marktplaats/src/pdok-client";
import { MarktplaatsSearchClient } from "../packages/mcp-marktplaats/src/search-client";

const NOW = new Date("2026-09-02T08:00:00.000Z");
const RESIZED_IMAGE_PATTERN =
  /^https:\/\/images\.marktplaats\.com\/.*ecg_mp_eps\$_83\.jpg$/;
const PRODUCT_DESCRIPTION_PATTERN = /^PS5 disk edition/;
const DESCRIPTION_DIV_PATTERN =
  /<div data-collapsable="description">[\s\S]*?<\/div>/;

function context() {
  return { now: NOW, signal: new AbortController().signal };
}

interface RecordedRequest {
  readonly headers: Record<string, string>;
  readonly method: string;
  readonly url: string;
}

function recordingFetch(
  responder: (url: string) => Response | Promise<Response>
): { calls: RecordedRequest[]; fetchImplementation: UpstreamFetch } {
  const calls: RecordedRequest[] = [];
  const fetchImplementation: UpstreamFetch = async (url, init) => {
    calls.push({
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      method: init.method ?? "GET",
      url,
    });
    return await responder(url);
  };
  return { calls, fetchImplementation };
}

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    headers: { "content-type": "application/json" },
    status,
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    headers: { "content-type": "text/html" },
    status,
  });
}

function redirectResponse(location: string, status = 301): Response {
  return new Response(null, { headers: { location }, status });
}

function searchClient(
  responder: (url: string) => Response | Promise<Response>
) {
  const cache = new MemoryUpstreamCache(() => NOW.getTime());
  const { calls, fetchImplementation } = recordingFetch(responder);
  const client = new MarktplaatsSearchClient({ cache, fetchImplementation });
  return { cache, calls, client };
}

function pdokResolver(
  responder: (url: string) => Response | Promise<Response>
) {
  const cache = new MemoryUpstreamCache(() => NOW.getTime());
  const { calls, fetchImplementation } = recordingFetch(responder);
  const resolver = new PdokLocationResolver({ cache, fetchImplementation });
  return { cache, calls, resolver };
}

function listingClient(
  responder: (url: string) => Response | Promise<Response>
) {
  const cache = new MemoryUpstreamCache(() => NOW.getTime());
  const { calls, fetchImplementation } = recordingFetch(responder);
  const client = new MarktplaatsListingClient({ cache, fetchImplementation });
  return { cache, calls, client };
}

describe("MarktplaatsSearchClient", () => {
  it("builds the search URL in a fixed parameter order for a full input", async () => {
    const input = findMarktplaatsListingsInputSchema.parse({
      categoryId: 2954,
      conditions: ["like_new", "used"],
      limit: 5,
      location: { postcode: "7511", radiusKm: 20 },
      maxPriceEuro: 450.5,
      minPriceEuro: 100,
      offset: 10,
      parentCategoryId: 356,
      postedSince: "2026-09-01T12:00:00Z",
      query: "ps5",
      sortBy: "newest",
    });
    const { calls, client } = searchClient(() => jsonResponse(searchText));

    await client.search({ input, postcode: "7511" }, context());

    const expectedParams = new URLSearchParams();
    expectedParams.append("query", "ps5");
    expectedParams.append("l1CategoryId", "356");
    expectedParams.append("l2CategoryId", "2954");
    expectedParams.append("postcode", "7511");
    expectedParams.append("distanceMeters", "20000");
    expectedParams.append("attributeRanges[]", "PriceCents:10000:45050");
    expectedParams.append("attributesById[]", "31");
    expectedParams.append("attributesById[]", "32");
    expectedParams.append(
      "attributesByKey[]",
      `offeredSince:${Date.parse("2026-09-01T12:00:00Z")}`
    );
    expectedParams.append("sortBy", "SORT_INDEX");
    expectedParams.append("sortOrder", "DECREASING");
    expectedParams.append("limit", "5");
    expectedParams.append("offset", "10");
    expectedParams.append("viewOptions", "list-view");
    const expectedUrl = `${MARKTPLAATS_SEARCH_URL}?${expectedParams.toString()}`;

    expect(calls[0]?.url).toBe(expectedUrl);
    expect(new Headers(calls[0]?.headers ?? {}).get("accept")).toBe(
      "application/json"
    );
    expect(calls[0]?.headers["user-agent"]).toBe(REQUEST_HEADERS["user-agent"]);
    expect(calls[0]?.headers["accept-language"]).toBe(
      REQUEST_HEADERS["accept-language"]
    );
  });

  it("appends only l1CategoryId when there is no parent category", async () => {
    const input = findMarktplaatsListingsInputSchema.parse({
      categoryId: 2954,
    });
    const { calls, client } = searchClient(() => jsonResponse(searchText));

    await client.search({ input }, context());

    const url = new URL(calls[0]?.url ?? "");
    expect(url.searchParams.get("l1CategoryId")).toBe("2954");
    expect(url.searchParams.has("l2CategoryId")).toBe(false);
  });

  it("uses a wide upper bound when only minPriceEuro is supplied", async () => {
    const input = findMarktplaatsListingsInputSchema.parse({
      minPriceEuro: 100,
      query: "ps5",
    });
    const { calls, client } = searchClient(() => jsonResponse(searchText));

    await client.search({ input }, context());

    const url = new URL(calls[0]?.url ?? "");
    expect(url.searchParams.get("attributeRanges[]")).toBe(
      "PriceCents:10000:100000000"
    );
  });

  it("maps the fixture listings, distances, promotion, and posted dates", async () => {
    const input = findMarktplaatsListingsInputSchema.parse({ query: "ps5" });
    const { client } = searchClient(() => jsonResponse(searchText));

    const result = await client.search({ input }, context());

    expect(result.listings).toHaveLength(4);
    const [first, second, third, fourth] = result.listings;

    expect(first).toMatchObject({
      condition: "like_new",
      delivery: "pickup_or_shipping",
      id: "m2437176273",
      location: { distanceKm: 1 },
      postedOn: "2026-09-02",
      priceType: "bidding",
      promoted: false,
      reserved: true,
      seller: { name: "Verkoper A" },
    });
    expect(first?.url.startsWith("https://www.marktplaats.nl/")).toBe(true);
    expect(first?.imageUrl?.startsWith("https://images.marktplaats.com/")).toBe(
      true
    );

    expect(second).toMatchObject({
      condition: "used",
      delivery: "pickup",
      id: "m2437828611",
      location: { distanceKm: 5 },
      priceType: "fixed",
      promoted: false,
      reserved: false,
    });

    expect(third).toMatchObject({
      condition: "new",
      delivery: "pickup_or_shipping",
      id: "m2437197655",
      location: { distanceKm: 4 },
      priceCents: 0,
      priceType: "bidding",
      promoted: true,
      reserved: false,
    });

    expect(fourth).toMatchObject({
      condition: "new",
      delivery: "pickup_or_shipping",
      id: "m2437115640",
      postedOn: "2026-08-22",
      priceType: "see_description",
      promoted: false,
      reserved: false,
    });
    expect(fourth?.location.distanceKm).toBeUndefined();
  });

  it("orders category suggestions by histogram count, parent last", async () => {
    const input = findMarktplaatsListingsInputSchema.parse({ query: "ps5" });
    const { client } = searchClient(() => jsonResponse(searchText));

    const result = await client.search({ input }, context());

    expect(result.categorySuggestions[0]).toEqual({
      count: 45,
      id: 2954,
      name: "Spelcomputers | Sony PlayStation 5",
      parentId: 356,
    });
    const [, parent] = result.categorySuggestions;
    expect(parent).toBeDefined();
    expect(parent?.id).toBe(356);
    expect(parent && "parentId" in parent).toBe(false);
    expect(result.totalCount).toBe(45);
  });

  it("bounds the mapped listings to the requested limit", async () => {
    const input = findMarktplaatsListingsInputSchema.parse({
      limit: 2,
      query: "ps5",
    });
    const { client } = searchClient(() => jsonResponse(searchText));

    const result = await client.search({ input }, context());

    expect(result.listings).toHaveLength(2);
  });

  it("returns an empty result set for the empty fixture", async () => {
    const input = findMarktplaatsListingsInputSchema.parse({ query: "xqzv" });
    const { client } = searchClient(() => jsonResponse(searchEmptyText));

    const result = await client.search({ input }, context());

    expect(result.listings).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it("treats a 500 response as unavailable", async () => {
    const input = findMarktplaatsListingsInputSchema.parse({ query: "ps5" });
    const { client } = searchClient(() => jsonResponse("{}", 500));

    await expect(client.search({ input }, context())).rejects.toBeInstanceOf(
      UpstreamUnavailableError
    );
  });

  it("treats a garbage body as unavailable", async () => {
    const input = findMarktplaatsListingsInputSchema.parse({ query: "ps5" });
    const { client } = searchClient(() => jsonResponse("not json at all"));

    await expect(client.search({ input }, context())).rejects.toBeInstanceOf(
      UpstreamUnavailableError
    );
  });

  it("serves a repeated identical search from the cache", async () => {
    const input = findMarktplaatsListingsInputSchema.parse({ query: "ps5" });
    const { cache, calls, client } = searchClient(() =>
      jsonResponse(searchText)
    );

    await client.search({ input }, context());
    await client.search({ input }, context());

    expect(calls).toHaveLength(1);
    const searchWrites = cache.writes.filter((url) => url === calls[0]?.url);
    expect(searchWrites).toHaveLength(1);
  });
});

describe("PdokLocationResolver", () => {
  function townAndPostcodeResponder(url: string): Response {
    if (url.includes("type%3Awoonplaats")) {
      return jsonResponse(pdokWoonplaatsText);
    }
    if (url.includes("type%3Apostcode")) {
      return jsonResponse(pdokPostcodeText);
    }
    throw new Error(`unexpected PDOK url: ${url}`);
  }

  it("resolves a place through the two-step woonplaats and postcode lookup", async () => {
    const { calls, resolver } = pdokResolver(townAndPostcodeResponder);

    const result = await resolver.resolve("Enschede", context());

    expect(result).toEqual({
      municipality: "Enschede",
      place: "Enschede",
      postcode: "7513CN",
      province: "Overijssel",
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toContain("type%3Awoonplaats");
    expect(calls[1]?.url).toContain("type%3Apostcode");
    expect(calls[1]?.url).toContain("lat=52.22080698");
    expect(calls[1]?.url).toContain("lon=6.8777881");
  });

  it("reports an unknown place after one call when the woonplaats step is empty", async () => {
    const { calls, resolver } = pdokResolver(() => jsonResponse(pdokEmptyText));

    await expect(
      resolver.resolve("Nergenshuizen", context())
    ).rejects.toBeInstanceOf(UnknownPlaceError);
    expect(calls).toHaveLength(1);
  });

  it("reports an unknown place when the postcode step is empty", async () => {
    const { calls, resolver } = pdokResolver((url) =>
      url.includes("type%3Awoonplaats")
        ? jsonResponse(pdokWoonplaatsText)
        : jsonResponse(pdokEmptyText)
    );

    await expect(
      resolver.resolve("Enschede", context())
    ).rejects.toBeInstanceOf(UnknownPlaceError);
    expect(calls).toHaveLength(2);
  });

  it("treats a 500 response as unavailable", async () => {
    const { resolver } = pdokResolver(() => jsonResponse("{}", 500));

    await expect(
      resolver.resolve("Enschede", context())
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("caches every PDOK read for a full day", async () => {
    const writes: { ttlSeconds: number; url: string }[] = [];
    const recordingCache: UpstreamCache = {
      read: () => Promise.resolve(undefined),
      write(url, _body, ttlSeconds) {
        writes.push({ ttlSeconds, url });
        return Promise.resolve();
      },
    };
    const { fetchImplementation } = recordingFetch(townAndPostcodeResponder);
    const resolver = new PdokLocationResolver({
      cache: recordingCache,
      fetchImplementation,
    });

    await resolver.resolve("Enschede", context());

    expect(writes).toHaveLength(2);
    for (const write of writes) {
      expect(write.ttlSeconds).toBe(PLACE_CACHE_TTL_SECONDS);
    }
  });
});

describe("MarktplaatsListingClient", () => {
  const idUrl = `${MARKTPLAATS_ORIGIN}/m2437783300`;
  const firstRedirectUrl = `${MARKTPLAATS_ORIGIN}/v/spelcomputers-en-games/playstation-5/m2437783300-ps5-disk-edition`;
  const canonicalUrl = `${MARKTPLAATS_ORIGIN}/v/spelcomputers-en-games/spelcomputers-sony-playstation-5/m2437783300-ps5-disk-edition`;

  function twoRedirectResponder(finalHtml: string) {
    return (url: string): Response => {
      if (url === idUrl) {
        return redirectResponse(
          "/v/spelcomputers-en-games/playstation-5/m2437783300-ps5-disk-edition"
        );
      }
      if (url === firstRedirectUrl) {
        return redirectResponse(
          "/v/spelcomputers-en-games/spelcomputers-sony-playstation-5/m2437783300-ps5-disk-edition"
        );
      }
      if (url === canonicalUrl) {
        return htmlResponse(finalHtml);
      }
      throw new Error(`unexpected listing url: ${url}`);
    };
  }

  it("follows two redirects and maps the fixture page", async () => {
    const { calls, client } = listingClient(twoRedirectResponder(listingHtml));

    const result = await client.read({ id: "m2437783300" }, context());
    const { listing } = result;

    expect(calls).toHaveLength(3);
    expect(new Headers(calls[0]?.headers ?? {}).get("accept")).toBe(
      "text/html"
    );

    expect(listing.id).toBe("m2437783300");
    expect(listing.title).toBe("Ps5 disk edition");
    expect(listing.priceCents).toBe(47_500);
    expect(listing.priceType).toBe("bidding");
    expect(listing.condition).toBe("like_new");
    expect(listing.attributes).toHaveLength(3);
    expect(listing.images).toHaveLength(3);
    for (const image of listing.images) {
      expect(image).toMatch(RESIZED_IMAGE_PATTERN);
    }
    expect(listing.url).toBe(canonicalUrl);
    expect(listing.postedAt).toBe("2026-09-01T13:12:07Z");
    expect(listing.viewCount).toBe(722);
    expect(listing.favoritedCount).toBe(22);
    expect(listing.bidding).toEqual({
      bidCount: 2,
      enabled: true,
      highestBidCents: 40_000,
      minimumBidCents: 28_500,
    });
    expect(listing.seller).toEqual({
      activeSince: "3 jaar",
      city: "Bergen op Zoom",
      id: "1",
      name: "Verkoper A",
      type: "consumer",
    });
    expect(listing.category).toEqual({
      fullName: "Spelcomputers | Sony PlayStation 5",
      id: 2954,
      name: "PlayStation 5",
      parentId: 356,
      parentName: "Spelcomputers en Games",
    });
    expect(listing.reserved).toBe(false);
    expect(listing.description).toBe(
      "Alles werkt naar behoren & compleet.\nTwee controllers.\nOphalen in Enschede."
    );
    expect(listing.descriptionTruncated).toBeUndefined();

    const serialized = JSON.stringify(listing);
    expect(serialized).not.toContain("Bieder");
    expect(serialized).not.toContain("encryptedSellerId");
    expect(serialized).not.toContain("latitude");
    expect(serialized).not.toContain("phoneNumber");
  });

  it("reports an unknown listing after one call on a 404", async () => {
    const { calls, client } = listingClient(
      () => new Response(null, { status: 404 })
    );

    await expect(
      client.read({ id: "m2437783300" }, context())
    ).rejects.toBeInstanceOf(UnknownListingError);
    expect(calls).toHaveLength(1);
  });

  it("refuses a cross-origin redirect after one call", async () => {
    const { calls, client } = listingClient(() =>
      redirectResponse("https://evil.example/v/a/b/m1-x")
    );

    await expect(
      client.read({ id: "m2437783300" }, context())
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(calls).toHaveLength(1);
  });

  it("refuses a same-origin redirect to a non-canonical path", async () => {
    const { calls, client } = listingClient(() => redirectResponse("/login"));

    await expect(
      client.read({ id: "m2437783300" }, context())
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(calls).toHaveLength(1);
  });

  it("gives up after four chained redirects", async () => {
    const location1 = "/v/a-a/b-b/m10001-x";
    const location2 = "/v/a-a/b-b/m10002-x";
    const location3 = "/v/a-a/b-b/m10003-x";
    const location4 = "/v/a-a/b-b/m10004-x";
    const { calls, client } = listingClient((url) => {
      if (url === idUrl) {
        return redirectResponse(location1);
      }
      if (url === `${MARKTPLAATS_ORIGIN}${location1}`) {
        return redirectResponse(location2);
      }
      if (url === `${MARKTPLAATS_ORIGIN}${location2}`) {
        return redirectResponse(location3);
      }
      if (url === `${MARKTPLAATS_ORIGIN}${location3}`) {
        return redirectResponse(location4);
      }
      throw new Error(`unexpected listing url: ${url}`);
    });

    await expect(
      client.read({ id: "m2437783300" }, context())
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(calls).toHaveLength(4);
  });

  it("treats a page without window.__CONFIG__ as unavailable", async () => {
    const { calls, client } = listingClient(() =>
      htmlResponse("<html><body>no config here</body></html>")
    );

    await expect(
      client.read({ id: "m2437783300" }, context())
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(calls).toHaveLength(1);
  });

  it("serves a repeated read from the cache keyed by the origin URL", async () => {
    const { cache, calls, client } = listingClient(
      twoRedirectResponder(listingHtml)
    );

    await client.read({ id: "m2437783300" }, context());
    await client.read({ id: "m2437783300" }, context());

    expect(calls).toHaveLength(3);
    expect(cache.writes).toEqual([idUrl]);
  });

  it("falls back to the JSON-LD description when the DOM has none", async () => {
    const htmlWithoutDescription = listingHtml.replace(
      DESCRIPTION_DIV_PATTERN,
      ""
    );
    const { client } = listingClient(
      twoRedirectResponder(htmlWithoutDescription)
    );

    const { listing } = await client.read({ id: "m2437783300" }, context());

    expect(listing.description).toMatch(PRODUCT_DESCRIPTION_PATTERN);
    expect(listing.descriptionTruncated).toBe(true);
  });
});
