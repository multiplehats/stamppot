import { z } from "zod";
import { GROCERY_ALIASES } from "./aliases";

export const CATALOG_FORMAT_VERSION = 1;
export const CATALOG_SHARD_COUNT = 128;
export const MAX_CATALOG_OBJECT_BYTES = 1024 * 1024;
export const MAX_CATALOG_RETAILERS = 12;
export const MAX_PRODUCT_NAME_CHARACTERS = 1000;
export const CATALOG_MANIFEST_KEY = "catalog/manifest.json";
export const CHECKJEBON_DATA_URL =
  "https://www.checkjebon.nl/data/supermarkets.json";
export const CHECKJEBON_SOURCE_URL = "https://github.com/supermarkt/checkjebon";
export const CHECKJEBON_SOURCE = {
  licence: "MIT",
  name: "Checkjebon",
  url: CHECKJEBON_SOURCE_URL,
} as const;

const DIACRITIC_PATTERN = /\p{Mark}+/gu;
const NON_SEARCH_CHARACTER_PATTERN = /[^\p{Letter}\p{Number}]+/gu;
const WHITESPACE_PATTERN = /\s+/g;
const MULTIPACK_PATTERN =
  /(?:^|\s)(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|stuks?|stuk)(?:\s|$)/i;
const QUANTITY_PATTERN =
  /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|stuks?|stuk)(?:\s|$)/i;
const PER_ITEM_PATTERN = /\bper\s+stuk\b/i;
const BASE64_PADDING_PATTERN = /[=]+$/u;

export const sourceProductSchema = z
  .object({
    l: z.string().trim().min(1).max(2000),
    n: z.string().trim().min(1).max(MAX_PRODUCT_NAME_CHARACTERS),
    p: z.number().finite().nonnegative(),
    s: z.string().trim().max(500),
  })
  .strict();

export const sourceRetailerSchema = z
  .object({
    c: z.string().trim().min(1).max(200),
    d: z.array(sourceProductSchema),
    i: z.string().url(),
    n: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    u: z.string().url(),
  })
  .strict();

export const checkjebonSourceSchema = z
  .array(sourceRetailerSchema)
  .min(1)
  .max(
    MAX_CATALOG_RETAILERS,
    `Catalog source cannot contain more than ${MAX_CATALOG_RETAILERS} retailers`
  );

export const parsedPackageSchema = z
  .object({
    unit: z.enum(["g", "ml", "each", "unknown"]),
    value: z.number().int().positive().safe().optional(),
  })
  .strict()
  .superRefine((quantity, context) => {
    const hasKnownUnit = quantity.unit !== "unknown";
    if (hasKnownUnit !== (quantity.value !== undefined)) {
      context.addIssue({
        code: "custom",
        message:
          "Known package units require a value and unknown units forbid it",
      });
    }
  });

export const catalogRetailerSchema = z.tuple([
  z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  z.string().min(1).max(200),
  z.string().url(),
  z.string().url(),
]);

export const catalogIndexRecordSchema = z.tuple([
  z.array(z.string().min(2).max(3)).min(1),
  z.number().int().nonnegative().safe(),
  z.string().min(1).max(MAX_PRODUCT_NAME_CHARACTERS),
  z.string().max(500),
  z.number().int().nonnegative().safe(),
  z.string().min(1).max(2000),
]);

export const catalogShardSchema = z
  .object({
    catalogVersion: z.string().min(1).max(200),
    formatVersion: z.literal(CATALOG_FORMAT_VERSION),
    records: z.array(catalogIndexRecordSchema),
    retailers: z.array(catalogRetailerSchema).min(1).max(MAX_CATALOG_RETAILERS),
    shardIndex: z
      .number()
      .int()
      .min(0)
      .max(CATALOG_SHARD_COUNT - 1),
  })
  .strict()
  .superRefine((shard, context) => {
    for (const [recordIndex, record] of shard.records.entries()) {
      const [prefixes, retailerIndex] = record;
      if (retailerIndex >= shard.retailers.length) {
        context.addIssue({
          code: "custom",
          message: "Catalog record refers to an unknown retailer",
          path: ["records", recordIndex, 1],
        });
      }
      for (const [prefixIndex, prefix] of prefixes.entries()) {
        if (shardIndexForPrefix(prefix) !== shard.shardIndex) {
          context.addIssue({
            code: "custom",
            message: "Catalog prefix is stored in the wrong physical shard",
            path: ["records", recordIndex, 0, prefixIndex],
          });
        }
      }
    }
  });

