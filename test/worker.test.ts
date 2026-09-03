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
const LASTMOD_PATTERN = /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/;

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

    expect(await html.text()).toContain("/mcp/groceries");
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
    expect(htmlBody).toContain("Actuele Nederlandse boodschappenopties vinden");
    expect(htmlBody).toContain(
      '<link href="https://stamppot.test/tools/find_grocery_options" rel="canonical"/>'
    );
    expect(htmlBody).toContain('type="application/ld+json"');
    expect(markdown.headers.get("content-type")).toContain("text/markdown");
    expect(markdownBody).toContain(
      "# Actuele Nederlandse boodschappenopties vinden"
    );
    expect(markdownBody).toContain("## Werkwijze voor agents");
    expect(markdownBody).not.toContain("category: boodschappen");
  });

  it("publishes tool pages and prose pages in the sitemap", async () => {
    const response = await SELF.fetch("https://stamppot.test/sitemap.xml");
    const sitemap = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(sitemap).toContain(
      "<loc>https://stamppot.test/tools/find_grocery_options</loc>"
    );
    expect(sitemap).toContain("<loc>https://stamppot.test/privacy</loc>");
    expect(sitemap).toMatch(LASTMOD_PATTERN);
  });

  // Without `Vary: Accept` a CDN caches whichever representation it saw first
  // and then serves it to the other audience.
  it("marks every negotiated representation as varying on Accept", async () => {
    const [home, tool, markdown] = await Promise.all([
      SELF.fetch("https://stamppot.test/"),
      SELF.fetch("https://stamppot.test/tools/find_grocery_options"),
      SELF.fetch("https://stamppot.test/", {
        headers: { accept: "text/markdown" },
      }),
    ]);

    for (const response of [home, tool, markdown]) {
      expect(response.headers.get("vary")).toContain("accept");
    }
  });

  it("answers a missing page with a recoverable 404", async () => {
    const agent = await SELF.fetch("https://stamppot.test/does-not-exist");
    const browser = await SELF.fetch("https://stamppot.test/does-not-exist", {
      headers: { accept: "text/html" },
    });
    const api = await SELF.fetch("https://stamppot.test/v1/nope");
    const body = await agent.text();

    expect(agent.status).toBe(404);
    expect(agent.headers.get("content-type")).toContain("text/markdown");
    expect(body).toContain("https://stamppot.test/llms.txt");
    expect(body).toContain("https://stamppot.test/sitemap.xml");
    expect(body).toContain("https://stamppot.test/v1/tools");

    expect(browser.status).toBe(404);
    expect(browser.headers.get("content-type")).toContain("text/html");

    // The API surfaces keep their stable error envelope.
    expect(api.status).toBe(404);
    expect(api.headers.get("content-type")).toContain("application/json");
  });

  it("publishes the machine-readable descriptions of itself", async () => {
    const paths = [
      "/openapi.json",
      "/.well-known/ard.json",
      "/.well-known/agent-card.json",
      "/.well-known/api-catalog",
      "/.well-known/mcp/server-card.json",
      "/.well-known/mcp/ov/server-card.json",
    ];
    const responses = await Promise.all(
      paths.map((path) => SELF.fetch(`https://stamppot.test${path}`))
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/json"
      );
    }

    // Every one is generated from the registry, so a new MCP joins them all.
    const card = await responses[4]?.json<{ tools: { name: string }[] }>();
    expect(card?.tools.map((tool) => tool.name)).toContain(
      "find_grocery_options"
    );
    const openapi = await responses[0]?.json<{
      paths: Record<string, unknown>;
    }>();
    expect(Object.keys(openapi?.paths ?? {})).toContain(
      "/v1/tools/find_grocery_options"
    );
  });

  it("serves a markdown twin at an explicit .md URL", async () => {
    const home = await SELF.fetch("https://stamppot.test/index.md");
    const tool = await SELF.fetch(
      "https://stamppot.test/tools/find_grocery_options.md"
    );
    const pricing = await SELF.fetch("https://stamppot.test/pricing.md");
    const html = await SELF.fetch("https://stamppot.test/");

    for (const response of [home, tool, pricing]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/markdown");
    }
    // The HTML advertises the twin both ways round.
    expect(html.headers.get("link")).toContain('rel="alternate"');
    expect(await home.text()).toContain("last-updated:");
  });

  // Crawlers and link checkers ask HEAD before they ask GET.
  it("answers HEAD like GET, without a body", async () => {
    const response = await SELF.fetch("https://stamppot.test/", {
      method: "HEAD",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toBe("");
  });

  it("tells agents when to reach for Stamppot in llms.txt", async () => {
    const response = await SELF.fetch("https://stamppot.test/llms.txt");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("## When to use Stamppot");
    // Registry-driven: every MCP names the job it is for.
    expect(body).toContain("https://stamppot.test/mcp/groceries");
    expect(body).toContain("https://stamppot.test/mcp/ov");
    expect(body).toContain("find_grocery_options");
  });

  it("serves the prose pages as HTML and as Markdown", async () => {
    const html = await SELF.fetch("https://stamppot.test/privacy");
    const markdown = await SELF.fetch("https://stamppot.test/about", {
      headers: { accept: "text/markdown" },
    });
    const htmlBody = await html.text();
    const markdownBody = await markdown.text();

    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(htmlBody).toContain(
      '<link href="https://stamppot.test/privacy" rel="canonical"/>'
    );
    expect(markdown.headers.get("content-type")).toContain("text/markdown");
    expect(markdownBody).toContain("# Over Stamppot");
    // The check that reads these pages wants real content, not a stub.
    expect(markdownBody.length).toBeGreaterThan(500);
  });

  it("carries the homepage identity as JSON-LD", async () => {
    const response = await SELF.fetch("https://stamppot.test/");
    const body = await response.text();

    expect(body).toContain(
      '<link href="https://stamppot.test/" rel="canonical"/>'
    );
    expect(body).toContain('property="og:image"');
    expect(body).toContain('content="website" property="og:type"');
    expect(body).toContain('type="application/ld+json"');
    expect(body).toContain('"@type":"Organization"');
    expect(body).toContain('"@type":"ItemList"');
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
