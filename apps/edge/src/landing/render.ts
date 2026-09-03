import type { OperationRegistry } from "@stamppot/core";
import type { ToolContentCatalog, ToolPageContent } from "./content";
import { installSnippets } from "./install-targets";
import { presentationFor } from "./mcp-presentation";
import { STATIC_PAGES, type StaticPage } from "./pages";
import { toolPath } from "./routes";
import { REPO_URL } from "./urls";

export function renderMarkdown(
  origin: string,
  registry: OperationRegistry
): string {
  const connect = installSnippets({
    endpoint: `${origin}/mcp`,
    serverName: "stamppot",
  })
    .map(
      (option) =>
        `### ${option.label}\n\n${
          option.kind === "config"
            ? `Toevoegen aan \`${option.location}\`:`
            : "Run:"
        }\n\n\`\`\`${option.kind === "config" ? "json" : "bash"}\n${option.snippet}\n\`\`\``
    )
    .join("\n\n");
  const mcps = registry
    .describeMcps()
    .map(
      (mcp) =>
        `### ${mcp.title}\n\n${mcp.description}\n\n${mcp.operations
          .map(
            (operation) =>
              `- [\`${operation.name}\`](${origin}/tools/${operation.name}): ${operation.description}`
          )
          .join("\n")}`
    )
    .join("\n\n");

  return `# Stamppot

De hele Nederlandse keuken, via hetzelfde endpoint.

Kleine, betrouwbare MCP-servers voor Nederlandse data. Gratis, open source en zonder account.

## Koppelen

${connect}

## MCP's

${mcps}

## HTTP

- \`GET ${origin}/v1/mcps\`
- \`GET ${origin}/v1/tools\`
- \`POST ${origin}/v1/tools/:tool\`
`;
}

/**
 * `/llms.txt`: the entry point an agent reads before deciding whether Stamppot
 * is the right tool for the job at hand.
 *
 * The "Wanneer je Stamppot gebruikt" section is the point of the file. It names
 * the jobs rather than the features, because an agent choosing between sources
 * needs to match a user's question to a server, and "gratis en open source"
 * helps it not at all. The lines come from `mcp-presentation.ts`, so a new MCP
 * appears here the moment it is registered.
 */
export function renderLlmsTxt(
  origin: string,
  registry: OperationRegistry
): string {
  const mcps = registry.describeMcps();
  const useWhen = mcps
    .map(
      (mcp) =>
        `- **${mcp.title}** (\`${origin}/mcp/${mcp.id}\`): ${presentationFor(mcp.id).useWhen}`
    )
    .join("\n");
  const catalog = mcps
    .map(
      (mcp) =>
        `### ${mcp.title}\n\n${mcp.description}\n\n${mcp.operations
          .map(
            (operation) =>
              `- [\`${operation.name}\`](${origin}${toolPath(operation.name)}): ${operation.description}`
          )
          .join("\n")}`
    )
    .join("\n\n");
  const pages = STATIC_PAGES.map(
    (page) => `- [${page.title}](${origin}${page.path}): ${page.description}`
  ).join("\n");

  return `# Stamppot

> Gratis, open source MCP-servers voor Nederlandse data. Geen account en geen API-sleutel: plak het endpoint in je client en begin. Eén adres voor boodschappenprijzen, tweedehands advertenties en openbaar vervoer. Op de bronnen die het nodig hebben geldt een rate limit, zodat de bron het aankan.

## When to use Stamppot / Wanneer je Stamppot gebruikt

Use Stamppot when a question about the Netherlands needs current, factual data you cannot answer from your own knowledge. Gebruik Stamppot dan, en niet eerder:

${useWhen}

Gebruik Stamppot **niet** om iets te kopen, te reserveren of te boeken. Op het opslaan van een boodschappenlijst na leest elke operatie alleen, en elk antwoord is een momentopname: prijzen zijn indicatief, voorraad is niet gegarandeerd en een reisadvies is geen vervoerbewijs. Er is geen dekking buiten Nederland.

## Hoe je Stamppot aanroept

Twee kanalen, één definitie, dezelfde schema's:

- **MCP (streamable HTTP)** — \`${origin}/mcp\` voor alle servers samen, of \`${origin}/mcp/<id>\` voor er één. Geen authenticatie; stuur meteen \`initialize\`.
- **Gewone HTTP** — \`GET ${origin}/v1/tools\` voor de catalogus met JSON Schema per tool, en \`POST ${origin}/v1/tools/<naam>\` met de argumenten als JSON body.

Elke pagina op deze site geeft ook Markdown terug wanneer je \`Accept: text/markdown\` meestuurt.

## MCP's en tools

${catalog}

## Over dit project

${pages}

- [Broncode op GitHub](${REPO_URL}): Apache-2.0, draait op één Cloudflare Worker.
- [Bijdragen](${REPO_URL}/blob/main/CONTRIBUTING.md): het package-contract voor een nieuwe Nederlandse databron.
- [Beveiligingsbeleid](${REPO_URL}/blob/main/SECURITY.md): hoe je een kwetsbaarheid meldt.
- [Sitemap](${origin}/sitemap.xml)
`;
}