export const catalogManifestShardSchema = z
  .object({
    byteLength: z
      .number()
      .int()
      .nonnegative()
      .max(MAX_CATALOG_OBJECT_BYTES)
      .safe(),
    key: z.string().regex(/^catalog\/versions\/[^/]+\/index\/\d{3}\.json$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const catalogManifestSchema = z
  .object({
    currentVersion: z.string().min(1).max(200),
    formatVersion: z.literal(CATALOG_FORMAT_VERSION),
    observedAt: z.string().datetime({ offset: true }),
    offerCount: z.number().int().positive().safe(),
    retailerCount: z
      .number()
      .int()
      .positive()
      .max(MAX_CATALOG_RETAILERS)
      .safe(),
    shardCount: z.literal(CATALOG_SHARD_COUNT),
    shards: z.array(catalogManifestShardSchema).length(CATALOG_SHARD_COUNT),
    source: z
      .object({
        dataUrl: z.literal(CHECKJEBON_DATA_URL),
        licence: z.literal("MIT"),
        name: z.literal("Checkjebon"),
        url: z.literal(CHECKJEBON_SOURCE_URL),
      })
      .strict(),
  })
  .strict();

export type CheckjebonSource = z.output<typeof checkjebonSourceSchema>;
export type ParsedPackage = z.output<typeof parsedPackageSchema>;
export type CatalogRetailer = z.output<typeof catalogRetailerSchema>;
export type CatalogIndexRecord = z.output<typeof catalogIndexRecordSchema>;
export type CatalogShard = z.output<typeof catalogShardSchema>;
export type CatalogManifest = z.output<typeof catalogManifestSchema>;

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(DIACRITIC_PATTERN, "")
    .toLowerCase()
    .replace(NON_SEARCH_CHARACTER_PATTERN, " ")
    .replace(WHITESPACE_PATTERN, " ")
    .trim();
}

function splitNormalized(value: string): string[] {
  const normalized = normalizeSearchText(value);
  return normalized === "" ? [] : normalized.split(" ");
}

function groceryAlias(value: string): readonly string[] | undefined {
  return Object.hasOwn(GROCERY_ALIASES, value)
    ? GROCERY_ALIASES[value]
    : undefined;
}

export function normalizeQueryTokens(query: string): string[] {
  const normalizedQuery = normalizeSearchText(query);
  const phraseAlias = groceryAlias(normalizedQuery);
  const rawTokens = splitNormalized(normalizedQuery);
  const expandedTokens =
    phraseAlias === undefined
      ? rawTokens.flatMap((token) => groceryAlias(token) ?? [token])
      : [...phraseAlias];
  return [...new Set(expandedTokens.map(normalizeSearchText))].filter(
    (token) => token.length >= 2
  );
}

export function offerSearchTokens(productName: string): string[] {
  return [...new Set(splitNormalized(productName))].filter(
    (token) => token.length >= 2
  );
}

export function tokenPrefix(token: string): string | undefined {
  const normalized = normalizeSearchText(token);
  if (normalized.length < 2) {
    return undefined;
  }
  return normalized.length === 2 ? normalized : normalized.slice(0, 3);
}

export function selectQueryAnchor(
  tokens: readonly string[]
): string | undefined {
  return [...tokens]
    .filter((token) => token.length >= 2)
    .sort(
      (left, right) => right.length - left.length || left.localeCompare(right)
    )[0];
}

export function fnv1a32(value: string): number {
  let hash = 0x81_1c_9d_c5;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    // biome-ignore lint/suspicious/noBitwiseOperators: FNV-1a requires a 32-bit XOR operation.
    hash = Math.imul(hash ^ codePoint, 0x01_00_01_93);
  }
  return hash < 0 ? hash + 0x1_00_00_00_00 : hash;
}

export function shardIndexForPrefix(prefix: string): number {
  return fnv1a32(prefix) % CATALOG_SHARD_COUNT;
}

export function shardKey(version: string, shardIndex: number): string {
  return `catalog/versions/${version}/index/${String(shardIndex).padStart(3, "0")}.json`;
}

export function createProductUrl(
  productUrlBase: string,
  sourcePath: string
): string {
  return new URL(`${productUrlBase}${sourcePath}`).toString();
}

function baseQuantity(value: number, unit: string): ParsedPackage {
  const multiplier = unit === "kg" || unit === "l" ? 1000 : 1;
  const converted = value * multiplier;
  const rounded = Math.round(converted);
  if (
    !Number.isSafeInteger(rounded) ||
    rounded <= 0 ||
    Math.abs(converted - rounded) > 1e-6
  ) {
    return { unit: "unknown" };
  }

  if (unit === "kg" || unit === "g") {
    return { unit: "g", value: rounded };
  }
  if (unit === "l" || unit === "ml") {
    return { unit: "ml", value: rounded };
  }
  return { unit: "each", value: rounded };
}

export function parsePackageText(packageText: string): ParsedPackage {
  const normalized = packageText.trim().toLowerCase();
  const multipackMatch = MULTIPACK_PATTERN.exec(normalized);
  if (multipackMatch !== null) {
    const [, countText, valueText, unit] = multipackMatch;
    if (
      countText !== undefined &&
      valueText !== undefined &&
      unit !== undefined
    ) {
      return baseQuantity(
        Number(countText) * Number(valueText.replace(",", ".")),
        unit
      );
    }
  }

  const quantityMatch = QUANTITY_PATTERN.exec(normalized);
  if (quantityMatch !== null) {
    const [, valueText, unit] = quantityMatch;
    if (valueText !== undefined && unit !== undefined) {
      return baseQuantity(Number(valueText.replace(",", ".")), unit);
    }
  }

  if (PER_ITEM_PATTERN.test(normalized)) {
    return { unit: "each", value: 1 };
  }
  return { unit: "unknown" };
}

export function eurosToCents(euros: number): number {
  if (!Number.isFinite(euros) || euros < 0) {
    throw new Error("Price must be a finite non-negative number");
  }
  const cents = Math.round((euros + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Price cannot be represented as safe integer cents");
  }
  return cents;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_PADDING_PATTERN, "");
}

export async function sha256Hex(value: Uint8Array): Promise<string> {
  const bytes = new Uint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createOfferId(
  retailerSlug: string,
  canonicalSourcePath: string
): Promise<string> {
  const input = new TextEncoder().encode(
    `v1\0${retailerSlug}\0${canonicalSourcePath}`
  );
  const digest = await crypto.subtle.digest("SHA-256", input);
  return `off_${bytesToBase64Url(new Uint8Array(digest))}`;
}
