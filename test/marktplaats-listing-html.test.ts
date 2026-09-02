import { describe, expect, it } from "vitest";
import listingHtml from "../packages/mcp-marktplaats/fixtures/marktplaats-listing.html?raw";
import { MAX_DESCRIPTION_CHARACTERS } from "../packages/mcp-marktplaats/src/contracts";
import {
  extractJsonLdDescription,
  extractListingDom,
  extractWindowConfig,
} from "../packages/mcp-marktplaats/src/listing-html";

const DESCRIPTION_DIV_PATTERN =
  /<div data-collapsable="description">[\s\S]*?<\/div>/;
const PRODUCT_DESCRIPTION_PATTERN = /^PS5 disk edition/;

function withoutDescriptionDiv(html: string): string {
  return html.replace(DESCRIPTION_DIV_PATTERN, "");
}

interface FixtureListingConfig {
  readonly gallery?: { readonly alt?: unknown };
  readonly itemId?: unknown;
}

interface FixtureWindowConfig {
  readonly listing?: FixtureListingConfig;
}

describe("extractWindowConfig", () => {
  it("reads the balanced window.__CONFIG__ object from the fixture page", () => {
    const config = extractWindowConfig(listingHtml) as FixtureWindowConfig;

    expect(config.listing?.itemId).toBe("m2437783300");
    expect(typeof config.listing?.gallery?.alt).toBe("string");
    expect(config.listing?.gallery?.alt as string).toContain("}");
  });

  it("returns undefined when the page has no window.__CONFIG__ marker", () => {
    expect(
      extractWindowConfig("<html><body>no config here</body></html>")
    ).toBeUndefined();
  });

  it("returns undefined for a truncated JSON object", () => {
    expect(
      extractWindowConfig(
        '<script>window.__CONFIG__ = {"listing":{"itemId":"m1"</script>'
      )
    ).toBeUndefined();
  });

  it("does not pick up window.__HEADER_CONFIG__ as the config marker", () => {
    expect(
      extractWindowConfig(
        '<script>window.__HEADER_CONFIG__ = {"isSticky":true};</script>'
      )
    ).toBeUndefined();
  });
});

describe("extractListingDom", () => {
  it("extracts the description and attribute table from the fixture page", async () => {
    const dom = await extractListingDom(listingHtml);

    expect(dom.description).toBe(
      "Alles werkt naar behoren & compleet.\nTwee controllers.\nOphalen in Enschede."
    );
    expect(dom.attributes).toEqual([
      { label: "Conditie", value: "Zo goed als nieuw" },
      { label: "Levering", value: "Ophalen of Verzenden" },
      { label: "Kleur", value: "Wit" },
    ]);
  });

  it("decodes numeric, hex, and named HTML entities", async () => {
    const html =
      '<div data-collapsable="description">It&#39;s &#x27;ok&#x27;&nbsp;&lt;b&gt;bold&lt;/b&gt;</div>';

    const dom = await extractListingDom(html);

    expect(dom.description).toBe("It's 'ok' <b>bold</b>");
  });

  it("caps a description longer than the maximum at the bound", async () => {
    const longDescription = "a".repeat(MAX_DESCRIPTION_CHARACTERS + 1000);
    const html = `<div data-collapsable="description">${longDescription}</div>`;

    const dom = await extractListingDom(html);

    expect(dom.description).toHaveLength(MAX_DESCRIPTION_CHARACTERS);
  });

  it("bounds more than 20 attribute pairs to 20", async () => {
    const pairs = Array.from(
      { length: 25 },
      (_, index) =>
        `<div class="Attributes-module-label">Label ${index}</div><div class="Attributes-module-value">Value ${index}</div>`
    ).join("");
    const html = `<div>${pairs}</div>`;

    const dom = await extractListingDom(html);

    expect(dom.attributes).toHaveLength(20);
  });

  it("leaves description undefined when there is no description element", async () => {
    const dom = await extractListingDom(withoutDescriptionDiv(listingHtml));

    expect(dom.description).toBeUndefined();
  });
});

describe("extractJsonLdDescription", () => {
  it("reads the Product description from the fixture page", () => {
    const description = extractJsonLdDescription(listingHtml);

    expect(description).toBeDefined();
    expect(description as string).toMatch(PRODUCT_DESCRIPTION_PATTERN);
  });

  it("ignores BreadcrumbList and ImageObject blocks", () => {
    const description = extractJsonLdDescription(listingHtml);

    expect(description).not.toContain('Marktplaats","item"');
  });

  it("returns undefined when there is no Product block", () => {
    const html =
      '<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>';

    expect(extractJsonLdDescription(html)).toBeUndefined();
  });

  it("returns undefined when the JSON-LD block is malformed", () => {
    const html =
      '<script type="application/ld+json">{"@type":"Product","description":</script>';

    expect(extractJsonLdDescription(html)).toBeUndefined();
  });
});
