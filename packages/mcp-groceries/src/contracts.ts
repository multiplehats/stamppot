import { z } from "zod";
import {
  MAX_CATALOG_RETAILERS,
  MAX_PRODUCT_NAME_CHARACTERS,
} from "./catalog-format";

export const MAX_QUERY_CHARACTERS = 120;
export const MAX_RETAILER_FILTERS = MAX_CATALOG_RETAILERS;
export const MAX_SEARCH_RESULTS = 20;
export const MAX_BASKET_LINES = 20;
export const MAX_STORES = 3;
export const MAX_BASE_QUANTITY = 1_000_000;
export const MAX_COUNT_QUANTITY = 10_000;
export const MAX_BUDGET_CENTS = 100_000_000;
export const MAX_LIST_TITLE_CHARACTERS = 100;
export const MAX_SHOPPING_LIST_BYTES = 16 * 1024;
export const LIST_KEY_PATTERN = /^lst_[A-Za-z0-9_-]{22}$/;
export const DEFAULT_PACKAGE_TARGET = {
  unit: "package",
  value: 1,
} as const;

const utf8Encoder = new TextEncoder();

export class CatalogUnavailableError extends Error {
  constructor() {
    super("Grocery catalog is unavailable");
    this.name = "CatalogUnavailableError";
  }
}

export const groceryQuerySchema = z
  .string()
  .trim()
  .min(2)
  .max(MAX_QUERY_CHARACTERS)
  .describe(
    "Concrete grocery product to match. Leading and trailing whitespace is removed; use 2-120 characters."
  );

export const retailerSlugSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .describe(
    "Lowercase retailer slug containing ASCII letters, digits or internal hyphens."
  );

export const retailerSlugsSchema = z
  .array(retailerSlugSchema)
  .max(MAX_RETAILER_FILTERS)
  .refine((slugs) => new Set(slugs).size === slugs.length, {
    message: "Retailer slugs must be unique",
  })
  .default([])
  .describe(
    "Unique retailer slugs to include, at most 12. Omit or pass an empty array to search all current retailers."
  );

export const budgetCentsSchema = z
  .number()
  .int()
  .nonnegative()
  .max(MAX_BUDGET_CENTS)
  .describe(
    "Optional comparison budget in integer euro cents, from 0 through 100000000. It never removes a grocery line."
  );

export const groceryTargetSchema = z
  .object({
    unit: z
      .enum(["g", "kg", "ml", "l", "each", "package"])
      .describe(
        "Target unit: grams, kilograms, millilitres, litres, individual items, or sale-package count."
      ),
    value: z
      .number()
      .finite()
      .positive()
      .describe(
        "Positive target amount. Mass and volume may be decimal; each and package counts must be integers."
      ),
  })
  .strict()
  .superRefine((target, context) => {
    const isCount = target.unit === "each" || target.unit === "package";
    if (isCount) {
      if (!Number.isInteger(target.value)) {
        context.addIssue({
          code: "custom",
          message: "Each and package targets must be integers",
          path: ["value"],
        });
      }
      if (target.value > MAX_COUNT_QUANTITY) {
        context.addIssue({
          code: "too_big",
          maximum: MAX_COUNT_QUANTITY,
          message: `Count targets cannot exceed ${MAX_COUNT_QUANTITY}`,
          origin: "number",
          path: ["value"],
        });
      }
      return;
    }

    const baseQuantity =
      target.unit === "kg" || target.unit === "l"
        ? target.value * 1000
        : target.value;
    if (!Number.isFinite(baseQuantity) || baseQuantity > MAX_BASE_QUANTITY) {
      context.addIssue({
        code: "too_big",
        maximum: MAX_BASE_QUANTITY,
        message: `Mass or volume targets cannot exceed ${MAX_BASE_QUANTITY} g or ml after conversion`,
        origin: "number",
        path: ["value"],
      });
    }
  })
  .describe(
    "Desired quantity. Omit it to price one sale package; kg and l are converted to g and ml for package arithmetic."
  );

export const groceryBasketLineSchema = z
  .object({
    optional: z
      .boolean()
      .default(false)
      .describe(
        "Whether failure to match this line may leave the basket complete. Matched optional lines are still priced."
      ),
    query: groceryQuerySchema,
    target: groceryTargetSchema
      .optional()
      .default(DEFAULT_PACKAGE_TARGET)
      .describe("Desired quantity. Omit it to price exactly one sale package."),
  })
  .strict();

