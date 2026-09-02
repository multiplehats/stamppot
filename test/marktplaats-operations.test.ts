import type { Operation, OperationContext } from "@stamppot/core";
import { UpstreamUnavailableError } from "@stamppot/upstream";
import { describe, expect, it } from "vitest";
import {
  findMarktplaatsListingsInputSchema,
  getMarktplaatsListingInputSchema,
  UnknownListingError,
  UnknownPlaceError,
} from "../packages/mcp-marktplaats/src/contracts";
import { createMarktplaatsMcp } from "../packages/mcp-marktplaats/src/index";
import type {
  ListingDetailService,
  ListingSearchService,
  LocationResolver,
  MarktplaatsMcpDependencies,
  MarktplaatsSearchQuery,
  MarktplaatsUpstreamLimiter,
} from "../packages/mcp-marktplaats/src/operations";

const NOW = new Date("2026-09-02T08:00:00.000Z");

function operationContext(): OperationContext {
  return {
    now: () => NOW,
    request: new Request("https://stamppot.test/v1/tools/probe"),
    signal: new AbortController().signal,
  };
}

function allowingLimiter(): MarktplaatsUpstreamLimiter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    consume(_request, scope) {
      calls.push(scope);
      return Promise.resolve(true);
    },
  };
}

function denyingLimiter(): MarktplaatsUpstreamLimiter {
  return { consume: () => Promise.resolve(false) };
}

function failingListings(error: Error): ListingSearchService {
  return { search: () => Promise.reject(error) };
}

function unusedListings(): ListingSearchService {
  return failingListings(new Error("listings service must not be called"));
}

function failingListingDetail(error: Error): ListingDetailService {
  return { read: () => Promise.reject(error) };
}

function unusedListingDetail(): ListingDetailService {
  return failingListingDetail(
    new Error("listing detail service must not be called")
  );
}

function failingLocations(error: Error): LocationResolver {
  return { resolve: () => Promise.reject(error) };
}

function unusedLocations(): LocationResolver {
  return failingLocations(new Error("location resolver must not be called"));
}

function emptySearchResult() {
  return Promise.resolve({
    categorySuggestions: [],
    listings: [],
    observedAt: NOW.toISOString(),
  });
}

function operations(
  overrides: Partial<MarktplaatsMcpDependencies>
): ReadonlyMap<string, Operation> {
  const dependencies: MarktplaatsMcpDependencies = {
    listingDetail: unusedListingDetail(),
    listings: unusedListings(),
    locations: unusedLocations(),
    upstreamLimiter: allowingLimiter(),
    ...overrides,
  };
  return new Map(
    createMarktplaatsMcp(dependencies).operations.map((operation) => [
      operation.name,
      operation,
    ])
  );
}

function invoke(
  registry: ReadonlyMap<string, Operation>,
  name: string,
  input: unknown
): Promise<Record<string, unknown>> {
  const operation = registry.get(name);
  if (operation === undefined) {
    throw new Error(`Unknown operation: ${name}`);
  }
  return operation.invoke(operationContext(), input);
}

