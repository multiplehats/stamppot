import {
  findGroceryOptionsInputSchema,
  planGroceryBasketInputSchema,
  shoppingListDocumentSchema,
} from "@stamppot/mcp-groceries";
import { describe, expect, it } from "vitest";
import {
  checkjebonSourceSchema,
  createOfferId,
  eurosToCents,
  fnv1a32,
  MAX_PRODUCT_NAME_CHARACTERS,
  normalizeQueryTokens,
  normalizeSearchText,
  parsePackageText,
  shardIndexForPrefix,
  tokenPrefix,
} from "../packages/mcp-groceries/src/catalog-format";
import {
  basketSelectionSchema,
  groceryOfferSchema,
} from "../packages/mcp-groceries/src/contracts";

const OFFER_ID_PATTERN = /^off_[A-Za-z0-9_-]{43}$/;

describe("grocery public schemas", () => {
  it("trims queries and fills explicit search defaults", () => {
    expect(
      findGroceryOptionsInputSchema.parse({ query: "  shampoo  " })
    ).toEqual({ limit: 10, query: "shampoo", retailerSlugs: [] });
  });

  it("keeps a syntactically valid unknown retailer filter and rejects duplicates", () => {
    expect(
      findGroceryOptionsInputSchema.parse({
        query: "shampoo",
        retailerSlugs: ["not-in-current-catalog"],
      }).retailerSlugs
    ).toEqual(["not-in-current-catalog"]);
    expect(() =>
      findGroceryOptionsInputSchema.parse({
        query: "shampoo",
        retailerSlugs: ["ah", "ah"],
      })
    ).toThrow();
  });

  it("rejects unknown fields and all documented input overflows", () => {
    expect(() =>
      findGroceryOptionsInputSchema.parse({ query: "milk", sort: "magic" })
    ).toThrow();
    expect(() =>
      findGroceryOptionsInputSchema.parse({ limit: 21, query: "milk" })
    ).toThrow();
    expect(() =>
      findGroceryOptionsInputSchema.parse({
        query: "milk",
        retailerSlugs: Array.from(
          { length: 13 },
          (_, index) => `shop-${index}`
        ),
      })
    ).toThrow();
  });

  it("canonicalizes basket defaults without accepting caller IDs or versions", () => {
    const parsed = planGroceryBasketInputSchema.parse({
      lines: [{ query: "  milk " }],
    });

    expect(parsed).toEqual({
      lines: [
        {
          optional: false,
          query: "milk",
          target: { unit: "package", value: 1 },
        },
      ],
      maxStores: 3,
      retailerSlugs: [],
    });
    expect(() =>
      planGroceryBasketInputSchema.parse({
        catalogVersion: "old",
        lines: [{ lineId: "line-1", query: "milk" }],
      })
    ).toThrow();
  });

  it("enforces target dimensions, safe budgets, and basket line caps", () => {
    expect(() =>
      planGroceryBasketInputSchema.parse({
        lines: [{ query: "milk", target: { unit: "l", value: 1000.001 } }],
      })
    ).toThrow();
    expect(() =>
      planGroceryBasketInputSchema.parse({
        lines: [{ query: "eggs", target: { unit: "each", value: 1.5 } }],
      })
    ).toThrow();
    expect(() =>
      planGroceryBasketInputSchema.parse({
        budgetCents: 100_000_001,
        lines: [{ query: "milk" }],
      })
    ).toThrow();
    expect(() =>
      planGroceryBasketInputSchema.parse({
        lines: Array.from({ length: 21 }, () => ({ query: "milk" })),
      })
    ).toThrow();
  });

  it("canonicalizes a complete shopping-list document", () => {
    expect(
      shoppingListDocumentSchema.parse({
        lines: [{ query: "  eggs ", target: { unit: "each", value: 12 } }],
        title: "  Weekend  ",
      })
    ).toEqual({
      lines: [
        {
          checked: false,
          optional: false,
          query: "eggs",
          target: { unit: "each", value: 12 },
        },
      ],
      title: "Weekend",
    });
  });
});