export const findGroceryOptionsInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_SEARCH_RESULTS)
      .default(10)
      .describe(
        "Maximum relevance-ranked offers to return, from 1 through 20. Defaults to 10; winners are computed before this limit."
      ),
    query: groceryQuerySchema,
    retailerSlugs: retailerSlugsSchema,
  })
  .strict();

export const planGroceryBasketInputSchema = z
  .object({
    budgetCents: budgetCentsSchema
      .optional()
      .describe(
        "Optional comparison budget in integer euro cents. Omit it when the user supplied no budget."
      ),
    lines: z
      .array(groceryBasketLineSchema)
      .min(1)
      .max(MAX_BASKET_LINES)
      .describe(
        "One to 20 ordered, concrete grocery lines. Decompose an occasion into products before calling."
      ),
    maxStores: z
      .number()
      .int()
      .min(1)
      .max(MAX_STORES)
      .default(MAX_STORES)
      .describe(
        "Maximum retailer count for the combined plan, from 1 through 3. Defaults to 3."
      ),
    retailerSlugs: retailerSlugsSchema,
  })
  .strict();

export const shoppingListLineSchema = groceryBasketLineSchema
  .extend({
    checked: z
      .boolean()
      .default(false)
      .describe(
        "Whether the user has checked off this line. Defaults to false when omitted."
      ),
  })
  .strict();

export const shoppingListDocumentSchema = z
  .object({
    budgetCents: budgetCentsSchema
      .optional()
      .describe(
        "Optional whole-list budget in integer euro cents. Omit it when the list has no budget."
      ),
    lines: z
      .array(shoppingListLineSchema)
      .max(MAX_BASKET_LINES)
      .describe(
        "Complete ordered list of zero to 20 grocery lines. A save replaces this entire array."
      ),
    title: z
      .string()
      .trim()
      .min(1)
      .max(MAX_LIST_TITLE_CHARACTERS)
      .optional()
      .describe(
        "Optional shopping-list title, trimmed to 1-100 characters when present."
      ),
  })
  .strict()
  .superRefine((document, context) => {
    const { byteLength } = utf8Encoder.encode(JSON.stringify(document));
    if (byteLength > MAX_SHOPPING_LIST_BYTES) {
      context.addIssue({
        code: "custom",
        message: `Shopping-list JSON cannot exceed ${MAX_SHOPPING_LIST_BYTES} UTF-8 bytes`,
      });
    }
  });

export const listKeySchema = z
  .string()
  .regex(LIST_KEY_PATTERN)
  .describe(
    "Opaque bearer capability in the exact lst_ plus 22-character base64url format. Possession grants access to one list."
  );

export const getShoppingListInputSchema = z
  .object({
    listKey: listKeySchema,
  })
  .strict();

export const saveShoppingListInputSchema = z
  .object({
    document: shoppingListDocumentSchema.describe(
      "Complete replacement shopping-list document. Read an existing list first and preserve every line the user still wants."
    ),
    listKey: listKeySchema
      .optional()
      .describe(
        "Existing list capability to replace. Omit it only to create a new list; creation is not idempotent."
      ),
  })
  .strict();

export const catalogSourceSchema = z
  .object({
    licence: z.literal("MIT"),
    name: z.literal("Checkjebon"),
    url: z.string().url(),
  })
  .strict();

export const catalogProvenanceSchema = z
  .object({
    catalogVersion: z.string().min(1).max(200),
    freshness: z.enum(["fresh", "stale"]),
    observedAt: z.string().datetime({ offset: true }),
    source: catalogSourceSchema,
  })
  .strict();

export const baseQuantitySchema = z
  .object({
    unit: z.enum(["g", "ml", "each"]),
    value: z.number().int().positive().safe(),
  })
  .strict();

export const unitPriceSchema = z
  .object({
    dimension: z.enum(["mass", "volume", "each"]),
    priceCents: z.number().int().nonnegative().safe(),
    unit: z.enum(["kg", "l", "each"]),
  })
  .strict();

export const groceryOfferSchema = z
  .object({
    baseQuantity: baseQuantitySchema.optional(),
    currency: z.literal("EUR"),
    matchConfidence: z.enum(["high", "medium", "low"]),
    matchReason: z.string().min(1).max(240),
    offerId: z.string().regex(/^off_[A-Za-z0-9_-]{43}$/),
    packageText: z.string().max(500),
    priceCents: z.number().int().nonnegative().safe(),
    productName: z.string().min(1).max(MAX_PRODUCT_NAME_CHARACTERS),
    productUrl: z.string().url(),
    retailerName: z.string().min(1).max(200),
    retailerSlug: retailerSlugSchema,
    unitPrice: unitPriceSchema.optional(),
  })
  .strict();

