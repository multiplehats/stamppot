import { describe, expect, it } from "vitest";
import {
  absoluteMarktplaatsUrl,
  CONDITIONS,
  conditionFromLabel,
  deliveryFromLabel,
  imageUrl,
  postedOnFromLabel,
  priceTypeFromUpstream,
  SORTS,
} from "../packages/mcp-marktplaats/src/marktplaats-format";

describe("postedOnFromLabel", () => {
  const now = new Date("2026-08-31T10:00:00.000Z");

  it("resolves relative Dutch day labels against Amsterdam calendar days", () => {
    expect(postedOnFromLabel("Vandaag", now)).toBe("2026-08-31");
    expect(postedOnFromLabel("Gisteren", now)).toBe("2026-08-30");
    expect(postedOnFromLabel("Eergisteren", now)).toBe("2026-08-29");
  });

  it("parses an absolute Dutch date label", () => {
    expect(postedOnFromLabel("22 aug 26", now)).toBe("2026-08-22");
    expect(postedOnFromLabel("1 mrt 26", now)).toBe("2026-03-01");
  });

  it("rejects an unknown month and garbage input", () => {
    expect(postedOnFromLabel("22 xyz 26", now)).toBeUndefined();
    expect(postedOnFromLabel("not a date at all", now)).toBeUndefined();
  });

  it("shifts the calendar day forward across the spring-forward transition", () => {
    const beforeSpringForward = new Date("2026-03-28T23:30:00.000Z");
    expect(postedOnFromLabel("Vandaag", beforeSpringForward)).toBe(
      "2026-03-29"
    );
    expect(postedOnFromLabel("Gisteren", beforeSpringForward)).toBe(
      "2026-03-28"
    );
  });

  it("shifts the calendar day forward across the fall-back transition", () => {
    const beforeFallBack = new Date("2026-10-24T22:30:00.000Z");
    expect(postedOnFromLabel("Vandaag", beforeFallBack)).toBe("2026-10-25");
  });

  it("treats a UTC instant that is already the next day in Amsterdam", () => {
    const utcMidnightEdge = new Date("2026-01-15T23:30:00.000Z");
    expect(postedOnFromLabel("Vandaag", utcMidnightEdge)).toBe("2026-01-16");
  });
});

describe("conditionFromLabel", () => {
  it("maps every published condition label to its enum", () => {
    expect(conditionFromLabel("Nieuw")).toBe("new");
    expect(conditionFromLabel("Zo goed als nieuw")).toBe("like_new");
    expect(conditionFromLabel("Gebruikt")).toBe("used");
    expect(conditionFromLabel("Refurbished")).toBe("refurbished");
    expect(conditionFromLabel("Niet werkend")).toBe("not_working");
  });

  it("falls back to unknown for an unrecognised label", () => {
    expect(conditionFromLabel("Zo-zo")).toBe("unknown");
  });

  it("returns undefined for a non-string value", () => {
    expect(conditionFromLabel(undefined)).toBeUndefined();
    expect(conditionFromLabel(42)).toBeUndefined();
    expect(conditionFromLabel(null)).toBeUndefined();
  });
});

describe("priceTypeFromUpstream", () => {
  it("maps every documented upstream price type", () => {
    expect(priceTypeFromUpstream("FIXED")).toBe("fixed");
    expect(priceTypeFromUpstream("MIN_BID")).toBe("bidding");
    expect(priceTypeFromUpstream("FAST_BID")).toBe("bidding");
    expect(priceTypeFromUpstream("FREE")).toBe("free");
    expect(priceTypeFromUpstream("SEE_DESCRIPTION")).toBe("see_description");
    expect(priceTypeFromUpstream("NOTK")).toBe("negotiable");
    expect(priceTypeFromUpstream("ON_REQUEST")).toBe("on_request");
    expect(priceTypeFromUpstream("EXCHANGE")).toBe("exchange");
    expect(priceTypeFromUpstream("RESERVED")).toBe("reserved");
  });

  it("falls back to unknown for an unrecognised value", () => {
    expect(priceTypeFromUpstream("WHATEVER")).toBe("unknown");
    expect(priceTypeFromUpstream(undefined)).toBe("unknown");
  });
});

