import { SELF } from "cloudflare:test";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import listingHtml from "../packages/mcp-marktplaats/fixtures/marktplaats-listing.html?raw";
import searchText from "../packages/mcp-marktplaats/fixtures/marktplaats-search.json?raw";
import pdokPostcodeText from "../packages/mcp-marktplaats/fixtures/pdok-postcode.json?raw";
import pdokWoonplaatsText from "../packages/mcp-marktplaats/fixtures/pdok-woonplaats.json?raw";

const MCP_PROTOCOL_VERSION = "2026-07-28";
const SEARCH_HOST = "https://www.marktplaats.nl/lrp/api/search";
const LISTING_ID_HOST = "https://www.marktplaats.nl/m";
const LISTING_CANONICAL_HOST = "https://www.marktplaats.nl/v/";
const PDOK_HOST = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const CANONICAL_LISTING_PATH =
  "/v/spelcomputers-en-games/spelcomputers-sony-playstation-5/m2437783300-ps5-disk-edition";

const upstreamCalls: string[] = [];

/**
 * `@cloudflare/vitest-plugin` 1.1.1 exports no `fetchMock`, so outbound
 * traffic is intercepted by replacing the global `fetch` the Worker shares with
 * this test. Anything unmatched throws, which is the `disableNetConnect`
 * guarantee: no test may reach a live upstream.
 */
function stubUpstreams(
  routes: readonly (readonly [string, (url: string) => Response])[]
): void {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const { url } = new Request(input, init);
    upstreamCalls.push(url);
    for (const [prefix, respond] of routes) {
      if (url.startsWith(prefix)) {
        return Promise.resolve(respond(url));
      }
    }
    return Promise.reject(
      new Error(`Unexpected outbound request in a test: ${url}`)
    );
  });
}

function json(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function html(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/html" },
    status: 200,
  });
}

function pdokRespond(url: string): Response {
  return url.includes("type%3Awoonplaats") || url.includes("type:woonplaats")
    ? json(pdokWoonplaatsText)
    : json(pdokPostcodeText);
}

function listingRedirectRespond(): Response {
  return new Response(null, {
    headers: { location: CANONICAL_LISTING_PATH },
    status: 301,
  });
}

/** Redirects `/m<id>` to a canonical path that carries the same `<id>`. */
function listingRedirectForRequestedId(url: string): Response {
  const id = new URL(url).pathname.slice(1);
  return new Response(null, {
    headers: {
      location: `/v/spelcomputers-en-games/spelcomputers-sony-playstation-5/${id}-ps5-disk-edition`,
    },
    status: 301,
  });
}

