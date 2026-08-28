import type { Operation, OperationContext } from "@stamppot/core";
import { describe, expect, it } from "vitest";
import stationsText from "../packages/mcp-ov/fixtures/ns-stations-small.json?raw";
import stopAreasText from "../packages/mcp-ov/fixtures/ovapi-stopareas-small.json?raw";
import {
  StopDirectoryUnavailableError,
  UnknownStationError,
  UnknownStopError,
  UpstreamUnavailableError,
} from "../packages/mcp-ov/src/contracts";
import {
  createOvOperations,
  type OvMcpDependencies,
  type OvUpstreamLimiter,
  type StopDeparturesService,
  type StopDirectoryService,
  type TrainTravelService,
} from "../packages/mcp-ov/src/operations";
import { buildStopsArtifacts } from "../packages/mcp-ov/src/stops-build";
import {
  MemoryStopsObjectStore,
  StopDirectory,
} from "../packages/mcp-ov/src/stops-directory";

const NOW = new Date("2026-08-28T14:00:00.000Z");

function operationContext(): OperationContext {
  return {
    now: () => NOW,
    request: new Request("https://stamppot.test/v1/tools/probe"),
    signal: new AbortController().signal,
  };
}

function allowingLimiter(): OvUpstreamLimiter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    consume(_request, scope) {
      calls.push(scope);
      return Promise.resolve(true);
    },
  };
}

function denyingLimiter(): OvUpstreamLimiter {
  return { consume: () => Promise.resolve(false) };
}

function failingTrains(error: Error): TrainTravelService {
  return {
    departures: () => Promise.reject(error),
    disruptions: () => Promise.reject(error),
    planJourney: () => Promise.reject(error),
  };
}

function failingStopDepartures(error: Error): StopDeparturesService {
  return { departures: () => Promise.reject(error) };
}

function unusedTrains(): TrainTravelService {
  return failingTrains(new Error("train service must not be called"));
}

function unusedStopDepartures(): StopDeparturesService {
  return failingStopDepartures(new Error("stop service must not be called"));
}

function failingDirectory(error: Error): StopDirectoryService {
  return { search: () => Promise.reject(error) };
}

async function memoryDirectory(): Promise<StopDirectory> {
  const artifacts = await buildStopsArtifacts({
    nsStations: JSON.parse(stationsText) as unknown,
    observedAt: new Date("2026-08-27T08:15:30.000Z"),
    ovApiStopAreas: JSON.parse(stopAreasText) as unknown,
  });
  return new StopDirectory(MemoryStopsObjectStore.fromArtifacts(artifacts));
}