/**
 * `/llms-full.txt`: `llms.txt` with every tool page's documentation inlined, so
 * an agent can read the whole surface in one request instead of eleven.
 */
export function renderLlmsFullTxt(
  origin: string,
  registry: OperationRegistry,
  content: ToolContentCatalog
): string {
  const documentation = content
    .list()
    .map((tool) => renderToolMarkdown(origin, content, tool))
    .join("\n\n---\n\n");

  return `${renderLlmsTxt(origin, registry)}
---

# Tooldocumentatie

${documentation}`;
}

/**
 * Frontmatter on every Markdown representation. An agent that fetched the
 * Markdown twin of a page should not have to infer the title, the canonical
 * URL or the date from the prose.
 */
export function withFrontmatter(
  meta: {
    readonly canonical: string;
    readonly description: string;
    readonly title: string;
  },
  body: string
): string {
  const quote = (value: string) => value.replaceAll('"', '\\"');
  return `---
title: "${quote(meta.title)}"
description: "${quote(meta.description)}"
canonical: "${meta.canonical}"
last-updated: "${today()}"
---

${body}`;
}

/** A `StaticPage` as Markdown, for `Accept: text/markdown` on those routes. */
export function renderStaticPageMarkdown(page: StaticPage): string {
  const sections = page.sections
    .map((section) => `## ${section.heading}\n\n${section.body.join("\n\n")}`)
    .join("\n\n");

  return `# ${page.title}

${page.intro}

${sections}
`;
}

/**
 * The body of a 404.
 *
 * A dead end is where an agent is most likely to give up, so the response says
 * where to look instead rather than only that the path was wrong.
 */
export function renderNotFoundMarkdown(origin: string, path: string): string {
  return `# 404 — niet gevonden

\`${path}\` bestaat niet op ${origin}.

## Waar je wel moet zijn

- [Alle tools met hun schema's](${origin}/v1/tools) — \`GET /v1/tools\`
- [Overzicht voor agents](${origin}/llms.txt) — wanneer je Stamppot gebruikt en hoe je hem aanroept
- [Sitemap](${origin}/sitemap.xml) — elke indexeerbare pagina
- [Homepage](${origin}/) — stuur \`Accept: text/markdown\` mee voor de Markdown-versie

Een toolpagina staat altijd op \`${origin}/tools/<naam>\`, waarbij \`<naam>\` een operatie uit \`/v1/tools\` is.
`;
}

export function renderToolMarkdown(
  origin: string,
  content: ToolContentCatalog,
  tool: ToolPageContent
): string {
  const related = content.related(tool);
  const relatedSection =
    related.length === 0
      ? ""
      : `\n\n## Gerelateerde tools\n\n${related
          .map(
            (relatedTool) =>
              `- [\`${relatedTool.operationName}\`](${origin}${toolPath(relatedTool.operationName)}): ${relatedTool.description}`
          )
          .join("\n")}`;

  return `${tool.markdown}

## Koppelen

- Alle MCP's samen: \`${origin}/mcp\`
- ${tool.mcpTitle} MCP: \`${origin}/mcp/${tool.mcpId}\`
- HTTP: \`${origin}/v1/tools/${tool.operationName}\`${relatedSection}
`;
}

/**
 * `lastmod` is one date for the whole sitemap rather than a per-page one: every
 * URL here is generated from the registry and the content files, so a deploy is
 * the only thing that can change any of them, and they all change together.
 *
 * It must be read inside the request. A Worker's clock is frozen at the epoch
 * until the isolate does its first I/O, so a module-scope `new Date()` ships a
 * sitemap stamped 1970 and agents read the whole site as abandoned.
 */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function renderSitemap(
  origin: string,
  content: ToolContentCatalog
): string {
  const BUILT_AT = today();
  const paths = [
    "/",
    ...STATIC_PAGES.map((page) => page.path),
    ...content.list().map((tool) => toolPath(tool.operationName)),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths
  .map(
    (path) =>
      `  <url><loc>${escapeXml(path === "/" ? origin : `${origin}${path}`)}</loc><lastmod>${BUILT_AT}</lastmod></url>`
  )
  .join("\n")}
</urlset>`;
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "'": "&#39;",
        '"': "&quot;",
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
      })[character] ?? character
  );
}
