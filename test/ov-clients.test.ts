import { describe, expect, it } from "vitest";
import departuresText from "../packages/mcp-ov/fixtures/ns-departures.json?raw";
import disruptionsText from "../packages/mcp-ov/fixtures/ns-disruptions.json?raw";
import unknownStationText from "../packages/mcp-ov/fixtures/ns-error-unknown-station.json?raw";
import tripsText from "../packages/mcp-ov/fixtures/ns-trips.json?raw";
import stopDeparturesText from "../packages/mcp-ov/fixtures/ovapi-stoparea-departures.json?raw";
import {
  UnknownStationError,
  UnknownStopError,
  UpstreamUnavailableError,
} from "../packages/mcp-ov/src/contracts";
import { NsClient } from "../packages/mcp-ov/src/ns-client";
import { OvApiClient } from "../packages/mcp-ov/src/ovapi-client";
import {
  MemoryUpstreamCache,
  type UpstreamFetch,
} from "../packages/mcp-ov/src/upstream";

const NOW = new Date("2026-08-28T14:00:00.000Z");
const WALL_CLOCK_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

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

function nsClient(
  responder: (url: string) => Response | Promise<Response>,
  options: { apiKey?: string | undefined } = {}
) {
  const cache = new MemoryUpstreamCache(() => NOW.getTime());
  const { calls, fetchImplementation } = recordingFetch(responder);
  const client = new NsClient({
    apiKey: () => ("apiKey" in options ? options.apiKey : "test-ns-key"),
    cache,
    fetchImplementation,
  });
  return { cache, calls, client };
}

function ovApiClient(responder: (url: string) => Response | Promise<Response>) {
  const cache = new MemoryUpstreamCache(() => NOW.getTime());
  const { calls, fetchImplementation } = recordingFetch(responder);
  const client = new OvApiClient({ cache, fetchImplementation });
  return { cache, calls, client };
}

