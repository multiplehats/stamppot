import type { OperationRegistry } from "@stamppot/core";
import type { ToolContentCatalog, ToolPageContent } from "./content";
import { installSnippets } from "./install-targets";
import { toolPath } from "./routes";

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

export function renderSitemap(
  origin: string,
  content: ToolContentCatalog
): string {
  const urls = [
    origin,
    ...content.list().map((tool) => `${origin}${toolPath(tool.operationName)}`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}
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
