import { env, SELF } from "cloudflare:test";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import {
  buildCatalogArtifacts,
  publishCatalogArtifacts,
} from "@stamppot/mcp-groceries/catalog-build";
import { beforeAll, describe, expect, it } from "vitest";
import fixtureText from "../packages/mcp-groceries/fixtures/checkjebon-small.json?raw";

const MCP_PROTOCOL_VERSION = "2026-07-28";

describe("Stamppot Worker", () => {
  // Every route below is served by the groceries MCP, and its read tools go to
  // R2. Publishing the fixture snapshot once keeps the invoke test a real
  // search rather than an assertion about a missing catalog.
  beforeAll(async () => {
    const artifacts = await buildCatalogArtifacts({
      observedAt: new Date("2026-08-27T08:15:30.000Z"),
      source: JSON.parse(fixtureText) as unknown,
    });
    await publishCatalogArtifacts(artifacts, {
      put: async ({ body, key }) => {
        await env.GROCERIES_CATALOG.put(key, body);
      },
    });
  });

  it("serves a health response", async () => {
    const response = await SELF.fetch("https://stamppot.test/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      version: "0.1.0",
    });
  });

  it("renders HTML and agent-readable Markdown from the same registry", async () => {
    const html = await SELF.fetch("https://stamppot.test/");
    const markdown = await SELF.fetch("https://stamppot.test/", {
      headers: { accept: "text/markdown" },
    });

    expect(await html.text()).toContain("find_grocery_options");
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(await markdown.text()).toContain(
      "[`find_grocery_options`](https://stamppot.test/tools/find_grocery_options)"
    );
    expect(markdown.headers.get("content-type")).toContain("text/markdown");
  });

  it("renders a rich HTML and Markdown page for every tool", async () => {
    const html = await SELF.fetch(
      "https://stamppot.test/tools/find_grocery_options"
    );
    const markdown = await SELF.fetch(
      "https://stamppot.test/tools/find_grocery_options",
      { headers: { accept: "text/markdown" } }
    );
    const htmlBody = await html.text();
    const markdownBody = await markdown.text();

    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(htmlBody).toContain("Find current Dutch grocery options");
    expect(htmlBody).toContain(
      '<link href="https://stamppot.test/tools/find_grocery_options" rel="canonical"/>'
    );
    expect(htmlBody).toContain('type="application/ld+json"');
    expect(markdown.headers.get("content-type")).toContain("text/markdown");
    expect(markdownBody).toContain("# Find current Dutch grocery options");
    expect(markdownBody).toContain("## Agent workflow");
    expect(markdownBody).not.toContain("category: groceries");
  });

  it("publishes tool pages in the sitemap", async () => {
    const response = await SELF.fetch("https://stamppot.test/sitemap.xml");
    const sitemap = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(sitemap).toContain(
      "<loc>https://stamppot.test/tools/find_grocery_options</loc>"
    );
  });

  it("invokes the same operation through plain HTTP", async () => {
    const response = await SELF.fetch(
      "https://stamppot.test/v1/tools/find_grocery_options",
      {
        body: JSON.stringify({ query: "shampoo familie" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }
    );
    const result = await response.json<Record<string, unknown>>();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({ status: "ok" });
    expect(JSON.stringify(result)).toContain("Shampoo familie");
  });

  it("rejects malformed input with a stable error envelope", async () => {
    const response = await SELF.fetch(
      "https://stamppot.test/v1/tools/find_grocery_options",
      {
        body: JSON.stringify({ query: "x" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }
    );
    const result = await response.json<{ error: { code: string } }>();

    expect(response.status).toBe(400);
    expect(result.error.code).toBe("invalid_input");
  });

  it("lists registered tools over the MCP protocol", async () => {
    const response = await SELF.fetch("https://stamppot.test/mcp", {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/list",
        params: {
          _meta: {
            [CLIENT_CAPABILITIES_META_KEY]: {},
            [CLIENT_INFO_META_KEY]: { name: "stamppot-test", version: "1" },
            [PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION,
          },
        },
      }),
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-method": "tools/list",
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      },
      method: "POST",
    });
    const payload = await response.json<{
      result: { tools: Array<{ name: string }> };
    }>();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(payload.result.tools.map(({ name }) => name)).toContain(
      "find_grocery_options"
    );
  });
});