describe("Marktplaats operations", () => {
  it("registers exactly the two documented tools with a read-only title suffix", () => {
    const registry = operations({});

    expect([...registry.keys()]).toEqual([
      "find_marktplaats_listings",
      "get_marktplaats_listing",
    ]);
    for (const operation of registry.values()) {
      expect(operation.title.endsWith("(alleen-lezen)")).toBe(true);
    }
  });

  it("charges the limiter with scope search for each upstream read a search performs", async () => {
    const callOrder: string[] = [];
    const limiter: MarktplaatsUpstreamLimiter = {
      consume(_request, scope) {
        callOrder.push(`limiter:${scope}`);
        return Promise.resolve(true);
      },
    };
    const listings: ListingSearchService = {
      async search(_query, callContext) {
        callOrder.push("listings:search");
        // A real client charges the limiter for the read it is about to make.
        await callContext.chargeUpstreamRead?.();
        return {
          categorySuggestions: [],
          listings: [],
          observedAt: NOW.toISOString(),
        };
      },
    };
    const registry = operations({ listings, upstreamLimiter: limiter });

    await invoke(registry, "find_marktplaats_listings", { query: "ps5" });

    expect(callOrder).toEqual(["listings:search", "limiter:search"]);
  });

  it("returns rate_limited when a search read is refused by the limiter", async () => {
    const listings: ListingSearchService = {
      async search(_query, callContext) {
        await callContext.chargeUpstreamRead?.();
        return emptySearchResult();
      },
    };
    const registry = operations({
      listings,
      locations: unusedLocations(),
      upstreamLimiter: denyingLimiter(),
    });

    await expect(
      invoke(registry, "find_marktplaats_listings", { query: "ps5" })
    ).resolves.toEqual({
      retryAfterSeconds: 60,
      retryable: true,
      status: "rate_limited",
    });
  });

  it("returns rate_limited when a listing read is refused by the limiter", async () => {
    const listingDetail: ListingDetailService = {
      async read(_input, callContext) {
        await callContext.chargeUpstreamRead?.();
        throw new Error("read must stop at the refused charge");
      },
    };
    const registry = operations({
      listingDetail,
      upstreamLimiter: denyingLimiter(),
    });

    await expect(
      invoke(registry, "get_marktplaats_listing", { id: "m2437783300" })
    ).resolves.toEqual({
      retryAfterSeconds: 60,
      retryable: true,
      status: "rate_limited",
    });
  });

  it("does not charge the limiter when a service serves entirely from cache", async () => {
    const listings: ListingSearchService = {
      search: () => emptySearchResult(),
    };
    const registry = operations({
      listings,
      locations: unusedLocations(),
      upstreamLimiter: denyingLimiter(),
    });

    await expect(
      invoke(registry, "find_marktplaats_listings", { query: "ps5" })
    ).resolves.toMatchObject({ status: "ok" });
  });

  it("resolves a place before searching and echoes it as resolvedLocation", async () => {
    const locations: LocationResolver = {
      resolve: (place) =>
        Promise.resolve({
          municipality: "Enschede",
          place,
          postcode: "7513CN",
          province: "Overijssel",
        }),
    };
    let capturedQuery: MarktplaatsSearchQuery | undefined;
    const listings: ListingSearchService = {
      search(query) {
        capturedQuery = query;
        return emptySearchResult();
      },
    };
    const registry = operations({ listings, locations });

    const result = (await invoke(registry, "find_marktplaats_listings", {
      location: { place: "Enschede", radiusKm: 20 },
      query: "ps5",
    })) as {
      resolvedLocation?: { source: { name: string } };
      status: string;
    };

    expect(capturedQuery?.postcode).toBe("7513CN");
    expect(result.status).toBe("ok");
    expect(result.resolvedLocation?.source.name).toBe("PDOK Locatieserver");
  });

  it("normalizes a caller-supplied postcode without resolving it", async () => {
    let capturedQuery: MarktplaatsSearchQuery | undefined;
    const listings: ListingSearchService = {
      search(query) {
        capturedQuery = query;
        return emptySearchResult();
      },
    };
    const registry = operations({ listings, locations: unusedLocations() });

    await invoke(registry, "find_marktplaats_listings", {
      location: { postcode: "7511 ab", radiusKm: 10 },
      query: "ps5",
    });

    expect(capturedQuery?.postcode).toBe("7511AB");
  });

  it("reports unknown_place without retrying when the place cannot be resolved", async () => {
    const registry = operations({
      locations: failingLocations(new UnknownPlaceError()),
    });

    await expect(
      invoke(registry, "find_marktplaats_listings", {
        location: { place: "Nergenshuizen", radiusKm: 10 },
        query: "ps5",
      })
    ).resolves.toEqual({ retryable: false, status: "unknown_place" });
  });

  it("reports upstream_unavailable with a retry hint on an upstream failure", async () => {
    const registry = operations({
      listings: failingListings(new UpstreamUnavailableError()),
    });

    await expect(
      invoke(registry, "find_marktplaats_listings", { query: "ps5" })
    ).resolves.toEqual({
      retryAfterSeconds: 60,
      retryable: true,
      status: "upstream_unavailable",
    });
  });

  it("masks an unmodelled dependency failure with a generic error", async () => {
    const registry = operations({
      listings: failingListings(new Error("leaked upstream detail")),
    });

    await expect(
      invoke(registry, "find_marktplaats_listings", { query: "ps5" })
    ).rejects.toThrow("Marktplaats operation dependency failed");
  });

  it("charges the limiter with scope listing and maps unknown_listing", async () => {
    const callOrder: string[] = [];
    const limiter: MarktplaatsUpstreamLimiter = {
      consume(_request, scope) {
        callOrder.push(`limiter:${scope}`);
        return Promise.resolve(true);
      },
    };
    const listingDetail: ListingDetailService = {
      async read(_input, callContext) {
        await callContext.chargeUpstreamRead?.();
        throw new UnknownListingError();
      },
    };
    const registry = operations({
      listingDetail,
      upstreamLimiter: limiter,
    });

    await expect(
      invoke(registry, "get_marktplaats_listing", { id: "m2437783300" })
    ).resolves.toEqual({ retryable: false, status: "unknown_listing" });
    expect(callOrder).toEqual(["limiter:listing"]);
  });

  it("rejects a search input missing both query and categoryId", () => {
    expect(findMarktplaatsListingsInputSchema.safeParse({}).success).toBe(
      false
    );
  });

  it("rejects a parentCategoryId without categoryId", () => {
    expect(
      findMarktplaatsListingsInputSchema.safeParse({
        parentCategoryId: 5,
        query: "ps5",
      }).success
    ).toBe(false);
  });

  it("rejects a location with both place and postcode", () => {
    expect(
      findMarktplaatsListingsInputSchema.safeParse({
        location: { place: "Enschede", postcode: "7511" },
        query: "ps5",
      }).success
    ).toBe(false);
  });

  it("rejects a location with neither place nor postcode", () => {
    expect(
      findMarktplaatsListingsInputSchema.safeParse({
        location: {},
        query: "ps5",
      }).success
    ).toBe(false);
  });

  it("rejects minPriceEuro greater than maxPriceEuro", () => {
    expect(
      findMarktplaatsListingsInputSchema.safeParse({
        maxPriceEuro: 100,
        minPriceEuro: 200,
        query: "ps5",
      }).success
    ).toBe(false);
  });

  it("rejects duplicate conditions", () => {
    expect(
      findMarktplaatsListingsInputSchema.safeParse({
        conditions: ["used", "used"],
        query: "ps5",
      }).success
    ).toBe(false);
  });

  it("rejects sortBy distance without a location", () => {
    expect(
      findMarktplaatsListingsInputSchema.safeParse({
        query: "ps5",
        sortBy: "distance",
      }).success
    ).toBe(false);
  });

  it("rejects a limit above 30", () => {
    expect(
      findMarktplaatsListingsInputSchema.safeParse({ limit: 31, query: "ps5" })
        .success
    ).toBe(false);
  });

  it("rejects an offset above 99", () => {
    expect(
      findMarktplaatsListingsInputSchema.safeParse({
        offset: 100,
        query: "ps5",
      }).success
    ).toBe(false);
  });

  it("rejects an offset plus limit beyond the 100-listing window", () => {
    expect(
      findMarktplaatsListingsInputSchema.safeParse({
        limit: 30,
        offset: 90,
        query: "ps5",
      }).success
    ).toBe(false);
  });

  it("accepts an offset plus limit at the 100-listing window", () => {
    expect(
      findMarktplaatsListingsInputSchema.safeParse({
        limit: 30,
        offset: 70,
        query: "ps5",
      }).success
    ).toBe(true);
  });

  it("rejects a radiusKm above 200", () => {
    expect(
      findMarktplaatsListingsInputSchema.safeParse({
        location: { place: "Enschede", radiusKm: 201 },
        query: "ps5",
      }).success
    ).toBe(false);
  });

  it("rejects a postcode starting with zero", () => {
    expect(
      findMarktplaatsListingsInputSchema.safeParse({
        location: { postcode: "0123", radiusKm: 10 },
        query: "ps5",
      }).success
    ).toBe(false);
  });

  it("rejects a listing id that is too short", () => {
    expect(
      getMarktplaatsListingInputSchema.safeParse({ id: "m123" }).success
    ).toBe(false);
  });

  it("rejects a listing id that does not start with m", () => {
    expect(
      getMarktplaatsListingInputSchema.safeParse({ id: "x123" }).success
    ).toBe(false);
  });
});
