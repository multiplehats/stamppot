import {
  CATALOG_FORMAT_VERSION,
  CATALOG_MANIFEST_KEY,
  CATALOG_SHARD_COUNT,
  type CatalogIndexRecord,
  type CatalogManifest,
  type CatalogRetailer,
  type CatalogShard,
  CHECKJEBON_DATA_URL,
  CHECKJEBON_SOURCE,
  CHECKJEBON_SOURCE_URL,
  type CheckjebonSource,
  catalogManifestSchema,
  catalogShardSchema,
  checkjebonSourceSchema,
  createProductUrl,
  eurosToCents,
  MAX_CATALOG_OBJECT_BYTES,
  offerSearchTokens,
  sha256Hex,
  shardIndexForPrefix,
  shardKey,
  tokenPrefix,
} from "./catalog-format";

const textEncoder = new TextEncoder();
const VERSION_HASH_LENGTH = 12;
const DEFAULT_PUBLICATION_CONCURRENCY = 8;

export interface CatalogArtifactObject {
  readonly body: Uint8Array;
  readonly key: string;
  readonly sha256: string;
}

export interface BuiltCatalogArtifacts {
  readonly manifest: CatalogManifest;
  readonly manifestHash: string;
  readonly manifestObject: CatalogArtifactObject;
  readonly objects: readonly CatalogArtifactObject[];
  readonly offerCount: number;
  readonly retailerCount: number;
  readonly version: string;
  readonly versionObjects: readonly CatalogArtifactObject[];
}

export interface CatalogPublisher {
  readonly put: (object: CatalogArtifactObject) => Promise<void>;
}

interface NormalizedRetailer {
  readonly displayName: string;
  readonly logoUrl: string;
  readonly products: readonly {
    readonly name: string;
    readonly packageText: string;
    readonly priceEuros: number;
    readonly sourcePath: string;
  }[];
  readonly productUrlBase: string;
  readonly slug: string;
}

interface IndexedOffer {
  readonly packageText: string;
  readonly priceCents: number;
  readonly productName: string;
  readonly retailerIndex: number;
  readonly searchTokens: readonly string[];
  readonly sourcePath: string;
}

function canonicalJson(value: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(value));
}

function normalizeObservationTime(observedAt: Date): string {
  if (!Number.isFinite(observedAt.getTime())) {
    throw new Error("Observation time must be a valid instant");
  }
  return observedAt.toISOString();
}

function versionTimestamp(observedAt: string): string {
  return observedAt.replaceAll("-", "").replaceAll(":", "").replace(".", "");
}

function normalizeSource(source: unknown): readonly NormalizedRetailer[] {
  const parsed = checkjebonSourceSchema.parse(source);
  const retailerSlugs = new Set<string>();

  const retailers = parsed.map((retailer) => {
    if (retailerSlugs.has(retailer.n)) {
      throw new Error("Source contains a duplicate retailer slug");
    }
    retailerSlugs.add(retailer.n);

    const sourcePaths = new Set<string>();
    const products = retailer.d.map((product) => {
      if (sourcePaths.has(product.l)) {
        throw new Error("Source contains a duplicate retailer product path");
      }
      sourcePaths.add(product.l);
      return {
        name: product.n,
        packageText: product.s,
        priceEuros: product.p,
        sourcePath: product.l,
      };
    });

    products.sort(
      (left, right) =>
        left.sourcePath.localeCompare(right.sourcePath) ||
        left.name.localeCompare(right.name)
    );
    return {
      displayName: retailer.c,
      logoUrl: retailer.i,
      products,
      productUrlBase: retailer.u,
      slug: retailer.n,
    };
  });

  retailers.sort((left, right) => left.slug.localeCompare(right.slug));
  return retailers;
}

function sourceForHash(retailers: readonly NormalizedRetailer[]): unknown {
  return retailers.map((retailer) => ({
    c: retailer.displayName,
    d: retailer.products.map((product) => ({
      l: product.sourcePath,
      n: product.name,
      p: product.priceEuros,
      s: product.packageText,
    })),
    i: retailer.logoUrl,
    n: retailer.slug,
    u: retailer.productUrlBase,
  }));
}

