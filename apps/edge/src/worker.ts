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
import { staticPageFor } from "./landing/pages";
import {
  renderLlmsFullTxt,
  renderLlmsTxt,
  renderMarkdown,
  renderNotFoundMarkdown,
  renderSitemap,
  renderStaticPageMarkdown,
  renderToolMarkdown,
  withFrontmatter,
} from "./landing/render";
import {
  renderLandingPage,
  renderNotFoundPage,
  renderStaticPage,
  renderToolPage,
} from "./landing/render-page";
import { pageUrl } from "./landing/routes";
import {
  renderAgentCard,
  renderApiCatalog,
  renderArdCatalog,
  renderMcpServerCard,
  renderOpenApi,
  renderPricingMarkdown,
} from "./landing/well-known";

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
  onDiscovery: analytics.reportDiscovery,
  onToolCall: analytics.reportToolCall,
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

/**
 * Every route that answers on `Accept` serves two representations from one
 * URL, so both must carry `Vary`. Without it a CDN caches whichever variant
 * arrived first and then serves HTML to an agent that asked for Markdown, or
 * the other way round. It belongs here rather than in `withSecurityHeaders`,
 * which also wraps the MCP transport responses — those negotiate nothing.
 */
const NEGOTIATED_VARY = "accept, accept-encoding";

function text(responseBody: string, contentType: string): Response {
  return withSecurityHeaders(
    new Response(responseBody, {
      headers: {
        "cache-control": "public, max-age=60",
        "content-type": `${contentType}; charset=utf-8`,
        vary: NEGOTIATED_VARY,
      },
    })
  );
}

function page(response: Response, markdownHref?: string): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=60");
  headers.set("vary", NEGOTIATED_VARY);
  if (markdownHref !== undefined) {
    // RFC 8288: the machine-readable half of the same advert the page carries
    // as <link rel="alternate">.
    headers.set(
      "link",
      `<${markdownHref}>; rel="alternate"; type="text/markdown"`
    );
  }
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
    url.pathname === routeUrl.pathname && accepts(request, "text/markdown");
  if (wantsMarkdown) {
    analytics.reportAgentPageView(
      routeUrl.pathname,
      "markdown",
      callerOf(request),
      ctx
    );
    return text(
      withFrontmatter(
        {
          canonical: `${url.origin}${routeUrl.pathname}`,
          description: tool.description,
          title: tool.title,
        },
        renderToolMarkdown(url.origin, toolCatalog, tool)
      ),
      "text/markdown"
    );
  }
  // The HTML page reports itself from the browser, after hydration.
  return page(
    await renderToolPage(request, url.origin, toolCatalog, tool),
    markdownHrefFor(routeUrl.pathname)
  );
}

const MARKDOWN_SUFFIX = ".md";

/**
 * Markdown that is the resource itself rather than the twin of an HTML page.
 * Without this `/pricing.md` would be rewritten to `/pricing`, which is not a
 * page, and answer 404.
 */
const MARKDOWN_DOCUMENTS: ReadonlySet<string> = new Set(["/pricing.md"]);

/**
 * `/index.md`, `/about.md`, `/tools/<naam>.md`.
 *
 * Content negotiation on `Accept` is the better mechanism and stays the
 * primary one, but plenty of agents only know how to append `.md` to a URL.
 * Both spellings resolve to the same renderer, and the HTML page advertises
 * the twin in a `Link` header and a `<link rel="alternate">`.
 */
function markdownTwinOf(pathname: string): string | undefined {
  if (!pathname.endsWith(MARKDOWN_SUFFIX) || MARKDOWN_DOCUMENTS.has(pathname)) {
    return undefined;
  }
  const stripped = pathname.slice(0, -MARKDOWN_SUFFIX.length);
  return stripped === "/index" || stripped === "" ? "/" : stripped;
}

/** The URL an HTML page points at for its Markdown twin. */
function markdownHrefFor(pathname: string): string {
  return pathname === "/" ? "/index.md" : `${pathname}${MARKDOWN_SUFFIX}`;
}

function accepts(request: Request, mediaType: string): boolean {
  return request.headers.get("accept")?.includes(mediaType) ?? false;
}

/** `/v1` and `/mcp` are API surfaces: their 404 stays the JSON error envelope. */
function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/v1/") || pathname.startsWith("/mcp");
}

/**
 * A 404 is where an agent is most likely to stop, so it says where to look
 * instead. The status stays 404 — a recoverable body is worth nothing if the
 * code claims the path exists — and stays uncached, because a path that is
 * missing today may be a tool page tomorrow.
 */
async function notFound(request: Request, url: URL): Promise<Response> {
  if (isApiPath(url.pathname) || request.method !== "GET") {
    return withSecurityHeaders(
      Response.json(
        { error: { code: "not_found", message: "Not found" } },
        { headers: { "cache-control": "no-store" }, status: 404 }
      )
    );
  }

  if (accepts(request, "text/html")) {
    const rendered = await renderNotFoundPage(request, url.pathname);
    return withSecurityHeaders(
      new Response(rendered.body, {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/html; charset=utf-8",
          vary: NEGOTIATED_VARY,
        },
        status: 404,
      })
    );
  }

  return withSecurityHeaders(
    new Response(renderNotFoundMarkdown(url.origin, url.pathname), {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/markdown; charset=utf-8",
        vary: NEGOTIATED_VARY,
      },
      status: 404,
    })
  );
}

