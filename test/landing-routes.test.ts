import { describe, expect, it } from "vitest";
import { isRscUrl, pageUrl } from "../apps/edge/src/landing/routes";

describe("landing RSC routes", () => {
  it("maps the home Flight URL to the home page", () => {
    const url = new URL("https://stamppot.test/_.rsc");

    expect(isRscUrl(url)).toBe(true);
    expect(pageUrl(url).pathname).toBe("/");
  });

  it("maps tool Flight URLs to their document routes", () => {
    const url = new URL(
      "https://stamppot.test/tools/find_grocery_options_.rsc?refresh=1"
    );
    const route = pageUrl(url);

    expect(route.pathname).toBe("/tools/find_grocery_options");
    expect(route.search).toBe("?refresh=1");
  });

  it("leaves regular document routes untouched", () => {
    const url = new URL("https://stamppot.test/tools/find_grocery_options");

    expect(isRscUrl(url)).toBe(false);
    expect(pageUrl(url)).toBe(url);
  });
});