export const bestUnitValueOfferIdsSchema = z
  .object({
    each: z
      .string()
      .regex(/^off_[A-Za-z0-9_-]{43}$/)
      .optional(),
    mass: z
      .string()
      .regex(/^off_[A-Za-z0-9_-]{43}$/)
      .optional(),
    volume: z
      .string()
      .regex(/^off_[A-Za-z0-9_-]{43}$/)
      .optional(),
  })
  .strict();

export const findGroceryOptionsSuccessSchema = z
  .object({
    bestUnitValueOfferIds: bestUnitValueOfferIdsSchema,
    catalogVersion: z.string().min(1).max(200),
    cheapestUpfrontOfferId: z
      .string()
      .regex(/^off_[A-Za-z0-9_-]{43}$/)
      .optional(),
    freshness: z.enum(["fresh", "stale"]),
    observedAt: z.string().datetime({ offset: true }),
    offers: z.array(groceryOfferSchema).max(MAX_SEARCH_RESULTS),
    source: catalogSourceSchema,
    status: z.literal("ok"),
  })
  .strict();

export const findGroceryOptionsOutputSchema = z
  .object({
    bestUnitValueOfferIds: bestUnitValueOfferIdsSchema.optional(),
    catalogVersion: z.string().min(1).max(200).optional(),
    cheapestUpfrontOfferId: z
      .string()
      .regex(/^off_[A-Za-z0-9_-]{43}$/)
      .optional(),
    freshness: z.enum(["fresh", "stale"]).optional(),
    observedAt: z.string().datetime({ offset: true }).optional(),
    offers: z.array(groceryOfferSchema).max(MAX_SEARCH_RESULTS).optional(),
    retryable: z.boolean().optional(),
    source: catalogSourceSchema.optional(),
    status: z.enum(["ok", "catalog_unavailable"]),
  })
  .strict();

export const basketLineReferenceSchema = z
  .object({
    lineNumber: z.number().int().min(1).max(MAX_BASKET_LINES),
    optional: z.boolean(),
    query: groceryQuerySchema,
  })
  .strict();

export const basketSelectionSchema = basketLineReferenceSchema
  .extend({
    baseQuantity: baseQuantitySchema.optional(),
    excessBaseQuantity: z.number().finite().nonnegative().optional(),
    lineTotalCents: z.number().int().nonnegative().safe(),
    offerId: z.string().regex(/^off_[A-Za-z0-9_-]{43}$/),
    packageCount: z.number().int().positive().safe(),
    packageText: z.string().max(500),
    priceCents: z.number().int().nonnegative().safe(),
    productName: z.string().min(1).max(MAX_PRODUCT_NAME_CHARACTERS),
    productUrl: z.string().url(),
    retailerName: z.string().min(1).max(200),
    retailerSlug: retailerSlugSchema,
    target: groceryTargetSchema,
  })
  .strict();

export const basketUnmatchedLineSchema = basketLineReferenceSchema
  .extend({
    reason: z.enum([
      "no_catalog_match",
      "incompatible_quantity",
      "unavailable_in_selected_stores",
    ]),
  })
  .strict();

export const basketAssumptionSchema = basketLineReferenceSchema
  .extend({
    text: z.string().min(1).max(500),
  })
  .strict();

export const retailerTotalSchema = z
  .object({
    retailerName: z.string().min(1).max(200),
    retailerSlug: retailerSlugSchema,
    totalCents: z.number().int().nonnegative().safe(),
  })
  .strict();

export const groceryBasketPlanSchema = z
  .object({
    assumptions: z.array(basketAssumptionSchema).max(MAX_BASKET_LINES),
    budgetDeltaCents: z.number().int().safe().optional(),
    completeness: z.enum(["complete", "incomplete"]),
    matchedOptionalLineCount: z.number().int().nonnegative(),
    matchedRequiredLineCount: z.number().int().nonnegative(),
    pricedLineCount: z.number().int().nonnegative(),
    pricedTotalCents: z.number().int().nonnegative().safe(),
    retailerTotals: z.array(retailerTotalSchema).max(MAX_RETAILER_FILTERS),
    selectedPackages: z.array(basketSelectionSchema).max(MAX_BASKET_LINES),
    storeCount: z.number().int().min(1).max(MAX_STORES),
    unmatchedLineCount: z.number().int().nonnegative(),
    unmatchedLines: z.array(basketUnmatchedLineSchema).max(MAX_BASKET_LINES),
    withinBudget: z.boolean().optional(),
  })
  .strict();

