import type { BuiltCatalogArtifacts } from "./catalog-build";
import {
  CATALOG_MANIFEST_KEY,
  type CatalogIndexRecord,
  type CatalogManifest,
  type CatalogRetailer,
  type CatalogShard,
  CHECKJEBON_SOURCE,
  catalogManifestSchema,
  catalogShardSchema,
  createOfferId,
  createProductUrl,
  MAX_CATALOG_OBJECT_BYTES,
  normalizeQueryTokens,
  normalizeSearchText,
  type ParsedPackage,
  parsePackageText,
  selectQueryAnchor,
  shardIndexForPrefix,
  shardKey,
  tokenPrefix,
} from "./catalog-format";
import {
  type BasketAssumption,
  type BasketSelection,
  type BasketUnmatchedLine,
  CatalogUnavailableError,
  type FindGroceryOptionsInput,
  type FindGroceryOptionsSuccess,
  findGroceryOptionsSuccessSchema,
  type GroceryBasketPlan,
  type GroceryOffer,
  type GroceryTarget,
  type PlanGroceryBasketInput,
  type PlanGroceryBasketSuccess,
  planGroceryBasketInputSchema,
  planGroceryBasketSuccessSchema,
} from "./contracts";
import type { CatalogCallContext, GroceryCatalogService } from "./operations";

const FRESH_CATALOG_AGE_MS = 48 * 60 * 60 * 1000;
const textDecoder = new TextDecoder();

export interface CatalogObjectStore {
  readonly getJson: (key: string, signal?: AbortSignal) => Promise<unknown>;
}

interface CatalogSnapshot {
  readonly freshness: "fresh" | "stale";
  readonly manifest: CatalogManifest;
}

interface CatalogCandidate {
  readonly identity: string;
  readonly packageText: string;
  readonly priceCents: number;
  readonly productName: string;
  readonly productUrl: string;
  readonly quantity: ParsedPackage;
  readonly retailerName: string;
  readonly retailerSlug: string;
  readonly sourcePath: string;
}

interface CandidateMatch {
  readonly candidate: CatalogCandidate;
  readonly confidence: "high" | "medium" | "low";
  readonly rank: number;
  readonly reason: string;
}

interface PricedCandidate {
  readonly candidate: CatalogCandidate;
  readonly excessBaseQuantity: number | undefined;
  readonly lineTotalCents: number;
  readonly offerId: string;
  readonly packageCount: number;
}

interface BasketLineState {
  readonly globallyUnmatched: BasketUnmatchedLine | undefined;
  readonly lineNumber: number;
  readonly options: ReadonlyMap<string, PricedCandidate>;
  readonly original: PlanGroceryBasketInput["lines"][number];
}

interface PlanCandidate {
  readonly offerIds: readonly string[];
  readonly plan: GroceryBasketPlan;
  readonly retailerSlugs: readonly string[];
}

type OfferIdCache = Map<string, Promise<string>>;
type ShardCache = Map<number, Promise<CatalogShard>>;

export class MemoryCatalogObjectStore implements CatalogObjectStore {
  readonly reads: string[] = [];
  readonly #objects: Map<string, unknown>;

  constructor(entries: Iterable<readonly [string, unknown]> = []) {
    this.#objects = new Map(entries);
  }

  static fromArtifacts(
    artifacts: Pick<BuiltCatalogArtifacts, "objects">
  ): MemoryCatalogObjectStore {
    return new MemoryCatalogObjectStore(
      artifacts.objects.map((object) => [
        object.key,
        JSON.parse(textDecoder.decode(object.body)) as unknown,
      ])
    );
  }

