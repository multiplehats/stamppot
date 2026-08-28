import { env as bindings } from "cloudflare:workers";
import { OperationRegistry } from "@stamppot/core";
import { handleHttpToolsRequest } from "@stamppot/http-adapter";
import { createRegistryMcpHandler } from "@stamppot/mcp-adapter";
import { createGroceriesMcp } from "@stamppot/mcp-groceries";
import { createCloudflareGroceriesDependencies } from "@stamppot/mcp-groceries/cloudflare";
import { toolContent } from "./landing/content";
import {
  renderMarkdown,
  renderSitemap,
  renderToolMarkdown,
} from "./landing/render";
import { renderLandingPage, renderToolPage } from "./landing/render-page";
import { pageUrl } from "./landing/routes";

const SERVER_VERSION = "0.1.0";
const TOOL_PAGE_PATTERN = /^\/tools\/([a-z][a-z0-9_]*)$/;
const groceriesMcp = createGroceriesMcp(
  createCloudflareGroceriesDependencies(() => bindings)
);
const registry = new OperationRegistry([groceriesMcp]);
const toolCatalog = toolContent(registry);

const combinedMcpHandler = createRegistryMcpHandler(registry, {
  route: "/mcp",
  serverName: "stamppot",
  serverVersion: SERVER_VERSION,
});

const groceriesMcpHandler = createRegistryMcpHandler(registry, {
  mcp: groceriesMcp,
  route: "/mcp/groceries",
  serverName: "stamppot-groceries",
  serverVersion: SERVER_VERSION,
});

// biome-ignore lint/performance/noBarrelFile: Wrangler discovers Durable Object classes from the Worker entrypoint.
export { ShoppingListObject } from "@stamppot/mcp-groceries/cloudflare";

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function text(responseBody: string, contentType: string): Response {
  return withSecurityHeaders(
    new Response(responseBody, {
      headers: {
        "cache-control": "public, max-age=60",
        "content-type": `${contentType}; charset=utf-8`,
      },
    })
  );
}

function page(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=60");
  return withSecurityHeaders(
    new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    })
  );
}

async function handleToolPageRequest(
  request: Request,
  url: URL,
  routeUrl: URL
): Promise<Response | undefined> {
  if (request.method !== "GET") {
    return undefined;
  }

  const operationName = TOOL_PAGE_PATTERN.exec(routeUrl.pathname)?.[1];
  const tool =
    operationName === undefined ? undefined : toolCatalog.get(operationName);
  if (tool === undefined) {
    return undefined;
  }

  const wantsMarkdown =
    url.pathname === routeUrl.pathname &&
    (request.headers.get("accept")?.includes("text/markdown") ?? false);
  return wantsMarkdown
    ? text(renderToolMarkdown(url.origin, toolCatalog, tool), "text/markdown")
    : page(await renderToolPage(request, url.origin, toolCatalog, tool));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const routeUrl = pageUrl(url);

    if (url.pathname === "/mcp") {
      return withSecurityHeaders(await combinedMcpHandler(request, env, ctx));
    }
    if (url.pathname === "/mcp/groceries") {
      return withSecurityHeaders(await groceriesMcpHandler(request, env, ctx));
    }

    if (request.method === "OPTIONS" && url.pathname.startsWith("/v1/")) {
      return withSecurityHeaders(
        new Response(null, {
          headers: {
            "access-control-allow-headers": "content-type",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-origin": "*",
          },
          status: 204,
        })
      );
    }

    const toolsResponse = await handleHttpToolsRequest(request, registry);
    if (toolsResponse !== undefined) {
      const headers = new Headers(toolsResponse.headers);
      headers.set("access-control-allow-origin", "*");
      return withSecurityHeaders(
        new Response(toolsResponse.body, {
          headers,
          status: toolsResponse.status,
          statusText: toolsResponse.statusText,
        })
      );
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return withSecurityHeaders(
        Response.json(
          { status: "ok", version: SERVER_VERSION },
          { headers: { "cache-control": "no-store" } }
        )
      );
    }

    if (request.method === "GET" && url.pathname === "/sitemap.xml") {
      return text(renderSitemap(url.origin, toolCatalog), "application/xml");
    }

    const toolPageResponse = await handleToolPageRequest(
      request,
      url,
      routeUrl
    );
    if (toolPageResponse !== undefined) {
      return toolPageResponse;
    }

    if (request.method === "GET" && routeUrl.pathname === "/") {
      const { origin } = url;
      const wantsMarkdown =
        url.pathname === routeUrl.pathname &&
        (request.headers.get("accept")?.includes("text/markdown") ?? false);
      return wantsMarkdown
        ? text(renderMarkdown(origin, registry), "text/markdown")
        : page(await renderLandingPage(request, origin, registry, toolCatalog));
    }

    return withSecurityHeaders(
      Response.json(
        { error: { code: "not_found", message: "Not found" } },
        { headers: { "cache-control": "no-store" }, status: 404 }
      )
    );
  },
} satisfies ExportedHandler<CloudflareBindings>;