export const planGroceryBasketSuccessSchema = z
  .object({
    bestSingleStore: groceryBasketPlanSchema.optional(),
    catalogVersion: z.string().min(1).max(200),
    cheapestWithinStoreLimit: groceryBasketPlanSchema.optional(),
    completeness: z.enum(["complete", "incomplete"]),
    freshness: z.enum(["fresh", "stale"]),
    globallyUnmatchedLines: z
      .array(basketUnmatchedLineSchema)
      .max(MAX_BASKET_LINES),
    observedAt: z.string().datetime({ offset: true }),
    pricedLineCount: z.number().int().nonnegative(),
    quotedAt: z.string().datetime({ offset: true }),
    replayInput: planGroceryBasketInputSchema,
    source: catalogSourceSchema,
    status: z.literal("ok"),
    unmatchedLineCount: z.number().int().nonnegative(),
  })
  .strict();

export const planGroceryBasketOutputSchema = z
  .object({
    bestSingleStore: groceryBasketPlanSchema.optional(),
    catalogVersion: z.string().min(1).max(200).optional(),
    cheapestWithinStoreLimit: groceryBasketPlanSchema.optional(),
    completeness: z.enum(["complete", "incomplete"]).optional(),
    freshness: z.enum(["fresh", "stale"]).optional(),
    globallyUnmatchedLines: z
      .array(basketUnmatchedLineSchema)
      .max(MAX_BASKET_LINES)
      .optional(),
    observedAt: z.string().datetime({ offset: true }).optional(),
    pricedLineCount: z.number().int().nonnegative().optional(),
    quotedAt: z.string().datetime({ offset: true }).optional(),
    replayInput: planGroceryBasketInputSchema.optional(),
    retryable: z.boolean().optional(),
    source: catalogSourceSchema.optional(),
    status: z.enum(["ok", "catalog_unavailable"]),
    unmatchedLineCount: z.number().int().nonnegative().optional(),
  })
  .strict();

export const shoppingListEnvelopeSchema = z
  .object({
    document: shoppingListDocumentSchema,
    expiresAt: z.string().datetime({ offset: true }),
    savedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const getShoppingListOutputSchema = z
  .object({
    document: shoppingListDocumentSchema.optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
    listKey: listKeySchema.optional(),
    retryable: z.boolean().optional(),
    savedAt: z.string().datetime({ offset: true }).optional(),
    status: z.enum(["ok", "unknown_list"]),
  })
  .strict();

export const saveShoppingListOutputSchema = z
  .object({
    document: shoppingListDocumentSchema.optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
    listKey: listKeySchema.optional(),
    retryAfterSeconds: z.literal(60).optional(),
    retryable: z.boolean().optional(),
    savedAt: z.string().datetime({ offset: true }).optional(),
    status: z.enum(["ok", "unknown_list", "rate_limited"]),
  })
  .strict();

export type GroceryTarget = z.output<typeof groceryTargetSchema>;
export type GroceryBasketLine = z.output<typeof groceryBasketLineSchema>;
export type GroceryOffer = z.output<typeof groceryOfferSchema>;
export type BasketSelection = z.output<typeof basketSelectionSchema>;
export type BasketUnmatchedLine = z.output<typeof basketUnmatchedLineSchema>;
export type BasketAssumption = z.output<typeof basketAssumptionSchema>;
export type GroceryBasketPlan = z.output<typeof groceryBasketPlanSchema>;
export type FindGroceryOptionsInput = z.output<
  typeof findGroceryOptionsInputSchema
>;
export type FindGroceryOptionsSuccess = z.output<
  typeof findGroceryOptionsSuccessSchema
>;
export type PlanGroceryBasketInput = z.output<
  typeof planGroceryBasketInputSchema
>;
export type PlanGroceryBasketSuccess = z.output<
  typeof planGroceryBasketSuccessSchema
>;
export type ShoppingListDocument = z.output<typeof shoppingListDocumentSchema>;
export type ShoppingListEnvelope = z.output<typeof shoppingListEnvelopeSchema>;