function operations(
  overrides: Partial<OvMcpDependencies>
): ReadonlyMap<string, Operation> {
  const dependencies: OvMcpDependencies = {
    stopDepartures: unusedStopDepartures(),
    stopDirectory: failingDirectory(new StopDirectoryUnavailableError()),
    trains: unusedTrains(),
    upstreamLimiter: allowingLimiter(),
    ...overrides,
  };
  return new Map(
    createOvOperations(dependencies).map((operation) => [
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

describe("public transport operations", () => {
  it("registers exactly the five documented tools", () => {
    expect([...operations({}).keys()]).toEqual([
      "find_ov_stop",
      "plan_train_journey",
      "get_train_departures",
      "get_rail_disruptions",
      "get_stop_departures",
    ]);
  });

  it("resolves stop names to codes and states which tools accept them", async () => {
    const registry = operations({ stopDirectory: await memoryDirectory() });

    const result = (await invoke(registry, "find_ov_stop", {
      query: "amsterdam centraal",
    })) as unknown as {
      status: string;
      stops: { code: string; kind: string; usableWith: string[] }[];
    };

    expect(result).toMatchObject({ status: "ok" });
    const { stops } = result;
    const station = stops.find(({ kind }) => kind === "train_station");
    expect(station?.code).toBe("ASD");
    expect(station?.usableWith).toContain("plan_train_journey");
    const stopArea = stops.find(({ kind }) => kind === "stop_area");
    expect(stopArea?.usableWith).toEqual(["get_stop_departures"]);
  });

  it("keeps train stations and stop areas separable by kind", async () => {
    const registry = operations({ stopDirectory: await memoryDirectory() });

    const result = (await invoke(registry, "find_ov_stop", {
      kinds: ["stop_area"],
      query: "centraal station",
    })) as unknown as { stops: { kind: string }[] };

    const { stops } = result;
    expect(stops.length).toBeGreaterThan(0);
    expect(stops.every(({ kind }) => kind === "stop_area")).toBe(true);
  });

  it("returns an empty list rather than an error for an unmatched query", async () => {
    const registry = operations({ stopDirectory: await memoryDirectory() });

    const result = await invoke(registry, "find_ov_stop", {
      query: "ditbestaatniet",
    });

    expect(result).toMatchObject({ status: "ok", stops: [] });
  });

  it("reports an unavailable directory in band", async () => {
    const registry = operations({
      stopDirectory: failingDirectory(new StopDirectoryUnavailableError()),
    });

    await expect(
      invoke(registry, "find_ov_stop", { query: "utrecht" })
    ).resolves.toEqual({ retryable: true, status: "directory_unavailable" });
  });

  it("consumes the limiter before reaching an upstream", async () => {
    const limiter = allowingLimiter();
    const registry = operations({
      trains: failingTrains(new UpstreamUnavailableError()),
      upstreamLimiter: limiter,
    });

    await invoke(registry, "get_train_departures", { station: "ut" });

    expect(limiter.calls).toEqual(["trains"]);
  });

  it("answers rate_limited without calling the upstream at all", async () => {
    const registry = operations({
      stopDepartures: unusedStopDepartures(),
      trains: unusedTrains(),
      upstreamLimiter: denyingLimiter(),
    });

    for (const [name, input] of [
      ["plan_train_journey", { fromStation: "asd", toStation: "ut" }],
      ["get_train_departures", { station: "ut" }],
      ["get_rail_disruptions", {}],
      ["get_stop_departures", { stopAreaCode: "09500" }],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: Each tool is asserted against the same denying limiter in turn.
      await expect(invoke(registry, name, input)).resolves.toEqual({
        retryAfterSeconds: 60,
        retryable: true,
        status: "rate_limited",
      });
    }
  });

  it("maps every modelled upstream error to its in-band status", async () => {
    const unknownStation = operations({
      trains: failingTrains(new UnknownStationError()),
    });
    const unavailable = operations({
      trains: failingTrains(new UpstreamUnavailableError()),
    });
    const unknownStop = operations({
      stopDepartures: failingStopDepartures(new UnknownStopError()),
    });

    await expect(
      invoke(unknownStation, "plan_train_journey", {
        fromStation: "zzzz",
        toStation: "ut",
      })
    ).resolves.toEqual({ retryable: false, status: "unknown_station" });
    await expect(
      invoke(unavailable, "get_rail_disruptions", {})
    ).resolves.toEqual({
      retryAfterSeconds: 60,
      retryable: true,
      status: "upstream_unavailable",
    });
    await expect(
      invoke(unknownStop, "get_stop_departures", { stopAreaCode: "zzzzz" })
    ).resolves.toEqual({ retryable: false, status: "unknown_stop" });
  });

  it("replaces an unmodelled dependency failure with a generic error", async () => {
    const registry = operations({
      trains: failingTrains(new Error("NS key sk-live-123 was rejected")),
    });

    await expect(
      invoke(registry, "get_train_departures", { station: "ut" })
    ).rejects.toThrow("Public transport operation dependency failed");
  });

  it("rejects a stop-area code that is not a valid station code", async () => {
    const registry = operations({});

    await expect(
      invoke(registry, "get_train_departures", { station: "!" })
    ).rejects.toThrow();
  });
});