function callTool(name: string, body: unknown): Promise<Response> {
  return SELF.fetch(`https://stamppot.test/v1/tools/${name}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

async function listTools(url: string): Promise<string[]> {
  const response = await SELF.fetch(url, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "tools/list",
      params: {
        _meta: {
          [CLIENT_CAPABILITIES_META_KEY]: {},
          [CLIENT_INFO_META_KEY]: { name: "stamppot-test", version: "1" },
          [PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION,
        },
      },
    }),
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-method": "tools/list",
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
    },
    method: "POST",
  });
  const payload = await response.json<{
    result: { tools: { name: string }[] };
  }>();
  return payload.result.tools.map(({ name }) => name);
}

describe("Stamppot Worker Marktplaats routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    upstreamCalls.length = 0;
  });

  it("searches by place, resolving it through PDOK before the Marktplaats search", async () => {
    stubUpstreams([
      [PDOK_HOST, pdokRespond],
      [SEARCH_HOST, () => json(searchText)],
    ]);

    const response = await callTool("find_marktplaats_listings", {
      conditions: ["like_new", "used"],
      limit: 3,
      location: { place: "Enschede", radiusKm: 20 },
      query: "ps5",
    });
    const result = await response.json<{
      listings: unknown[];
      resolvedLocation: { postcode: string };
      source: { official: boolean };
      status: string;
    }>();

    expect(response.status).toBe(200);
    expect(result.status).toBe("ok");
    expect(result.resolvedLocation.postcode).toBe("7513CN");
    expect(result.listings).toHaveLength(3);
    expect(result.source.official).toBe(false);

    expect(upstreamCalls).toHaveLength(3);
    expect(upstreamCalls[0]).toContain(PDOK_HOST);
    expect(upstreamCalls[1]).toContain(PDOK_HOST);
    expect(upstreamCalls[2]).toContain(SEARCH_HOST);
    expect(upstreamCalls[2]).toContain("postcode=7513CN&distanceMeters=20000");
  });

  it("reads a listing through the real redirect and cache path", async () => {
    stubUpstreams([
      [LISTING_ID_HOST, listingRedirectRespond],
      [LISTING_CANONICAL_HOST, () => html(listingHtml)],
    ]);

    const response = await callTool("get_marktplaats_listing", {
      id: "m2437783300",
    });
    const bodyText = await response.text();
    const result = JSON.parse(bodyText) as {
      listing: { description: string; seller: { name: string } };
      status: string;
    };

    expect(response.status).toBe(200);
    expect(result.status).toBe("ok");
    expect(result.listing.seller.name).toBe("Verkoper A");
    expect(result.listing.description).toContain("Alles werkt naar behoren");
    expect(bodyText).not.toContain("Bieder");
  });

  it("serves a repeated listing read from the Workers cache without new upstream calls", async () => {
    // A fresh id, distinct from the listing read in the previous test: the
    // Workers Cache persists across tests in this file, so reusing that id
    // would make the "first" read below a cache hit too and prove nothing. The
    // redirect must carry that same id, or the listing client rejects it.
    stubUpstreams([
      [LISTING_ID_HOST, listingRedirectForRequestedId],
      [LISTING_CANONICAL_HOST, () => html(listingHtml)],
    ]);

    const first = await callTool("get_marktplaats_listing", {
      id: "m9999999999",
    });
    const second = await callTool("get_marktplaats_listing", {
      id: "m9999999999",
    });

    await expect(first.json()).resolves.toMatchObject({ status: "ok" });
    await expect(second.json()).resolves.toMatchObject({ status: "ok" });
    expect(upstreamCalls).toHaveLength(2);
  });

  it("refuses a listing redirect that points at a different advert", async () => {
    // `/m8888888888` redirects to a canonical path for another advert; the
    // client must reject it rather than return that advert under the asked id.
    stubUpstreams([
      [LISTING_ID_HOST, () => listingRedirectRespond()],
      [LISTING_CANONICAL_HOST, () => html(listingHtml)],
    ]);

    const response = await callTool("get_marktplaats_listing", {
      id: "m8888888888",
    });
    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(bodyText)).toMatchObject({
      status: "upstream_unavailable",
    });
    expect(bodyText).not.toContain("m2437783300");
  });

  it("answers upstream_unavailable in band when the search upstream is unreachable", async () => {
    stubUpstreams([]);

    const response = await callTool("find_marktplaats_listings", {
      query: "ps5",
    });
    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(bodyText)).toEqual({
      retryAfterSeconds: 60,
      retryable: true,
      status: "upstream_unavailable",
    });
    expect(bodyText).not.toContain("marktplaats.nl");
    expect(bodyText).not.toContain("    at ");
  });

  it("rejects malformed input before invoking the tool", async () => {
    stubUpstreams([]);

    const response = await callTool("find_marktplaats_listings", {});
    const result = await response.json<{ error: { code: string } }>();

    expect(response.status).toBe(400);
    expect(result.error.code).toBe("invalid_input");
    expect(upstreamCalls).toEqual([]);
  });

  it("renders an indexable HTML page and Markdown for a Marktplaats tool", async () => {
    const htmlResponse = await SELF.fetch(
      "https://stamppot.test/tools/find_marktplaats_listings"
    );
    const markdownResponse = await SELF.fetch(
      "https://stamppot.test/tools/find_marktplaats_listings",
      { headers: { accept: "text/markdown" } }
    );

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain(
      "Tweedehands advertenties zoeken op Marktplaats"
    );
    const markdownBody = await markdownResponse.text();
    expect(markdownBody.startsWith("# ")).toBe(true);
  });

  it("exposes exactly the two Marktplaats tools on /mcp/marktplaats and via /mcp", async () => {
    const domainTools = await listTools(
      "https://stamppot.test/mcp/marktplaats"
    );
    const combinedTools = await listTools("https://stamppot.test/mcp");

    expect(domainTools.sort()).toEqual(
      ["find_marktplaats_listings", "get_marktplaats_listing"].sort()
    );
    expect(combinedTools).toContain("find_marktplaats_listings");
  });
});
