import type { OperationRegistry } from "@stamppot/core";
import { toolPath } from "./routes";
import { REPO_URL, SITE_NAME, SOCIAL_IMAGE_PATH } from "./urls";

/**
 * The machine-readable descriptions of Stamppot, all generated from the same
 * registry as the pages. Nothing here is a second copy of the catalogue: add an
 * MCP and it appears in every document below without editing this file.
 *
 * Every one of these is a read: there is no account, no key and no OAuth, so
 * the documents say so rather than pointing at an authorisation server that
 * does not exist.
 */
const AUTHLESS = { type: "none" } as const;

/**
 * What a client can check about Stamppot before trusting it. There is no
 * signing key and no attestation service, so the manifest claims neither: it
 * points at the things that can actually be verified — the source that builds
 * this Worker, the licence it ships under, and the policy pages.
 */
function trustManifest(origin: string) {
  return {
    identity: {
      name: SITE_NAME,
      type: "open-source-project",
      url: `${origin}/about`,
    },
    license: "Apache-2.0",
    policies: {
      privacy: `${origin}/privacy`,
      security: `${REPO_URL}/blob/main/SECURITY.md`,
    },
    sourceCode: REPO_URL,
    verification: "source-available",
  };
}

function endpoints(origin: string, registry: OperationRegistry) {
  return registry.describeMcps().map((mcp) => ({
    description: mcp.description,
    id: mcp.id,
    name: mcp.title,
    toolCount: mcp.operations.length,
    url: `${origin}/mcp/${mcp.id}`,
  }));
}

/** Agentic Resource Discovery: <https://agenticresourcediscovery.org/>. */
export function renderArdCatalog(
  origin: string,
  registry: OperationRegistry
): unknown {
  return {
    description:
      "Gratis, open source MCP-servers voor Nederlandse data: boodschappenprijzen, tweedehands advertenties en openbaar vervoer. Geen account en geen API-sleutel.",
    documentation: `${origin}/llms.txt`,
    entries: [
      {
        authentication: AUTHLESS,
        description:
          "Alle Stamppot MCP-servers achter één streamable HTTP endpoint.",
        name: "Stamppot MCP",
        transport: "streamable-http",
        trustManifest: trustManifest(origin),
        type: "mcp",
        url: `${origin}/mcp`,
      },
      ...endpoints(origin, registry).map((mcp) => ({
        authentication: AUTHLESS,
        description: mcp.description,
        name: mcp.name,
        transport: "streamable-http",
        trustManifest: trustManifest(origin),
        type: "mcp",
        url: mcp.url,
      })),
      {
        authentication: AUTHLESS,
        description:
          "Dezelfde operaties over gewone HTTP, met JSON Schema per tool.",
        documentation: `${origin}/openapi.json`,
        name: "Stamppot HTTP API",
        trustManifest: trustManifest(origin),
        type: "openapi",
        url: `${origin}/v1/tools`,
      },
    ],
    name: SITE_NAME,
    provider: { name: SITE_NAME, url: `${origin}/` },
    updated: new Date().toISOString().slice(0, 10),
    url: `${origin}/`,
    version: "0.1",
  };
}

/**
 * The MCP server card. `mcpId` is undefined for the combined endpoint, which
 * is the one an agent should reach for unless it wants a single domain.
 */
export function renderMcpServerCard(
  origin: string,
  registry: OperationRegistry,
  mcpId?: string
): unknown {
  const mcp = mcpId === undefined ? undefined : registry.getMcp(mcpId);
  const operations =
    mcp === undefined
      ? registry.describeMcps().flatMap((entry) => entry.operations)
      : mcp.operations.map((operation) => operation.describe());

  return {
    authentication: AUTHLESS,
    capabilities: { tools: { listChanged: false } },
    description:
      mcp?.description ??
      "Kleine, betrouwbare MCP-servers voor Nederlandse open data. Read-only op het opslaan van een boodschappenlijst na, geen account nodig.",
    documentation: `${origin}/llms.txt`,
    license: "Apache-2.0",
    name: mcp === undefined ? "stamppot" : `stamppot-${mcp.id}`,
    protocolVersion: "2026-07-28",
    provider: { name: SITE_NAME, url: `${origin}/` },
    repository: REPO_URL,
    serverUrl: mcp === undefined ? `${origin}/mcp` : `${origin}/mcp/${mcp.id}`,
    title: mcp?.title ?? SITE_NAME,
    tools: operations.map((operation) => ({
      description: operation.description,
      documentation: `${origin}${toolPath(operation.name)}`,
      inputSchema: operation.inputSchema,
      name: operation.name,
      title: operation.title,
    })),
    transport: "streamable-http",
    version: "0.1.0",
  };
}

/** An A2A-style agent card, for clients that look for one before an MCP one. */
export function renderAgentCard(
  origin: string,
  registry: OperationRegistry
): unknown {
  return {
    capabilities: { pushNotifications: false, streaming: true },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    description:
      "Beantwoordt vragen over Nederlandse boodschappenprijzen, tweedehands advertenties op Marktplaats en Nederlands openbaar vervoer. Alleen lezen, geen account.",
    documentationUrl: `${origin}/llms.txt`,
    iconUrl: `${origin}${SOCIAL_IMAGE_PATH}`,
    name: SITE_NAME,
    preferredTransport: "streamable-http",
    provider: { organization: SITE_NAME, url: `${origin}/` },
    securitySchemes: {},
    skills: registry.describeMcps().map((mcp) => ({
      description: mcp.description,
      examples: mcp.operations.map((operation) => operation.title),
      id: mcp.id,
      name: mcp.title,
      tags: ["nederland", mcp.id],
    })),
    url: `${origin}/mcp`,
    version: "0.1.0",
  };
}

