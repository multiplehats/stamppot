import compiledContent from "virtual:stamppot-mcp-content";
import type { OperationDescription, OperationRegistry } from "@stamppot/core";
import type { CompiledToolContent } from "./content-types";

export interface ToolPageContent extends CompiledToolContent {
  readonly description: string;
  readonly mcpDescription: string;
  readonly mcpTitle: string;
  readonly operation: OperationDescription;
}

export class ToolContentCatalog {
  readonly #tools: ReadonlyMap<string, ToolPageContent>;

  constructor(registry: OperationRegistry) {
    const contentByOperation = new Map(
      compiledContent.map((content) => [content.operationName, content])
    );
    const tools = new Map<string, ToolPageContent>();

    for (const mcp of registry.describeMcps()) {
      for (const operation of mcp.operations) {
        const content = contentByOperation.get(operation.name);
        if (content === undefined) {
          throw new Error(
            `Missing Markdown content for tool: ${operation.name}`
          );
        }
        if (content.mcpId !== mcp.id) {
          throw new Error(
            `Tool content MCP mismatch for ${operation.name}: expected ${mcp.id}, received ${content.mcpId}`
          );
        }

        tools.set(operation.name, {
          ...content,
          description: operation.description,
          mcpDescription: mcp.description,
          mcpTitle: mcp.title,
          operation,
        });
        contentByOperation.delete(operation.name);
      }
    }

    const unknownContent = contentByOperation.keys().next().value;
    if (unknownContent !== undefined) {
      throw new Error(
        `Markdown content has no registered tool: ${unknownContent}`
      );
    }

    this.#tools = tools;
  }

  get(operationName: string): ToolPageContent | undefined {
    return this.#tools.get(operationName);
  }

  list(): readonly ToolPageContent[] {
    return [...this.#tools.values()];
  }

  related(tool: ToolPageContent): readonly ToolPageContent[] {
    const relatedNames =
      tool.related.length > 0
        ? tool.related
        : this.list()
            .filter(
              (candidate) =>
                candidate.category === tool.category &&
                candidate.operationName !== tool.operationName
            )
            .map((candidate) => candidate.operationName);

    return relatedNames.flatMap((operationName) => {
      const relatedTool = this.#tools.get(operationName);
      return relatedTool === undefined ? [] : [relatedTool];
    });
  }
}

export const toolContent = (registry: OperationRegistry): ToolContentCatalog =>
  new ToolContentCatalog(registry);