describe("NS client", () => {
  it("maps a trip response and normalises colon-less offsets", async () => {
    const { client } = nsClient(() => jsonResponse(tripsText));

    const result = await client.planJourney(
      {
        fromStation: "asd",
        limit: 6,
        searchForArrival: false,
        toStation: "ut",
      },
      context()
    );

    expect(result.journeys).toHaveLength(2);
    const [first, second] = result.journeys;
    expect(first?.plannedDurationInMinutes).toBe(27);
    expect(first?.transfers).toBe(0);
    expect(first?.cancelled).toBe(false);
    expect(first?.truncatedLegCount).toBe(0);
    expect(first?.legs[0]?.origin.plannedDateTime).toBe(
      "2026-08-28T16:05:00+02:00"
    );
    expect(first?.legs[0]?.origin.actualTrack).toBe("12a");
    expect(first?.legs[0]?.productCategory).toBe("Intercity");
    expect(first?.legs[0]?.operatorName).toBe("NS");
    expect(second?.legs).toHaveLength(2);
    expect(result.observedAt).toBe(NOW.toISOString());
  });

  it("sends the key in a header and never in the cache key", async () => {
    const { cache, calls, client } = nsClient(() => jsonResponse(tripsText));

    await client.planJourney(
      {
        fromStation: "asd",
        limit: 6,
        searchForArrival: false,
        toStation: "ut",
      },
      context()
    );

    const [call] = calls;
    expect(call?.method).toBe("GET");
    expect(call?.headers["ocp-apim-subscription-key"]).toBe("test-ns-key");
    expect(call?.url).toContain("fromStation=ASD");
    expect(call?.url).not.toContain("test-ns-key");
    expect(cache.writes.every((url) => !url.includes("test-ns-key"))).toBe(
      true
    );
  });

  it("serves a repeat read from the cache without fetching again", async () => {
    const { calls, client } = nsClient(() => jsonResponse(departuresText));
    const input = { limit: 15, station: "ut" };

    const first = await client.departures(input, context());
    const second = await client.departures(input, context());

    expect(calls).toHaveLength(1);
    expect(second.departures).toEqual(first.departures);
  });

  it("maps a departure board including cancellations and messages", async () => {
    const { client } = nsClient(() => jsonResponse(departuresText));

    const result = await client.departures(
      { limit: 2, station: "ut" },
      context()
    );

    expect(result.departures).toHaveLength(2);
    const [first, second] = result.departures;
    expect(first?.direction).toBe("Utrecht Centraal");
    expect(first?.plannedDateTime).toBe("2026-08-28T16:05:00+02:00");
    expect(first?.actualDateTime).toBe("2026-08-28T16:08:00+02:00");
    expect(first?.plannedTrack).toBe("11b");
    expect(first?.actualTrack).toBe("12a");
    expect(first?.messages).toEqual([
      "Deze trein vertrekt vandaag van spoor 12a.",
    ]);
    expect(second?.cancelled).toBe(true);
  });

  it("filters disruptions by active state and type", async () => {
    const { client } = nsClient(() => jsonResponse(disruptionsText));

    const active = await client.disruptions({ activeOnly: true }, context());
    const all = await client.disruptions({ activeOnly: false }, context());
    const maintenance = await client.disruptions(
      { activeOnly: false, types: ["MAINTENANCE"] },
      context()
    );

    expect(active.disruptions.map(({ id }) => id)).toEqual(["disruption-1"]);
    expect(all.disruptions).toHaveLength(2);
    expect(maintenance.disruptions.map(({ id }) => id)).toEqual([
      "maintenance-1",
    ]);
    const [first] = active.disruptions;
    expect(first?.cause).toBe("een defecte trein");
    expect(first?.situation).toBe("Er rijden minder treinen.");
    expect(first?.phase).toBe("Onbekend");
    expect(first?.start).toBe("2026-08-28T14:00:00+02:00");
    expect(first?.advices).toHaveLength(2);
  });

  it("reports an unknown station rather than an availability failure", async () => {
    const { client } = nsClient(() => jsonResponse(unknownStationText, 400));

    await expect(
      client.planJourney(
        {
          fromStation: "zzzz",
          limit: 6,
          searchForArrival: false,
          toStation: "ut",
        },
        context()
      )
    ).rejects.toBeInstanceOf(UnknownStationError);
  });

  it("treats other upstream statuses, network faults and bad JSON as unavailable", async () => {
    const serverError = nsClient(() => jsonResponse("{}", 503));
    const networkFault = nsClient(() => {
      throw new Error("connection reset");
    });
    const malformed = nsClient(() => jsonResponse("not json at all"));
    const input = { limit: 15, station: "ut" };

    await expect(
      serverError.client.departures(input, context())
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    await expect(
      networkFault.client.departures(input, context())
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    await expect(
      malformed.client.departures(input, context())
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("short-circuits without fetching when no key is configured", async () => {
    const { calls, client } = nsClient(() => jsonResponse(departuresText), {
      apiKey: undefined,
    });

    await expect(
      client.departures({ limit: 15, station: "ut" }, context())
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(calls).toEqual([]);
  });
});

describe("OVapi client", () => {
  it("maps stop-area departures and keeps wall-clock times verbatim", async () => {
    const { calls, client } = ovApiClient(() =>
      jsonResponse(stopDeparturesText)
    );

    const result = await client.departures(
      { limit: 15, stopAreaCode: "09500" },
      context()
    );

    expect(calls[0]?.url).toBe("http://v0.ovapi.nl/stopareacode/09500");
    expect(result.stopName).toBe("Centraal Station");
    expect(result.stopTown).toBe("Amsterdam");
    expect(result.departures.length).toBeGreaterThan(0);
    const [first] = result.departures;
    expect(first?.transportType).toBe("METRO");
    expect(first?.plannedDepartureLocal).toMatch(WALL_CLOCK_PATTERN);
    expect(first?.plannedDepartureLocal).not.toContain("+");
    expect(result.departures.map((departure) => departure.destination)).toEqual(
      expect.arrayContaining(["Gaasperplas"])
    );
  });

  it("caps the result at the requested limit in departure order", async () => {
    const { client } = ovApiClient(() => jsonResponse(stopDeparturesText));

    const result = await client.departures(
      { limit: 2, stopAreaCode: "09500" },
      context()
    );

    expect(result.departures).toHaveLength(2);
    const times = result.departures.map(
      (departure) =>
        departure.expectedDepartureLocal ??
        departure.plannedDepartureLocal ??
        ""
    );
    expect([...times].sort()).toEqual(times);
  });

  it("treats an empty 200 body as an unknown stop", async () => {
    const { client } = ovApiClient(() => jsonResponse("{}"));

    await expect(
      client.departures({ limit: 15, stopAreaCode: "zzzzz" }, context())
    ).rejects.toBeInstanceOf(UnknownStopError);
  });

  it("treats a timeout as an availability failure", async () => {
    const { client } = ovApiClient(() => {
      throw new DOMException("The operation was aborted", "TimeoutError");
    });

    await expect(
      client.departures({ limit: 15, stopAreaCode: "09500" }, context())
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});
