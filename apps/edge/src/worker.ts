import { env as bindings } from "cloudflare:workers";
import {
  clientIdentityFromUserAgent,
  OperationRegistry,
  UNKNOWN_CLIENT,
} from "@stamppot/core";
import { handleHttpToolsRequest } from "@stamppot/http-adapter";
import { createRegistryMcpHandler } from "@stamppot/mcp-adapter";
import { createGroceriesMcp } from "@stamppot/mcp-groceries";
import { createCloudflareGroceriesDependencies } from "@stamppot/mcp-groceries/cloudflare";
import { createMarktplaatsMcp } from "@stamppot/mcp-marktplaats";
import { createCloudflareMarktplaatsDependencies } from "@stamppot/mcp-marktplaats/cloudflare";
import { createOvMcp } from "@stamppot/mcp-ov";
import { createCloudflareOvDependencies } from "@stamppot/mcp-ov/cloudflare";
import { createEdgeAnalytics } from "./analytics/server";
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
const marktplaatsMcp = createMarktplaatsMcp(
  createCloudflareMarktplaatsDependencies(() => bindings)
);
const ovMcp = createOvMcp(createCloudflareOvDependencies(() => bindings));
const registry = new OperationRegistry([groceriesMcp, marktplaatsMcp, ovMcp]);
const toolCatalog = toolContent(registry);
const analytics = createEdgeAnalytics(() => bindings);

const combinedMcpHandler = createRegistryMcpHandler(registry, {
  onDiscovery: analytics.reportDiscovery,
  onToolCall: analytics.reportToolCall,
  route: "/mcp",
  serverName: "stamppot",
  serverVersion: SERVER_VERSION,
});

const groceriesMcpHandler = createRegistryMcpHandler(registry, {
  mcp: groceriesMcp,
  onDiscovery: analytics.reportDiscovery,
  onToolCall: analytics.reportToolCall,
  route: "/mcp/groceries",
  serverName: "stamppot-groceries",
  serverVersion: SERVER_VERSION,
});

const marktplaatsMcpHandler = createRegistryMcpHandler(registry, {
  mcp: marktplaatsMcp,
  route: "/mcp/marktplaats",
  serverName: "stamppot-marktplaats",
  serverVersion: SERVER_VERSION,
});

const ovMcpHandler = createRegistryMcpHandler(registry, {
  mcp: ovMcp,
  onDiscovery: analytics.reportDiscovery,
  onToolCall: analytics.reportToolCall,
  route: "/mcp/ov",
  serverName: "stamppot-ov",
  serverVersion: SERVER_VERSION,
});

const MCP_HANDLERS: ReadonlyMap<string, typeof combinedMcpHandler> = new Map([
  ["/mcp", combinedMcpHandler],
  ["/mcp/groceries", groceriesMcpHandler],
  ["/mcp/marktplaats", marktplaatsMcpHandler],
  ["/mcp/ov", ovMcpHandler],
]);

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
  routeUrl: URL,
  ctx: ExecutionContext
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
  if (wantsMarkdown) {
    analytics.reportAgentPageView(
      routeUrl.pathname,
      "markdown",
      callerOf(request),
      ctx
    );
    return text(
      renderToolMarkdown(url.origin, toolCatalog, tool),
      "text/markdown"
    );
  }
  // The HTML page reports itself from the browser, after hydration.
  return page(await renderToolPage(request, url.origin, toolCatalog, tool));
}

/** The JSON catalog: read by clients, never by the browser bundle. */
const CATALOG_PATHS = new Set(["/v1/mcps", "/v1/tools"]);

/** These surfaces have no MCP handshake, so the User-Agent is the only signal. */
function callerOf(request: Request) {
  return (
    clientIdentityFromUserAgent(request.headers.get("user-agent")) ??
    UNKNOWN_CLIENT
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const routeUrl = pageUrl(url);

    const mcpHandler = MCP_HANDLERS.get(url.pathname);
    if (mcpHandler !== undefined) {
      return withSecurityHeaders(await mcpHandler(request, env, ctx));
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

    const toolsResponse = await handleHttpToolsRequest(request, registry, {
      context: ctx,
      onToolCall: analytics.reportToolCall,
    });
    if (toolsResponse !== undefined) {
      if (request.method === "GET" && CATALOG_PATHS.has(url.pathname)) {
        analytics.reportAgentPageView(
          url.pathname,
          "catalog",
          callerOf(request),
          ctx
        );
      }
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
      routeUrl,
      ctx
    );
    if (toolPageResponse !== undefined) {
      return toolPageResponse;
    }

    if (request.method === "GET" && routeUrl.pathname === "/") {
      const { origin } = url;
      const wantsMarkdown =
        url.pathname === routeUrl.pathname &&
        (request.headers.get("accept")?.includes("text/markdown") ?? false);
      if (wantsMarkdown) {
        analytics.reportAgentPageView(
          routeUrl.pathname,
          "markdown",
          callerOf(request),
          ctx
        );
        return text(renderMarkdown(origin, registry), "text/markdown");
      }
      return page(
        await renderLandingPage(request, origin, registry, toolCatalog)
      );
    }

    return withSecurityHeaders(
      Response.json(
        { error: { code: "not_found", message: "Not found" } },
        { headers: { "cache-control": "no-store" }, status: 404 }
      )
    );
  },
} satisfies ExportedHandler<CloudflareBindings>;