function buildOffers(
  retailers: readonly NormalizedRetailer[]
): readonly IndexedOffer[] {
  const offers: IndexedOffer[] = [];
  for (const [retailerIndex, retailer] of retailers.entries()) {
    for (const product of retailer.products) {
      const searchTokens = offerSearchTokens(product.name);
      if (searchTokens.length === 0) {
        continue;
      }
      createProductUrl(retailer.productUrlBase, product.sourcePath);
      offers.push({
        packageText: product.packageText,
        priceCents: eurosToCents(product.priceEuros),
        productName: product.name,
        retailerIndex,
        searchTokens,
        sourcePath: product.sourcePath,
      });
    }
  }
  offers.sort(
    (left, right) =>
      left.retailerIndex - right.retailerIndex ||
      left.sourcePath.localeCompare(right.sourcePath) ||
      left.productName.localeCompare(right.productName)
  );
  return offers;
}

function indexOffers(
  offers: readonly IndexedOffer[]
): readonly CatalogIndexRecord[][] {
  const shards: CatalogIndexRecord[][] = Array.from(
    { length: CATALOG_SHARD_COUNT },
    () => []
  );

  for (const offer of offers) {
    const prefixesByShard = new Map<number, Set<string>>();
    for (const token of offer.searchTokens) {
      const prefix = tokenPrefix(token);
      if (prefix === undefined) {
        continue;
      }
      const shardIndex = shardIndexForPrefix(prefix);
      const prefixes = prefixesByShard.get(shardIndex) ?? new Set<string>();
      prefixes.add(prefix);
      prefixesByShard.set(shardIndex, prefixes);
    }

    for (const [shardIndex, prefixes] of prefixesByShard) {
      shards[shardIndex]?.push([
        [...prefixes].sort(),
        offer.retailerIndex,
        offer.productName,
        offer.packageText,
        offer.priceCents,
        offer.sourcePath,
      ]);
    }
  }

  for (const shard of shards) {
    shard.sort(
      (left, right) =>
        left[1] - right[1] ||
        left[5].localeCompare(right[5]) ||
        left[2].localeCompare(right[2])
    );
  }
  return shards;
}

async function artifactObject(
  key: string,
  value: unknown
): Promise<CatalogArtifactObject> {
  const body = canonicalJson(value);
  return { body, key, sha256: await sha256Hex(body) };
}

function assertCatalogShardSize(object: CatalogArtifactObject): void {
  if (object.body.byteLength > MAX_CATALOG_OBJECT_BYTES) {
    throw new Error(
      `Catalog shard ${object.key} exceeds the ${MAX_CATALOG_OBJECT_BYTES}-byte limit`
    );
  }
}