  getJson(key: string, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    this.reads.push(key);
    return Promise.resolve(this.#objects.get(key));
  }

  deleteJson(key: string): void {
    this.#objects.delete(key);
  }

  setJson(key: string, value: unknown): void {
    this.#objects.set(key, value);
  }
}

function throwCatalogUnavailable(): never {
  throw new CatalogUnavailableError();
}

function splitSearchTokens(value: string): readonly string[] {
  const normalized = normalizeSearchText(value);
  if (normalized === "") {
    return [];
  }
  return normalized.split(" ").filter((token) => token.length >= 2);
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareExactRatios(
  leftNumerator: number,
  leftDenominator: number,
  rightNumerator: number,
  rightDenominator: number
): number {
  const left = BigInt(leftNumerator) * BigInt(rightDenominator);
  const right = BigInt(rightNumerator) * BigInt(leftDenominator);
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function freshnessFor(manifest: CatalogManifest, now: Date): "fresh" | "stale" {
  const observedAt = Date.parse(manifest.observedAt);
  if (!(Number.isFinite(observedAt) && Number.isFinite(now.getTime()))) {
    return throwCatalogUnavailable();
  }
  return now.getTime() - observedAt > FRESH_CATALOG_AGE_MS ? "stale" : "fresh";
}

function sourceProvenance(): typeof CHECKJEBON_SOURCE {
  return CHECKJEBON_SOURCE;
}

function candidateFromRecord(
  record: CatalogIndexRecord,
  retailers: readonly CatalogRetailer[]
): CatalogCandidate {
  const [, retailerIndex, productName, packageText, priceCents, sourcePath] =
    record;
  const retailer = retailers[retailerIndex];
  if (retailer === undefined) {
    return throwCatalogUnavailable();
  }
  const [retailerSlug, retailerName, productUrlBase] = retailer;
  return {
    identity: `${retailerSlug}\0${sourcePath}`,
    packageText,
    priceCents,
    productName,
    productUrl: createProductUrl(productUrlBase, sourcePath),
    quantity: parsePackageText(packageText),
    retailerName,
    retailerSlug,
    sourcePath,
  };
}

function matchCandidate(
  candidate: CatalogCandidate,
  queryTokens: readonly string[]
): Omit<CandidateMatch, "candidate"> | undefined {
  const normalizedName = normalizeSearchText(candidate.productName);
  const nameTokens = splitSearchTokens(candidate.productName);
  const allTokens = splitSearchTokens(
    `${candidate.productName} ${candidate.packageText}`
  );
  const normalizedQuery = queryTokens.join(" ");
  const allNameTokensMatch = queryTokens.every((queryToken) =>
    nameTokens.includes(queryToken)
  );
  if (normalizedName === normalizedQuery) {
    return {
      confidence: "high",
      rank: 0,
      reason: "The normalized product name exactly matches the query.",
    };
  }
  if (allNameTokensMatch) {
    return {
      confidence: "high",
      rank: 1,
      reason: "Every normalized query word occurs in the product name.",
    };
  }
  const allNamePrefixesMatch = queryTokens.every((queryToken) =>
    nameTokens.some((nameToken) => nameToken.startsWith(queryToken))
  );
  if (allNamePrefixesMatch) {
    return {
      confidence: "medium",
      rank: 2,
      reason: "Every normalized query word prefixes a product-name word.",
    };
  }
  const allOfferTokensMatch = queryTokens.every((queryToken) =>
    allTokens.some(
      (offerToken) =>
        offerToken === queryToken || offerToken.startsWith(queryToken)
    )
  );
  if (allOfferTokensMatch) {
    return {
      confidence: "low",
      rank: 3,
      reason: "The normalized query words occur across the name and package.",
    };
  }
  return undefined;
}

function dimensionFor(
  quantity: ParsedPackage
): "mass" | "volume" | "each" | undefined {
  if (quantity.unit === "g") {
    return "mass";
  }
  if (quantity.unit === "ml") {
    return "volume";
  }
  if (quantity.unit === "each") {
    return "each";
  }
  return undefined;
}

function displayUnitForDimension(
  dimension: "mass" | "volume" | "each"
): "kg" | "l" | "each" {
  if (dimension === "mass") {
    return "kg";
  }
  if (dimension === "volume") {
    return "l";
  }
  return "each";
}

function offerIdFor(
  candidate: CatalogCandidate,
  cache: OfferIdCache
): Promise<string> {
  const existing = cache.get(candidate.identity);
  if (existing !== undefined) {
    return existing;
  }
  const created = createOfferId(candidate.retailerSlug, candidate.sourcePath);
  cache.set(candidate.identity, created);
  return created;
}

async function sortMatches(
  matches: readonly CandidateMatch[],
  offerIds: OfferIdCache
): Promise<readonly CandidateMatch[]> {
  const withIds = await Promise.all(
    matches.map(async (match) => ({
      match,
      offerId: await offerIdFor(match.candidate, offerIds),
    }))
  );
  withIds.sort(
    (left, right) =>
      left.match.rank - right.match.rank ||
      left.match.candidate.priceCents - right.match.candidate.priceCents ||
      compareStrings(left.offerId, right.offerId)
  );
  return withIds.map(({ match }) => match);
}

async function selectCheapestUpfront(
  matches: readonly CandidateMatch[],
  offerIds: OfferIdCache
): Promise<CandidateMatch | undefined> {
  if (matches.length === 0) {
    return undefined;
  }
  const lowestPrice = Math.min(
    ...matches.map(({ candidate }) => candidate.priceCents)
  );
  const tied = await Promise.all(
    matches
      .filter(({ candidate }) => candidate.priceCents === lowestPrice)
      .map(async (match) => ({
        match,
        offerId: await offerIdFor(match.candidate, offerIds),
      }))
  );
  tied.sort((left, right) => compareStrings(left.offerId, right.offerId));
  return tied[0]?.match;
}

async function selectBestUnitValue(
  matches: readonly CandidateMatch[],
  dimension: "mass" | "volume" | "each",
  offerIds: OfferIdCache
): Promise<CandidateMatch | undefined> {
  const comparable = matches.filter(
    ({ candidate }) => dimensionFor(candidate.quantity) === dimension
  );
  if (comparable.length === 0) {
    return undefined;
  }
  const withIds = await Promise.all(
    comparable.map(async (match) => ({
      match,
      offerId: await offerIdFor(match.candidate, offerIds),
    }))
  );
  withIds.sort((left, right) => {
    const leftQuantity = left.match.candidate.quantity.value;
    const rightQuantity = right.match.candidate.quantity.value;
    if (leftQuantity === undefined || rightQuantity === undefined) {
      return throwCatalogUnavailable();
    }
    return (
      compareExactRatios(
        left.match.candidate.priceCents,
        leftQuantity,
        right.match.candidate.priceCents,
        rightQuantity
      ) ||
      left.match.candidate.priceCents - right.match.candidate.priceCents ||
      compareStrings(left.offerId, right.offerId)
    );
  });
  return withIds[0]?.match;
}

async function publicOffer(
  match: CandidateMatch,
  offerIds: OfferIdCache
): Promise<GroceryOffer> {
  const { candidate } = match;
  const dimension = dimensionFor(candidate.quantity);
  const quantityValue = candidate.quantity.value;
  const baseQuantity =
    candidate.quantity.unit === "unknown" || quantityValue === undefined
      ? undefined
      : { unit: candidate.quantity.unit, value: quantityValue };
  const multiplier = dimension === "mass" || dimension === "volume" ? 1000 : 1;
  const unitPrice =
    dimension === undefined || quantityValue === undefined
      ? undefined
      : {
          dimension,
          priceCents: Math.round(
            (candidate.priceCents * multiplier) / quantityValue
          ),
          unit: displayUnitForDimension(dimension),
        };
  return {
    ...(baseQuantity === undefined ? {} : { baseQuantity }),
    currency: "EUR",
    matchConfidence: match.confidence,
    matchReason: match.reason,
    offerId: await offerIdFor(candidate, offerIds),
    packageText: candidate.packageText,
    priceCents: candidate.priceCents,
    productName: candidate.productName,
    productUrl: candidate.productUrl,
    retailerName: candidate.retailerName,
    retailerSlug: candidate.retailerSlug,
    ...(unitPrice === undefined ? {} : { unitPrice }),
  };
}

function targetBaseQuantity(target: GroceryTarget): {
  readonly unit: "g" | "ml" | "each" | "package";
  readonly value: number;
} {
  if (target.unit === "kg") {
    return { unit: "g", value: target.value * 1000 };
  }
  if (target.unit === "l") {
    return { unit: "ml", value: target.value * 1000 };
  }
  if (target.unit === "g") {
    return { unit: "g", value: target.value };
  }
  if (target.unit === "ml") {
    return { unit: "ml", value: target.value };
  }
  if (target.unit === "each") {
    return { unit: "each", value: target.value };
  }
  return { unit: "package", value: target.value };
}

function priceCandidate(
  candidate: CatalogCandidate,
  target: GroceryTarget
): Omit<PricedCandidate, "offerId"> | undefined {
  const targetBase = targetBaseQuantity(target);
  let packageCount: number;
  let excessBaseQuantity: number | undefined;
  if (targetBase.unit === "package") {
    packageCount = targetBase.value;
  } else {
    if (
      candidate.quantity.unit !== targetBase.unit ||
      candidate.quantity.value === undefined
    ) {
      return undefined;
    }
    packageCount = Math.ceil(targetBase.value / candidate.quantity.value);
    excessBaseQuantity =
      packageCount * candidate.quantity.value - targetBase.value;
  }
  const lineTotalCents = packageCount * candidate.priceCents;
  if (
    !Number.isSafeInteger(packageCount) ||
    packageCount < 1 ||
    !Number.isSafeInteger(lineTotalCents)
  ) {
    return throwCatalogUnavailable();
  }
  return {
    candidate,
    excessBaseQuantity,
    lineTotalCents,
    packageCount,
  };
}

function comparePricedCandidates(
  left: PricedCandidate,
  right: PricedCandidate
): number {
  return (
    left.lineTotalCents - right.lineTotalCents ||
    (left.excessBaseQuantity ?? 0) - (right.excessBaseQuantity ?? 0) ||
    left.candidate.priceCents - right.candidate.priceCents ||
    compareStrings(left.offerId, right.offerId)
  );
}

async function bestPricedCandidate(
  candidates: readonly CatalogCandidate[],
  target: GroceryTarget,
  offerIds: OfferIdCache
): Promise<PricedCandidate | undefined> {
  const priced = await Promise.all(
    candidates.map(async (candidate) => {
      const evaluated = priceCandidate(candidate, target);
      if (evaluated === undefined) {
        return;
      }
      return {
        ...evaluated,
        offerId: await offerIdFor(candidate, offerIds),
      };
    })
  );
  const compatible = priced.filter(
    (candidate): candidate is PricedCandidate => candidate !== undefined
  );
  compatible.sort(comparePricedCandidates);
  return compatible[0];
}

function combinations(
  values: readonly string[],
  maximumSize: number
): readonly (readonly string[])[] {
  const result: string[][] = [];
  const visit = (start: number, selected: string[]): void => {
    if (selected.length > 0) {
      result.push([...selected]);
    }
    if (selected.length === maximumSize) {
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      const value = values[index];
      if (value !== undefined) {
        selected.push(value);
        visit(index + 1, selected);
        selected.pop();
      }
    }
  };
  visit(0, []);
  return result;
}

function selectionFor(
  lineState: BasketLineState,
  retailers: ReadonlySet<string>
): PricedCandidate | undefined {
  const candidates: PricedCandidate[] = [];
  for (const retailerSlug of retailers) {
    const candidate = lineState.options.get(retailerSlug);
    if (candidate !== undefined) {
      candidates.push(candidate);
    }
  }
  candidates.sort(comparePricedCandidates);
  return candidates[0];
}

function assumptionFor(
  lineState: BasketLineState,
  selection: PricedCandidate
): BasketAssumption {
  const reference = {
    lineNumber: lineState.lineNumber,
    optional: lineState.original.optional,
    query: lineState.original.query,
  };
  if (lineState.original.target.unit === "package") {
    return {
      ...reference,
      text: `Priced ${selection.packageCount} complete sale package(s); packages are not subdivided.`,
    };
  }
  const targetBase = targetBaseQuantity(lineState.original.target);
  return {
    ...reference,
    text: `Rounded up to ${selection.packageCount} complete package(s) to cover ${targetBase.value} ${targetBase.unit}.`,
  };
}

function publicSelection(
  lineState: BasketLineState,
  selection: PricedCandidate
): BasketSelection {
  const { quantity } = selection.candidate;
  const baseQuantity =
    quantity.unit === "unknown" || quantity.value === undefined
      ? undefined
      : { unit: quantity.unit, value: quantity.value };
  return {
    ...(baseQuantity === undefined ? {} : { baseQuantity }),
    ...(selection.excessBaseQuantity === undefined
      ? {}
      : { excessBaseQuantity: selection.excessBaseQuantity }),
    lineNumber: lineState.lineNumber,
    lineTotalCents: selection.lineTotalCents,
    offerId: selection.offerId,
    optional: lineState.original.optional,
    packageCount: selection.packageCount,
    packageText: selection.candidate.packageText,
    priceCents: selection.candidate.priceCents,
    productName: selection.candidate.productName,
    productUrl: selection.candidate.productUrl,
    query: lineState.original.query,
    retailerName: selection.candidate.retailerName,
    retailerSlug: selection.candidate.retailerSlug,
    target: lineState.original.target,
  };
}

function unavailableLine(lineState: BasketLineState): BasketUnmatchedLine {
  return (
    lineState.globallyUnmatched ?? {
      lineNumber: lineState.lineNumber,
      optional: lineState.original.optional,
      query: lineState.original.query,
      reason: "unavailable_in_selected_stores",
    }
  );
}

function buildPlan(
  retailerCombination: readonly string[],
  lineStates: readonly BasketLineState[],
  budgetCents: number | undefined
): PlanCandidate {
  const retailers = new Set(retailerCombination);
  const selectedPackages: BasketSelection[] = [];
  const assumptions: BasketAssumption[] = [];
  const unmatchedLines: BasketUnmatchedLine[] = [];
  const retailerTotals = new Map<
    string,
    { retailerName: string; totalCents: number }
  >();
  const offerIds: string[] = [];
  let matchedOptionalLineCount = 0;
  let matchedRequiredLineCount = 0;
  let pricedTotalCents = 0;

  for (const lineState of lineStates) {
    const selection = selectionFor(lineState, retailers);
    if (selection === undefined) {
      unmatchedLines.push(unavailableLine(lineState));
      continue;
    }
    selectedPackages.push(publicSelection(lineState, selection));
    assumptions.push(assumptionFor(lineState, selection));
    offerIds.push(selection.offerId);
    pricedTotalCents += selection.lineTotalCents;
    if (lineState.original.optional) {
      matchedOptionalLineCount += 1;
    } else {
      matchedRequiredLineCount += 1;
    }
    const retailerTotal = retailerTotals.get(selection.candidate.retailerSlug);
    retailerTotals.set(selection.candidate.retailerSlug, {
      retailerName: selection.candidate.retailerName,
      totalCents: (retailerTotal?.totalCents ?? 0) + selection.lineTotalCents,
    });
  }

  if (!Number.isSafeInteger(pricedTotalCents) || retailerTotals.size === 0) {
    return throwCatalogUnavailable();
  }
  const sortedRetailerSlugs = [...retailerTotals.keys()].sort(compareStrings);
  const requiredLineCount = lineStates.filter(
    ({ original }) => !original.optional
  ).length;
  const plan: GroceryBasketPlan = {
    assumptions,
    ...(budgetCents === undefined
      ? {}
      : {
          budgetDeltaCents: budgetCents - pricedTotalCents,
          withinBudget: pricedTotalCents <= budgetCents,
        }),
    completeness:
      matchedRequiredLineCount === requiredLineCount
        ? "complete"
        : "incomplete",
    matchedOptionalLineCount,
    matchedRequiredLineCount,
    pricedLineCount: selectedPackages.length,
    pricedTotalCents,
    retailerTotals: sortedRetailerSlugs.map((retailerSlug) => {
      const total = retailerTotals.get(retailerSlug);
      if (total === undefined) {
        return throwCatalogUnavailable();
      }
      return { retailerSlug, ...total };
    }),
    selectedPackages,
    storeCount: retailerTotals.size,
    unmatchedLineCount: unmatchedLines.length,
    unmatchedLines,
  };
  return { offerIds, plan, retailerSlugs: sortedRetailerSlugs };
}

function comparePlanCandidates(
  left: PlanCandidate,
  right: PlanCandidate
): number {
  return (
    right.plan.matchedRequiredLineCount - left.plan.matchedRequiredLineCount ||
    right.plan.matchedOptionalLineCount - left.plan.matchedOptionalLineCount ||
    left.plan.pricedTotalCents - right.plan.pricedTotalCents ||
    left.plan.storeCount - right.plan.storeCount ||
    compareStrings(
      left.retailerSlugs.join("\0"),
      right.retailerSlugs.join("\0")
    ) ||
    compareStrings(left.offerIds.join("\0"), right.offerIds.join("\0"))
  );
}

export class GroceryCatalog implements GroceryCatalogService {
  readonly #store: CatalogObjectStore;

  constructor(store: CatalogObjectStore) {
    this.#store = store;
  }

  async #snapshot(context: CatalogCallContext): Promise<CatalogSnapshot> {
    let value: unknown;
    try {
      value = await this.#store.getJson(CATALOG_MANIFEST_KEY, context.signal);
    } catch (error) {
      if (context.signal.aborted) {
        throw error;
      }
      return throwCatalogUnavailable();
    }
    const parsed = catalogManifestSchema.safeParse(value);
    if (!parsed.success) {
      return throwCatalogUnavailable();
    }
    return {
      freshness: freshnessFor(parsed.data, context.now),
      manifest: parsed.data,
    };
  }

  #shard(
    snapshot: CatalogSnapshot,
    shardIndex: number,
    context: CatalogCallContext,
    cache: ShardCache
  ): Promise<CatalogShard> {
    const cached = cache.get(shardIndex);
    if (cached !== undefined) {
      return cached;
    }
    const loading = this.#loadShard(snapshot, shardIndex, context);
    cache.set(shardIndex, loading);
    return loading;
  }

  async #loadShard(
    snapshot: CatalogSnapshot,
    shardIndex: number,
    context: CatalogCallContext
  ): Promise<CatalogShard> {
    const descriptor = snapshot.manifest.shards[shardIndex];
    const expectedKey = shardKey(snapshot.manifest.currentVersion, shardIndex);
    if (
      descriptor === undefined ||
      descriptor.key !== expectedKey ||
      descriptor.byteLength > MAX_CATALOG_OBJECT_BYTES
    ) {
      return throwCatalogUnavailable();
    }
    let value: unknown;
    try {
      value = await this.#store.getJson(descriptor.key, context.signal);
    } catch (error) {
      if (context.signal.aborted) {
        throw error;
      }
      return throwCatalogUnavailable();
    }
    const parsed = catalogShardSchema.safeParse(value);
    if (
      !parsed.success ||
      parsed.data.catalogVersion !== snapshot.manifest.currentVersion ||
      parsed.data.shardIndex !== shardIndex
    ) {
      return throwCatalogUnavailable();
    }
    return parsed.data;
  }

