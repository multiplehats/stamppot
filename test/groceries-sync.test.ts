import {
  buildCatalogArtifacts,
  type CatalogArtifactObject,
  type CatalogPublisher,
  publishCatalogArtifacts,
  validateCatalogArtifacts,
} from "@stamppot/mcp-groceries/catalog-build";
import { describe, expect, it } from "vitest";
import fixtureText from "../packages/mcp-groceries/fixtures/checkjebon-small.json?raw";

const fixture = JSON.parse(fixtureText) as unknown;
const FIXED_OBSERVED_AT = new Date("2026-08-27T08:15:30.000Z");

class RecordingPublisher implements CatalogPublisher {
  readonly objects: CatalogArtifactObject[] = [];

  put(object: CatalogArtifactObject): Promise<void> {
    this.objects.push(object);
    return Promise.resolve();
  }
}

describe("grocery catalog build and publication", () => {
  it("builds one deterministic manifest plus exactly 128 immutable shards", async () => {
    const first = await buildCatalogArtifacts({
      observedAt: FIXED_OBSERVED_AT,
      source: fixture,
    });
    const second = await buildCatalogArtifacts({
      observedAt: FIXED_OBSERVED_AT,
      source: fixture,
    });

    await expect(validateCatalogArtifacts(first)).resolves.toBeUndefined();
    expect(first.versionObjects).toHaveLength(128);
    expect(first.objects).toHaveLength(129);
    expect(first.objects.at(-1)?.key).toBe("catalog/manifest.json");
    expect(first.manifest.shardCount).toBe(128);
    expect(first.manifest.offerCount).toBe(25);
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

  it("strictly rejects empty, malformed, or duplicate source data", async () => {
    await expect(
      buildCatalogArtifacts({ observedAt: FIXED_OBSERVED_AT, source: [] })
    ).rejects.toThrow();
    await expect(
      buildCatalogArtifacts({
        observedAt: FIXED_OBSERVED_AT,
        source: [{ c: "Missing required fields" }],
      })
    ).rejects.toThrow();

    const retailerRecords = fixture as Record<string, unknown>[];
    const [firstRetailer] = retailerRecords;
    const duplicateRetailers = [...retailerRecords, firstRetailer];
    await expect(
      buildCatalogArtifacts({
        observedAt: FIXED_OBSERVED_AT,
        source: duplicateRetailers,
      })
    ).rejects.toThrow("duplicate retailer slug");
  });

  it("publishes a new observed version when unchanged prices are seen later", async () => {
    const first = await buildCatalogArtifacts({
      observedAt: FIXED_OBSERVED_AT,
      source: fixture,
    });
    const later = await buildCatalogArtifacts({
      observedAt: new Date("2026-08-28T08:15:30.000Z"),
      source: fixture,
    });

    expect(later.version).not.toBe(first.version);
    expect(later.version.slice(-12)).toBe(first.version.slice(-12));
    expect(later.manifest.observedAt).toBe("2026-08-28T08:15:30.000Z");
  });

  it("publishes all version objects before replacing the manifest", async () => {
    const artifacts = await buildCatalogArtifacts({
      observedAt: FIXED_OBSERVED_AT,
      source: fixture,
    });
    const publisher = new RecordingPublisher();

    await publishCatalogArtifacts(artifacts, publisher, 5);

    expect(publisher.objects).toHaveLength(129);
    expect(publisher.objects.at(-1)?.key).toBe("catalog/manifest.json");
    expect(
      publisher.objects
        .slice(0, -1)
        .every(({ key }) => key !== "catalog/manifest.json")
    ).toBe(true);
    expect(Object.keys(publisher)).toEqual(["objects"]);
    expect("list" in publisher).toBe(false);
    expect("delete" in publisher).toBe(false);
  });

  it("leaves the previous manifest live when a version upload fails", async () => {
    const artifacts = await buildCatalogArtifacts({
      observedAt: FIXED_OBSERVED_AT,
      source: fixture,
    });
    let liveManifest = "previous-manifest";
    const publisher: CatalogPublisher = {
      put(object): Promise<void> {
        if (object.key.endsWith("/005.json")) {
          return Promise.reject(new Error("synthetic publication failure"));
        }
        if (object.key === "catalog/manifest.json") {
          liveManifest = new TextDecoder().decode(object.body);
        }
        return Promise.resolve();
      },
    };

    await expect(
      publishCatalogArtifacts(artifacts, publisher, 4)
    ).rejects.toThrow("synthetic publication failure");
    expect(liveManifest).toBe("previous-manifest");
  });
});
