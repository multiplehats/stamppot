import { SELF } from "cloudflare:test";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";

const MCP_PROTOCOL_VERSION = "2026-07-28";

describe("Stamppot Worker", () => {
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

    expect(await html.text()).toContain("get_dutch_time");
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(await markdown.text()).toContain(
      "[`get_dutch_time`](https://stamppot.test/tools/get_dutch_time)"
    );
    expect(markdown.headers.get("content-type")).toContain("text/markdown");
  });

  it("renders a rich HTML and Markdown page for every tool", async () => {
    const html = await SELF.fetch("https://stamppot.test/tools/get_dutch_time");
    const markdown = await SELF.fetch(
      "https://stamppot.test/tools/get_dutch_time",
      { headers: { accept: "text/markdown" } }
    );
    const htmlBody = await html.text();
    const markdownBody = await markdown.text();

    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(htmlBody).toContain("Dutch local time and date");
    expect(htmlBody).toContain(
      '<link href="https://stamppot.test/tools/get_dutch_time" rel="canonical"/>'
    );
    expect(htmlBody).toContain('type="application/ld+json"');
    expect(markdown.headers.get("content-type")).toContain("text/markdown");
    expect(markdownBody).toContain("# Dutch local time and date");
    expect(markdownBody).toContain("## Structured result");
    expect(markdownBody).not.toContain("category: date-and-time");
  });

  it("publishes tool pages in the sitemap", async () => {
    const response = await SELF.fetch("https://stamppot.test/sitemap.xml");
    const sitemap = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(sitemap).toContain(
      "<loc>https://stamppot.test/tools/get_dutch_time</loc>"
    );
  });

  it("invokes the same operation through plain HTTP", async () => {
    const response = await SELF.fetch(
      "https://stamppot.test/v1/tools/get_dutch_time",
      {
        body: JSON.stringify({ instant: "2026-08-27T10:15:30Z" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }
    );
    const result = await response.json<Record<string, unknown>>();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      localDate: "2026-08-27",
      localTime: "12:15:30",
    });
  });

  it("rejects malformed input with a stable error envelope", async () => {
    const response = await SELF.fetch(
      "https://stamppot.test/v1/tools/get_dutch_time",
      {
        body: JSON.stringify({ instant: "tomorrow-ish" }),
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
      "get_dutch_time"
    );
  });
});
