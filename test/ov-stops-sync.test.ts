import { describe, expect, it } from "vitest";
import stationsText from "../packages/mcp-ov/fixtures/ns-stations-small.json?raw";
import stopAreasText from "../packages/mcp-ov/fixtures/ovapi-stopareas-small.json?raw";
import {
  buildStopsArtifacts,
  publishStopsArtifacts,
  type StopsArtifactObject,
  type StopsPublisher,
  validateStopsArtifacts,
} from "../packages/mcp-ov/src/stops-build";
import {
  MAX_STOPS_OBJECT_BYTES,
  STOPS_MANIFEST_KEY,
} from "../packages/mcp-ov/src/stops-format";

const nsStations = JSON.parse(stationsText) as unknown;
const ovApiStopAreas = JSON.parse(stopAreasText) as unknown;
const FIXED_OBSERVED_AT = new Date("2026-08-27T08:15:30.000Z");

function build(observedAt = FIXED_OBSERVED_AT) {
  return buildStopsArtifacts({ nsStations, observedAt, ovApiStopAreas });
}

class RecordingPublisher implements StopsPublisher {
  readonly objects: StopsArtifactObject[] = [];

  put(object: StopsArtifactObject): Promise<void> {
    this.objects.push(object);
    return Promise.resolve();
  }
}

describe("stops snapshot build and publication", () => {
  it("builds one deterministic snapshot plus its manifest", async () => {
    const first = await build();
    const second = await build();

    await expect(validateStopsArtifacts(first)).resolves.toBeUndefined();
    expect(first.objects).toHaveLength(2);
    expect(first.objects.at(-1)?.key).toBe(STOPS_MANIFEST_KEY);
    expect(first.snapshotObject.key).toBe(
      `stops/versions/${first.version}/stops.json`
    );
    expect(first.manifest.stopCount).toBe(
      first.stationCount + first.stopAreaCount
    );
    expect(
      first.objects.map(({ body, key }) => ({
        body: new TextDecoder().decode(body),
        key,
      }))
    ).toEqual(
      second.objects.map(({ body, key }) => ({
        body: new TextDecoder().decode(body),
        key,
      }))
    );
  });

  it("keeps only Dutch NS stations and every OVapi stop area", async () => {
    const artifacts = await build();
    const snapshot = JSON.parse(
      new TextDecoder().decode(artifacts.snapshotObject.body)
    ) as { records: [number, string, string, string, string][] };
    const codes = snapshot.records.map((record) => record[1]);

    expect(codes).toContain("ASD");
    expect(codes).toContain("09500");
    expect(codes).not.toContain("BRUX");
    expect(artifacts.stationCount).toBe(5);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("rejects empty or malformed source data", async () => {
    await expect(
      buildStopsArtifacts({
        nsStations: { payload: [] },
        observedAt: FIXED_OBSERVED_AT,
        ovApiStopAreas: {},
      })
    ).rejects.toThrow("at least one stop");
    await expect(
      buildStopsArtifacts({
        nsStations: { payload: [{ noCode: true }] },
        observedAt: FIXED_OBSERVED_AT,
        ovApiStopAreas,
      })
    ).rejects.toThrow();
    await expect(
      buildStopsArtifacts({
        nsStations,
        observedAt: new Date(Number.NaN),
        ovApiStopAreas,
      })
    ).rejects.toThrow("valid instant");
  });

  it("publishes a new observed version for unchanged stop data", async () => {
    const first = await build();
    const later = await build(new Date("2026-08-28T08:15:30.000Z"));

    expect(later.version).not.toBe(first.version);
    expect(later.version.slice(-12)).toBe(first.version.slice(-12));
    expect(later.manifest.observedAt).toBe("2026-08-28T08:15:30.000Z");
  });

  it("rejects an oversized snapshot before publishing anything", async () => {
    const artifacts = await build();
    const snapshotObject = {
      ...artifacts.snapshotObject,
      body: new Uint8Array(MAX_STOPS_OBJECT_BYTES + 1),
    };
    const publisher = new RecordingPublisher();

    await expect(
      publishStopsArtifacts(
        {
          ...artifacts,
          objects: [snapshotObject, artifacts.manifestObject],
          snapshotObject,
        },
        publisher
      )
    ).rejects.toThrow("exceeds the 1048576-byte limit");
    expect(publisher.objects).toEqual([]);
  });

  it("publishes the immutable snapshot before replacing the manifest", async () => {
    const artifacts = await build();
    const publisher = new RecordingPublisher();

    await publishStopsArtifacts(artifacts, publisher);

    expect(publisher.objects.map(({ key }) => key)).toEqual([
      artifacts.snapshotObject.key,
      STOPS_MANIFEST_KEY,
    ]);
  });

  it("leaves the previous manifest live when the snapshot upload fails", async () => {
    const artifacts = await build();
    let liveManifest = "previous-manifest";
    const publisher: StopsPublisher = {
      put(object): Promise<void> {
        if (object.key === STOPS_MANIFEST_KEY) {
          liveManifest = new TextDecoder().decode(object.body);
          return Promise.resolve();
        }
        return Promise.reject(new Error("synthetic publication failure"));
      },
    };

    await expect(publishStopsArtifacts(artifacts, publisher)).rejects.toThrow(
      "synthetic publication failure"
    );
    expect(liveManifest).toBe("previous-manifest");
  });

  it("rejects a manifest that points at a different snapshot version", async () => {
    const artifacts = await build();

    await expect(
      validateStopsArtifacts({
        ...artifacts,
        manifest: { ...artifacts.manifest, currentVersion: "tampered" },
      })
    ).rejects.toThrow("does not match the manifest");
  });
});