describe("deliveryFromLabel", () => {
  it("maps every published delivery label to its enum", () => {
    expect(deliveryFromLabel("Ophalen")).toBe("pickup");
    expect(deliveryFromLabel("Ophalen of Verzenden")).toBe(
      "pickup_or_shipping"
    );
    expect(deliveryFromLabel("Verzenden")).toBe("shipping");
  });

  it("falls back to unknown for an unrecognised label", () => {
    expect(deliveryFromLabel("Per postduif")).toBe("unknown");
  });

  it("returns undefined for a non-string value", () => {
    expect(deliveryFromLabel(undefined)).toBeUndefined();
    expect(deliveryFromLabel(7)).toBeUndefined();
  });
});

describe("absoluteMarktplaatsUrl", () => {
  it("resolves a relative Marktplaats path", () => {
    expect(absoluteMarktplaatsUrl("/v/a/b/m1-x")).toBe(
      "https://www.marktplaats.nl/v/a/b/m1-x"
    );
  });

  it("rejects a plain-http path", () => {
    expect(
      absoluteMarktplaatsUrl("http://www.marktplaats.nl/v/a/b/m1-x")
    ).toBeUndefined();
  });

  it("rejects a different host", () => {
    expect(
      absoluteMarktplaatsUrl("https://evil.example/v/a/b/m1-x")
    ).toBeUndefined();
  });

  it("rejects a URL longer than 500 characters", () => {
    const longPath = `/v/a/b/m1-${"x".repeat(500)}`;
    expect(absoluteMarktplaatsUrl(longPath)).toBeUndefined();
  });

  it("rejects a non-string or empty value", () => {
    expect(absoluteMarktplaatsUrl(undefined)).toBeUndefined();
    expect(absoluteMarktplaatsUrl("")).toBeUndefined();
  });
});

describe("imageUrl", () => {
  it("resolves a protocol-relative image URL and substitutes the size", () => {
    expect(
      imageUrl("//images.marktplaats.com/api/v1/x?rule=ecg_mp_eps$_#.jpg", "82")
    ).toBe("https://images.marktplaats.com/api/v1/x?rule=ecg_mp_eps$_82.jpg");
    expect(
      imageUrl("//images.marktplaats.com/api/v1/x?rule=ecg_mp_eps$_#.jpg", "83")
    ).toBe("https://images.marktplaats.com/api/v1/x?rule=ecg_mp_eps$_83.jpg");
  });

  it("rejects an image URL on a host other than the allow-list", () => {
    expect(
      imageUrl("//evil.example/api/v1/x?rule=ecg_mp_eps$_#.jpg", "82")
    ).toBeUndefined();
  });

  it("rejects a non-string or empty value", () => {
    expect(imageUrl(undefined, "82")).toBeUndefined();
    expect(imageUrl("", "82")).toBeUndefined();
  });
});

describe("CONDITIONS", () => {
  it("maps every condition to its upstream attribute value id", () => {
    expect(CONDITIONS.new.attributeValueId).toBe(30);
    expect(CONDITIONS.like_new.attributeValueId).toBe(31);
    expect(CONDITIONS.used.attributeValueId).toBe(32);
    expect(CONDITIONS.refurbished.attributeValueId).toBe(14_050);
    expect(CONDITIONS.not_working.attributeValueId).toBe(13_940);
  });
});

describe("SORTS", () => {
  it("maps every public sort to its upstream sort pair", () => {
    expect(SORTS.newest).toEqual({
      sortBy: "SORT_INDEX",
      sortOrder: "DECREASING",
    });
    expect(SORTS.relevance).toEqual({
      sortBy: "OPTIMIZED",
      sortOrder: "DECREASING",
    });
    expect(SORTS.price_asc).toEqual({
      sortBy: "PRICE",
      sortOrder: "INCREASING",
    });
    expect(SORTS.price_desc).toEqual({
      sortBy: "PRICE",
      sortOrder: "DECREASING",
    });
    expect(SORTS.distance).toEqual({
      sortBy: "LOCATION",
      sortOrder: "INCREASING",
    });
  });
});