/**
 * The surfaces written for whoever is not a browser: the sitemap, the two
 * `llms.txt` files and the prose pages.
 *
 * `llms.txt` is served here rather than dropped in `public/`. The Worker's
 * assets binding has no `run_worker_first`, so a static file of that name
 * would shadow this route silently — and the body is generated from the
 * registry, which a checked-in file cannot be.
 */
async function handleSiteRequest(
  request: Request,
  url: URL,
  routeUrl: URL,
  ctx: ExecutionContext
): Promise<Response | undefined> {
  if (request.method !== "GET") {
    return undefined;
  }

  if (url.pathname === "/sitemap.xml") {
    return text(renderSitemap(url.origin, toolCatalog), "application/xml");
  }

  if (url.pathname === "/pricing.md") {
    return text(renderPricingMarkdown(url.origin), "text/markdown");
  }

  if (url.pathname === "/openapi.json") {
    return json(renderOpenApi(url.origin, registry));
  }

  const wellKnown = WELL_KNOWN.get(url.pathname);
  if (wellKnown !== undefined) {
    return json(wellKnown(url.origin));
  }

  if (url.pathname === "/llms.txt" || url.pathname === "/llms-full.txt") {
    analytics.reportAgentPageView(
      url.pathname,
      "markdown",
      callerOf(request),
      ctx
    );
    return text(
      url.pathname === "/llms.txt"
        ? renderLlmsTxt(url.origin, registry)
        : renderLlmsFullTxt(url.origin, registry, toolCatalog),
      "text/plain"
    );
  }

  const staticPage = staticPageFor(routeUrl.pathname);
  if (staticPage === undefined) {
    return undefined;
  }

  const wantsMarkdown =
    url.pathname === routeUrl.pathname && accepts(request, "text/markdown");
  if (wantsMarkdown) {
    analytics.reportAgentPageView(
      routeUrl.pathname,
      "markdown",
      callerOf(request),
      ctx
    );
    return text(renderStaticPageMarkdown(staticPage), "text/markdown");
  }
  return page(await renderStaticPage(request, url.origin, staticPage));
}

/**
 * The documents an agent looks for before it looks at a page. Each is derived
 * from the registry, so a new MCP appears in all of them at once.
 *
 * A per-MCP server card sits under its own id as well, because an agent that
 * only wants the OV tools should be able to fetch a card describing just those.
 */
const WELL_KNOWN: ReadonlyMap<string, (origin: string) => unknown> = new Map([
  ["/.well-known/ard.json", (origin) => renderArdCatalog(origin, registry)],
  [
    "/.well-known/agent-card.json",
    (origin) => renderAgentCard(origin, registry),
  ],
  ["/.well-known/api-catalog", (origin) => renderApiCatalog(origin)],
  [
    "/.well-known/mcp/server-card.json",
    (origin) => renderMcpServerCard(origin, registry),
  ],
  ...registry
    .describeMcps()
    .map(
      (mcp) =>
        [
          `/.well-known/mcp/${mcp.id}/server-card.json`,
          (origin: string) => renderMcpServerCard(origin, registry, mcp.id),
        ] as const
    ),
]);

function json(payload: unknown): Response {
  return withSecurityHeaders(
    Response.json(payload, {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=60",
      },
    })
  );
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

/**
 * A HEAD is a GET that stops at the headers. Every page route below tests for
 * GET, so without this a crawler or link checker asking HEAD for the home page
 * fell through to the 404 — the one answer that is certainly wrong. Routing it
 * as a GET and dropping the body keeps the status and the headers honest.
 */
async function handleRequest(
  request: Request,
  env: CloudflareBindings,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  // A `.md` URL is sugar over the Accept negotiation that already exists, so
  // it rewrites into that rather than growing a second rendering path.
  const markdownTwin =
    request.method === "GET" ? markdownTwinOf(url.pathname) : undefined;
  if (markdownTwin !== undefined) {
    const twinUrl = new URL(url);
    twinUrl.pathname = markdownTwin;
    const headers = new Headers(request.headers);
    headers.set("accept", "text/markdown");
    return await handleRequest(
      new Request(twinUrl, { headers, method: "GET" }),
      env,
      ctx
    );
  }

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

  const siteResponse = await handleSiteRequest(request, url, routeUrl, ctx);
  if (siteResponse !== undefined) {
    return siteResponse;
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
      url.pathname === routeUrl.pathname && accepts(request, "text/markdown");
    if (wantsMarkdown) {
      analytics.reportAgentPageView(
        routeUrl.pathname,
        "markdown",
        callerOf(request),
        ctx
      );
      return text(
        withFrontmatter(
          {
            canonical: `${origin}/`,
            description:
              "Gratis, open source MCP-servers voor Nederlandse data, zonder authenticatie.",
            title: "Stamppot",
          },
          renderMarkdown(origin, registry)
        ),
        "text/markdown"
      );
    }
    return page(
      await renderLandingPage(request, origin, registry),
      markdownHrefFor("/")
    );
  }

  return await notFound(request, url);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "HEAD") {
      return await handleRequest(request, env, ctx);
    }

    const response = await handleRequest(
      new Request(request, { method: "GET" }),
      env,
      ctx
    );
    return new Response(null, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  },
} satisfies ExportedHandler<CloudflareBindings>;