export async function buildCatalogArtifacts(options: {
  readonly observedAt: Date;
  readonly source: unknown;
}): Promise<BuiltCatalogArtifacts> {
  const observedAt = normalizeObservationTime(options.observedAt);
  const retailers = normalizeSource(options.source);
  const normalizedSourceBody = canonicalJson(sourceForHash(retailers));
  const sourceHash = await sha256Hex(normalizedSourceBody);
  const version = `${versionTimestamp(observedAt)}-${sourceHash.slice(
    0,
    VERSION_HASH_LENGTH
  )}`;
  const offers = buildOffers(retailers);
  if (offers.length === 0) {
    throw new Error("Catalog source must contain at least one offer");
  }
  const indexedShards = indexOffers(offers);
  const catalogRetailers: CatalogRetailer[] = retailers.map((retailer) => [
    retailer.slug,
    retailer.displayName,
    retailer.productUrlBase,
    retailer.logoUrl,
  ]);
  const shardArtifacts = await Promise.all(
    indexedShards.map(async (records, shardIndex) => {
      const shard = catalogShardSchema.parse({
        catalogVersion: version,
        formatVersion: CATALOG_FORMAT_VERSION,
        records,
        retailers: catalogRetailers,
        shardIndex,
      } satisfies CatalogShard);
      const object = await artifactObject(shardKey(version, shardIndex), shard);
      assertCatalogShardSize(object);
      return {
        manifestShard: {
          byteLength: object.body.byteLength,
          key: object.key,
          sha256: object.sha256,
        } satisfies CatalogManifest["shards"][number],
        object,
      };
    })
  );
  const versionObjects = shardArtifacts.map(({ object }) => object);
  const manifestShards = shardArtifacts.map(
    ({ manifestShard }) => manifestShard
  );

  const manifest = catalogManifestSchema.parse({
    currentVersion: version,
    formatVersion: CATALOG_FORMAT_VERSION,
    observedAt,
    offerCount: offers.length,
    retailerCount: retailers.length,
    shardCount: CATALOG_SHARD_COUNT,
    shards: manifestShards,
    source: {
      dataUrl: CHECKJEBON_DATA_URL,
      ...CHECKJEBON_SOURCE,
      url: CHECKJEBON_SOURCE_URL,
    },
  } satisfies CatalogManifest);
  const manifestObject = await artifactObject(CATALOG_MANIFEST_KEY, manifest);

  return {
    manifest,
    manifestHash: manifestObject.sha256,
    manifestObject,
    objects: [...versionObjects, manifestObject],
    offerCount: offers.length,
    retailerCount: retailers.length,
    version,
    versionObjects,
  };
}

export async function validateCatalogArtifacts(
  artifacts: BuiltCatalogArtifacts
): Promise<void> {
  const manifest = catalogManifestSchema.parse(artifacts.manifest);
  if (artifacts.versionObjects.length !== CATALOG_SHARD_COUNT) {
    throw new Error("Catalog build must contain exactly 128 version shards");
  }
  if (artifacts.objects.at(-1)?.key !== CATALOG_MANIFEST_KEY) {
    throw new Error("Catalog manifest must be the final artifact object");
  }

  await Promise.all(
    artifacts.versionObjects.map(async (object, index) => {
      assertCatalogShardSize(object);
      const manifestShard = manifest.shards[index];
      if (
        manifestShard === undefined ||
        manifestShard.key !== object.key ||
        manifestShard.byteLength !== object.body.byteLength ||
        manifestShard.sha256 !== object.sha256 ||
        (await sha256Hex(object.body)) !== object.sha256
      ) {
        throw new Error("Catalog shard integrity validation failed");
      }
      catalogShardSchema.parse(
        JSON.parse(new TextDecoder().decode(object.body))
      );
    })
  );

  if (
    (await sha256Hex(artifacts.manifestObject.body)) !== artifacts.manifestHash
  ) {
    throw new Error("Catalog manifest integrity validation failed");
  }
}

async function publishInBatches(
  objects: readonly CatalogArtifactObject[],
  publisher: CatalogPublisher,
  concurrency: number,
  startIndex = 0
): Promise<void> {
  if (startIndex >= objects.length) {
    return;
  }
  const batch = objects.slice(startIndex, startIndex + concurrency);
  await Promise.all(batch.map((object) => publisher.put(object)));
  await publishInBatches(
    objects,
    publisher,
    concurrency,
    startIndex + concurrency
  );
}

export async function publishCatalogArtifacts(
  artifacts: BuiltCatalogArtifacts,
  publisher: CatalogPublisher,
  concurrency = DEFAULT_PUBLICATION_CONCURRENCY
): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error("Catalog publication concurrency must be between 1 and 32");
  }
  await validateCatalogArtifacts(artifacts);
  await publishInBatches(artifacts.versionObjects, publisher, concurrency);
  await publisher.put(artifacts.manifestObject);
}

export function parseCheckjebonSource(source: unknown): CheckjebonSource {
  return checkjebonSourceSchema.parse(source);
}