describe("catalog normalization and format helpers", () => {
  it("normalizes Unicode, diacritics, punctuation, case, and whitespace", () => {
    expect(normalizeSearchText("  Crème—BRÛLÉE, 500 ML! ")).toBe(
      "creme brulee 500 ml"
    );
  });

  it("applies only the reviewed English-Dutch aliases", () => {
    expect(normalizeQueryTokens("crisps")).toEqual(["chips"]);
    expect(normalizeQueryTokens("paper plates")).toEqual([
      "papieren",
      "borden",
    ]);
    expect(normalizeQueryTokens("cola")).toEqual(["cola"]);
    expect(normalizeQueryTokens("constructor")).toEqual(["constructor"]);
  });

  it("keeps published and public product-name bounds aligned", () => {
    const maximumName = "x".repeat(MAX_PRODUCT_NAME_CHARACTERS);
    const oversizedName = `${maximumName}x`;

    expect(
      checkjebonSourceSchema.element.shape.d.element.shape.n.parse(maximumName)
    ).toBe(maximumName);
    expect(groceryOfferSchema.shape.productName.parse(maximumName)).toBe(
      maximumName
    );
    expect(basketSelectionSchema.shape.productName.parse(maximumName)).toBe(
      maximumName
    );
    expect(
      groceryOfferSchema.shape.productName.safeParse(oversizedName).success
    ).toBe(false);
  });

  it("uses stable token prefixes and 32-bit FNV-1a sharding", () => {
    expect(tokenPrefix("ah")).toBe("ah");
    expect(tokenPrefix("shampoo")).toBe("sha");
    expect(fnv1a32("abc")).toBe(0x1a_47_e9_0b);
    expect(shardIndexForPrefix("abc")).toBe(0x1a_47_e9_0b % 128);
  });

  it("parses common Dutch package text into compatible base units", () => {
    expect(parsePackageText("6 x 0,33 l")).toEqual({
      unit: "ml",
      value: 1980,
    });
    expect(parsePackageText("800 g")).toEqual({ unit: "g", value: 800 });
    expect(parsePackageText("1 kg")).toEqual({ unit: "g", value: 1000 });
    expect(parsePackageText("20 stuks")).toEqual({
      unit: "each",
      value: 20,
    });
    expect(parsePackageText("per stuk")).toEqual({
      unit: "each",
      value: 1,
    });
    expect(parsePackageText("per pakket")).toEqual({ unit: "unknown" });
  });

  it("converts numeric euros once into safe integer cents", () => {
    expect(eurosToCents(2.49)).toBe(249);
    expect(eurosToCents(1.005)).toBe(101);
    expect(() => eurosToCents(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("derives stable opaque offer IDs from retailer and source path", async () => {
    const first = await createOfferId("ah", "wi123/example");
    const replay = await createOfferId("ah", "wi123/example");
    const other = await createOfferId("jumbo", "wi123/example");

    expect(first).toMatch(OFFER_ID_PATTERN);
    expect(replay).toBe(first);
    expect(other).not.toBe(first);
  });

  it("strictly validates non-empty upstream-shaped source data", () => {
    const source = [
      {
        c: "Synthetic Market",
        d: [
          {
            l: "products/milk",
            n: "Synthetic milk",
            p: 1.25,
            s: "1 l",
          },
        ],
        i: "https://example.test/logo.svg",
        n: "synthetic",
        u: "https://example.test/",
      },
    ];

    expect(checkjebonSourceSchema.parse(source)).toEqual(source);
    expect(() => checkjebonSourceSchema.parse([])).toThrow();
    expect(() =>
      checkjebonSourceSchema.parse([
        { ...source[0], unexpected: "not accepted" },
      ])
    ).toThrow();
  });
});