/** RFC 9727: the catalogue of APIs this host serves. */
export function renderApiCatalog(origin: string): unknown {
  return {
    linkset: [
      {
        anchor: `${origin}/`,
        "service-desc": [
          { href: `${origin}/openapi.json`, type: "application/json" },
        ],
        "service-doc": [{ href: `${origin}/llms.txt`, type: "text/plain" }],
        status: [{ href: `${origin}/health` }],
      },
    ],
  };
}

/**
 * OpenAPI for the HTTP half of the registry. Every operation already carries a
 * JSON Schema for its input and its output, so the document is derived rather
 * than maintained — it cannot drift from the tools it describes.
 */
const errorResponse = (description: string) => ({
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/Error" } },
  },
  description,
});

/** Every tool answers failures with the same envelope, so they share these. */
const ERROR_RESPONSES = {
  "400": errorResponse("Ongeldige invoer. `error.code` is `invalid_input`."),
  "404": errorResponse("Onbekende tool (`not_found`)."),
  "429": errorResponse(
    "Rate limit op de bron bereikt (`rate_limited`). Probeer het later opnieuw."
  ),
  "503": errorResponse(
    "De bron is tijdelijk onbereikbaar (`upstream_unavailable`)."
  ),
} as const;

export function renderOpenApi(
  origin: string,
  registry: OperationRegistry
): unknown {
  const paths: Record<string, unknown> = {
    "/v1/mcps": {
      get: {
        description: "De geregistreerde MCP's en hun operaties.",
        operationId: "listMcps",
        responses: { "200": { description: "De lijst met MCP's." } },
        summary: "Lijst alle MCP's",
        tags: ["catalogus"],
      },
    },
    "/v1/tools": {
      get: {
        description:
          "Elke operatie met zijn JSON Schema voor invoer en uitvoer.",
        operationId: "listTools",
        responses: { "200": { description: "De lijst met tools." } },
        summary: "Lijst alle tools",
        tags: ["catalogus"],
      },
    },
  };

  for (const mcp of registry.describeMcps()) {
    for (const operation of mcp.operations) {
      paths[`/v1/tools/${operation.name}`] = {
        post: {
          description: operation.description,
          externalDocs: {
            description: "Tooldocumentatie",
            url: `${origin}${toolPath(operation.name)}`,
          },
          operationId: operation.name,
          requestBody: {
            content: { "application/json": { schema: operation.inputSchema } },
            required: true,
          },
          responses: {
            "200": {
              content: {
                "application/json": { schema: operation.outputSchema },
              },
              description: operation.title,
            },
            ...ERROR_RESPONSES,
          },
          summary: operation.title,
          tags: [mcp.title],
        },
      };
    }
  }

  return {
    components: {
      schemas: {
        // The envelope every failing call returns, documented so an agent can
        // branch on `error.code` instead of parsing a message.
        Error: {
          properties: {
            error: {
              properties: {
                code: {
                  description: "Machineleesbare foutcode.",
                  enum: [
                    "invalid_input",
                    "not_found",
                    "rate_limited",
                    "upstream_unavailable",
                  ],
                  type: "string",
                },
                message: {
                  description: "Korte uitleg, bedoeld voor een mens.",
                  type: "string",
                },
                retryable: {
                  description: "Of dezelfde aanroep later kan slagen.",
                  type: "boolean",
                },
              },
              required: ["code", "message"],
              type: "object",
            },
          },
          required: ["error"],
          type: "object",
        },
      },
    },
    externalDocs: { description: "llms.txt", url: `${origin}/llms.txt` },
    info: {
      description:
        "De HTTP-kant van Stamppot. Dezelfde operaties als de MCP-servers, uit dezelfde definitie, dus de schema's kunnen niet uit elkaar lopen. Geen authenticatie.",
      license: { name: "Apache-2.0", url: `${REPO_URL}/blob/main/LICENSE` },
      title: "Stamppot HTTP API",
      version: "0.1.0",
    },
    openapi: "3.1.0",
    paths,
    servers: [{ url: origin }],
    tags: registry
      .describeMcps()
      .map((mcp) => ({ description: mcp.description, name: mcp.title })),
  };
}

/** `/pricing.md`: free, and an agent should be able to read that in one line. */
export function renderPricingMarkdown(origin: string): string {
  return `# Prijzen — Stamppot

Stamppot is gratis. Er is één plan en dat kost niets.

## Gratis

- Prijs: € 0
- Account: niet nodig, en er is er ook geen
- API-sleutel: niet nodig
- Limieten: geen limiet per gebruiker. Op de bronnen die het nodig hebben geldt een rate limit van 30 aanroepen per minuut, gedeeld, zodat de bron het aankan.
- Inbegrepen: elke MCP-server, elke tool en de HTTP API op ${origin}/v1/tools

## Wat je ervoor terugkrijgt

Momentopnames uit publieke Nederlandse bronnen. Geen SLA, geen uptimegarantie en geen support­contract: dit is een open-sourceproject, geen dienst met een factuur.

Zelf draaien mag ook — de code staat onder Apache-2.0 op ${REPO_URL}.
`;
}