  async #matches(
    input: Pick<FindGroceryOptionsInput, "query" | "retailerSlugs">,
    snapshot: CatalogSnapshot,
    context: CatalogCallContext,
    cache: ShardCache
  ): Promise<readonly CandidateMatch[]> {
    const queryTokens = normalizeQueryTokens(input.query);
    const anchor = selectQueryAnchor(queryTokens);
    const prefix = anchor === undefined ? undefined : tokenPrefix(anchor);
    if (prefix === undefined) {
      return [];
    }
    const shardIndex = shardIndexForPrefix(prefix);
    const shard = await this.#shard(snapshot, shardIndex, context, cache);
    const retailerFilter = new Set(input.retailerSlugs);
    const matches: CandidateMatch[] = [];
    for (const record of shard.records) {
      if (!record[0].includes(prefix)) {
        continue;
      }
      const candidate = candidateFromRecord(record, shard.retailers);
      if (
        retailerFilter.size > 0 &&
        !retailerFilter.has(candidate.retailerSlug)
      ) {
        continue;
      }
      const match = matchCandidate(candidate, queryTokens);
      if (match !== undefined) {
        matches.push({ candidate, ...match });
      }
    }
    return matches;
  }

  async search(
    input: FindGroceryOptionsInput,
    context: CatalogCallContext
  ): Promise<FindGroceryOptionsSuccess> {
    const snapshot = await this.#snapshot(context);
    const offerIds: OfferIdCache = new Map();
    const matches = await this.#matches(input, snapshot, context, new Map());
    const ranked = await sortMatches(matches, offerIds);
    const cheapest = await selectCheapestUpfront(matches, offerIds);
    const [mass, volume, each] = await Promise.all([
      selectBestUnitValue(matches, "mass", offerIds),
      selectBestUnitValue(matches, "volume", offerIds),
      selectBestUnitValue(matches, "each", offerIds),
    ]);
    const bestUnitValueOfferIds = {
      ...(each === undefined
        ? {}
        : { each: await offerIdFor(each.candidate, offerIds) }),
      ...(mass === undefined
        ? {}
        : { mass: await offerIdFor(mass.candidate, offerIds) }),
      ...(volume === undefined
        ? {}
        : { volume: await offerIdFor(volume.candidate, offerIds) }),
    };
    return findGroceryOptionsSuccessSchema.parse({
      bestUnitValueOfferIds,
      catalogVersion: snapshot.manifest.currentVersion,
      ...(cheapest === undefined
        ? {}
        : {
            cheapestUpfrontOfferId: await offerIdFor(
              cheapest.candidate,
              offerIds
            ),
          }),
      freshness: snapshot.freshness,
      observedAt: snapshot.manifest.observedAt,
      offers: await Promise.all(
        ranked
          .slice(0, input.limit)
          .map((match) => publicOffer(match, offerIds))
      ),
      source: sourceProvenance(),
      status: "ok",
    });
  }

  async planBasket(
    input: PlanGroceryBasketInput,
    context: CatalogCallContext
  ): Promise<PlanGroceryBasketSuccess> {
    const replayInput = planGroceryBasketInputSchema.parse(input);
    const snapshot = await this.#snapshot(context);
    const shardCache: ShardCache = new Map();
    const offerIds: OfferIdCache = new Map();
    const lineStates = await Promise.all(
      replayInput.lines.map(async (line, index) => {
        const matches = await this.#matches(
          { query: line.query, retailerSlugs: replayInput.retailerSlugs },
          snapshot,
          context,
          shardCache
        );
        const candidatesByRetailer = new Map<string, CatalogCandidate[]>();
        for (const { candidate } of matches) {
          const candidates =
            candidatesByRetailer.get(candidate.retailerSlug) ?? [];
          candidates.push(candidate);
          candidatesByRetailer.set(candidate.retailerSlug, candidates);
        }
        const pricedOptions = await Promise.all(
          [...candidatesByRetailer].map(
            async ([retailerSlug, candidates]) =>
              [
                retailerSlug,
                await bestPricedCandidate(candidates, line.target, offerIds),
              ] as const
          )
        );
        const options = new Map<string, PricedCandidate>();
        for (const [retailerSlug, best] of pricedOptions) {
          if (best !== undefined) {
            options.set(retailerSlug, best);
          }
        }
        const reference = {
          lineNumber: index + 1,
          optional: line.optional,
          query: line.query,
        };
        const globallyUnmatched =
          options.size > 0
            ? undefined
            : {
                ...reference,
                reason:
                  matches.length === 0
                    ? ("no_catalog_match" as const)
                    : ("incompatible_quantity" as const),
              };
        return {
          globallyUnmatched,
          lineNumber: index + 1,
          options,
          original: line,
        } satisfies BasketLineState;
      })
    );
    const retailerSlugs = [
      ...new Set(lineStates.flatMap(({ options }) => [...options.keys()])),
    ].sort(compareStrings);
    if (retailerSlugs.length > 12) {
      return throwCatalogUnavailable();
    }
    const planCandidates = combinations(
      retailerSlugs,
      replayInput.maxStores
    ).map((retailers) =>
      buildPlan(retailers, lineStates, replayInput.budgetCents)
    );
    const singleStorePlans = planCandidates
      .filter(({ plan }) => plan.storeCount === 1)
      .sort(comparePlanCandidates);
    planCandidates.sort(comparePlanCandidates);
    const bestSingleStore = singleStorePlans[0]?.plan;
    const cheapestWithinStoreLimit = planCandidates[0]?.plan;
    const representativePlan = cheapestWithinStoreLimit ?? bestSingleStore;
    const globallyUnmatchedLines = lineStates.flatMap((lineState) =>
      lineState.globallyUnmatched === undefined
        ? []
        : [lineState.globallyUnmatched]
    );
    const requiredLineCount = lineStates.filter(
      ({ original }) => !original.optional
    ).length;
    const unmatchedLineCount =
      representativePlan?.unmatchedLineCount ?? lineStates.length;
    const pricedLineCount = representativePlan?.pricedLineCount ?? 0;
    const completeness =
      representativePlan?.completeness ??
      (requiredLineCount === 0 ? "complete" : "incomplete");
    return planGroceryBasketSuccessSchema.parse({
      ...(bestSingleStore === undefined ? {} : { bestSingleStore }),
      catalogVersion: snapshot.manifest.currentVersion,
      ...(cheapestWithinStoreLimit === undefined
        ? {}
        : { cheapestWithinStoreLimit }),
      completeness,
      freshness: snapshot.freshness,
      globallyUnmatchedLines,
      observedAt: snapshot.manifest.observedAt,
      pricedLineCount,
      quotedAt: context.now.toISOString(),
      replayInput,
      source: sourceProvenance(),
      status: "ok",
      unmatchedLineCount,
    });
  }
}
