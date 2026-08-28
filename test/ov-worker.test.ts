import { env, SELF } from "cloudflare:test";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import departuresText from "../packages/mcp-ov/fixtures/ns-departures.json?raw";
import stationsText from "../packages/mcp-ov/fixtures/ns-stations-small.json?raw";
import tripsText from "../packages/mcp-ov/fixtures/ns-trips.json?raw";
import stopDeparturesText from "../packages/mcp-ov/fixtures/ovapi-stoparea-departures.json?raw";
import stopAreasText from "../packages/mcp-ov/fixtures/ovapi-stopareas-small.json?raw";
import {
  buildStopsArtifacts,
  publishStopsArtifacts,
} from "../packages/mcp-ov/src/stops-build";

const MCP_PROTOCOL_VERSION = "2026-07-28";
const NS_HOST = "https://gateway.apiportal.ns.nl";
const OVAPI_HOST = "http://v0.ovapi.nl";

const upstreamCalls: string[] = [];

/**
 * `@cloudflare/vitest-plugin` 1.1.1 exports no `fetchMock`, so outbound
 * traffic is intercepted by replacing the global `fetch` the Worker shares with
 * this test. Anything unmatched throws, which is the `disableNetConnect`
 * guarantee: no test may reach a live upstream.
 */
function stubUpstreams(
  routes: readonly (readonly [string, () => Response])[]
): void {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    // Constructing a real Request makes the runtime validate the init the
    // client passed, so an option workerd rejects fails here too.
    const { url } = new Request(input, init);
    upstreamCalls.push(url);
    for (const [prefix, respond] of routes) {
      if (url.startsWith(prefix)) {
        return Promise.resolve(respond());
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

function callTool(name: string, body: unknown): Promise<Response> {
  return SELF.fetch(`https://stamppot.test/v1/tools/${name}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("Stamppot Worker public transport routes", () => {
  beforeAll(async () => {
    const artifacts = await buildStopsArtifacts({
      nsStations: JSON.parse(stationsText) as unknown,
      observedAt: new Date("2026-08-27T08:15:30.000Z"),
      ovApiStopAreas: JSON.parse(stopAreasText) as unknown,
    });
    await publishStopsArtifacts(artifacts, {
      put: async ({ body, key }) => {
        await env.OV_STOPS.put(key, body);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    upstreamCalls.length = 0;
  });

  it("resolves a stop name to codes without touching an upstream", async () => {
    stubUpstreams([]);

    const response = await callTool("find_ov_stop", {
      query: "amsterdam centraal",
    });
    const result = await response.json<{
      status: string;
      stops: { code: string; kind: string }[];
    }>();

    expect(response.status).toBe(200);
    expect(result.status).toBe("ok");
    expect(result.stops.map(({ code }) => code)).toContain("ASD");
    expect(upstreamCalls).toEqual([]);
  });

  it("plans a train journey through the real NS client and cache path", async () => {
    stubUpstreams([
      [`${NS_HOST}/reisinformatie-api/api/v3/trips`, () => json(tripsText)],
    ]);

    const response = await callTool("plan_train_journey", {
      fromStation: "asd",
      toStation: "ut",
    });
    const result = await response.json<{
      journeys: { legs: { origin: { plannedDateTime?: string } }[] }[];
      source: { name: string };
      status: string;
    }>();

    expect(response.status).toBe(200);
    expect(result.status).toBe("ok");
    expect(result.source.name).toBe("NS Reisinformatie API");
    expect(result.journeys).toHaveLength(2);
    expect(result.journeys[0]?.legs[0]?.origin.plannedDateTime).toBe(
      "2026-08-28T16:05:00+02:00"
    );
    expect(upstreamCalls).toHaveLength(1);
    expect(upstreamCalls[0]).toContain("fromStation=ASD");
  });

  it("serves a repeated read from the Workers cache without a second fetch", async () => {
    stubUpstreams([
      [
        `${NS_HOST}/reisinformatie-api/api/v2/departures`,
        () => json(departuresText),
      ],
    ]);

    const first = await callTool("get_train_departures", { station: "amr" });
    const second = await callTool("get_train_departures", { station: "amr" });

    await expect(first.json()).resolves.toMatchObject({ status: "ok" });
    await expect(second.json()).resolves.toMatchObject({ status: "ok" });
    expect(upstreamCalls).toHaveLength(1);
  });

  it("reads a train departure board", async () => {
    stubUpstreams([
      [
        `${NS_HOST}/reisinformatie-api/api/v2/departures`,
        () => json(departuresText),
      ],
    ]);

    const response = await callTool("get_train_departures", {
      limit: 2,
      station: "ut",
    });
    const result = await response.json<{
      departures: { cancelled: boolean; direction: string }[];
      status: string;
    }>();

    expect(result.status).toBe("ok");
    expect(result.departures).toHaveLength(2);
    expect(result.departures[1]?.cancelled).toBe(true);
  });

  it("reads stop-area departures over the OVapi plain-HTTP origin", async () => {
    stubUpstreams([
      [`${OVAPI_HOST}/stopareacode/`, () => json(stopDeparturesText)],
    ]);

    const response = await callTool("get_stop_departures", {
      limit: 3,
      stopAreaCode: "09500",
    });
    const result = await response.json<{
      departures: { plannedDepartureLocal?: string }[];
      source: { note: string; official: boolean };
      status: string;
      timezone: string;
    }>();

    expect(result.status).toBe("ok");
    expect(result.timezone).toBe("Europe/Amsterdam");
    expect(result.source.official).toBe(false);
    expect(result.source.note).toBe("onofficiële bron");
    expect(result.departures.length).toBeGreaterThan(0);
    expect(result.departures[0]?.plannedDepartureLocal).not.toContain("+");
    expect(upstreamCalls[0]).toBe(`${OVAPI_HOST}/stopareacode/09500`);
  });

  it("answers upstream_unavailable in band when the upstream cannot be reached", async () => {
    stubUpstreams([]);

    const response = await callTool("get_rail_disruptions", {});
    const result = await response.json<Record<string, unknown>>();

    expect(response.status).toBe(200);
    expect(result).toEqual({
      retryAfterSeconds: 60,
      retryable: true,
      status: "upstream_unavailable",
    });
    expect(JSON.stringify(result)).not.toContain("gateway.apiportal.ns.nl");
  });

  it("rejects malformed input before invoking the tool", async () => {
    stubUpstreams([]);

    const response = await callTool("get_stop_departures", {
      stopAreaCode: "!",
    });
    const result = await response.json<{ error: { code: string } }>();

    expect(response.status).toBe(400);
    expect(result.error.code).toBe("invalid_input");
    expect(upstreamCalls).toEqual([]);
  });

  it("renders an indexable page and Markdown for a public transport tool", async () => {
    const html = await SELF.fetch("https://stamppot.test/tools/find_ov_stop");
    const markdown = await SELF.fetch(
      "https://stamppot.test/tools/find_ov_stop",
      { headers: { accept: "text/markdown" } }
    );

    expect(html.status).toBe(200);
    expect(await html.text()).toContain(
      "Nederlandse station- en haltecodes opzoeken"
    );
    expect(await markdown.text()).toContain("## Werkwijze voor agents");
  });

  it("exposes exactly the five public transport tools on /mcp/ov", async () => {
    const domainTools = await listTools("https://stamppot.test/mcp/ov");
    const combinedTools = await listTools("https://stamppot.test/mcp");

    expect(domainTools.sort()).toEqual(
      [
        "find_ov_stop",
        "get_rail_disruptions",
        "get_stop_departures",
        "get_train_departures",
        "plan_train_journey",
      ].sort()
    );
    expect(combinedTools).toContain("find_ov_stop");
    expect(combinedTools).toContain("find_grocery_options");
  });
});

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
