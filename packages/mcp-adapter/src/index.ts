import { McpServer } from "@modelcontextprotocol/server";
import type { McpDefinition, OperationRegistry } from "@stamppot/core";
import { createMcpHandler } from "agents/mcp/server";

interface McpHandlerOptions {
  readonly mcp?: McpDefinition;
  readonly route: string;
  readonly serverName: string;
  readonly serverVersion: string;
}

export function createRegistryMcpHandler(
  registry: OperationRegistry,
  options: McpHandlerOptions
) {
  return createMcpHandler(
    ({ requestInfo }) => {
      const server = new McpServer({
        name: options.serverName,
        version: options.serverVersion,
      });
      const operations = registry.listOperations(options.mcp?.id);

      for (const operation of operations) {
        server.registerTool(
          operation.name,
          {
            description: operation.description,
            inputSchema: operation.inputSchema,
            outputSchema: operation.outputSchema,
            title: operation.title,
          },
          async (input) => {
            try {
              const request =
                requestInfo ?? new Request("https://stamppot.invalid/mcp");
              const result = await operation.invoke(
                {
                  now: () => new Date(),
                  request,
                  signal: request.signal,
                },
                input
              );

              return {
                content: [{ text: JSON.stringify(result), type: "text" }],
                structuredContent: result,
              };
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Operation failed";
              return {
                content: [{ text: `Error: ${message}`, type: "text" }],
                isError: true,
              };
            }
          }
        );
      }

      return server;
    },
    {
      legacy: "reject",
      responseMode: "auto",
      route: options.route,
    }
  );
}
