import {
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  McpServer,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import type { McpDefinition, OperationRegistry } from "@stamppot/core";
import { createMcpHandler } from "agents/mcp/server";

interface McpHandlerOptions {
  readonly mcp?: McpDefinition;
  readonly route: string;
  readonly serverName: string;
  readonly serverVersion: string;
}

const MAX_MCP_BODY_BYTES = 64 * 1024;

class McpBodyTooLargeError extends Error {
  constructor() {
    super("MCP request body is too large");
    this.name = "McpBodyTooLargeError";
  }
}

function jsonRpcError(code: number, message: string, status: number): Response {
  return Response.json(
    {
      error: { code, message },
      id: null,
      jsonrpc: "2.0",
    },
    {
      headers: { "cache-control": "no-store" },
      status,
    }
  );
}

async function readBoundedJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MCP_BODY_BYTES) {
    throw new McpBodyTooLargeError();
  }

  if (request.body === null) {
    return {};
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  let readResult = await reader.read();
  while (!readResult.done) {
    const { value } = readResult;
    byteLength += value.byteLength;
    if (byteLength > MAX_MCP_BODY_BYTES) {
      break;
    }
    chunks.push(value);

    // biome-ignore lint/performance/noAwaitInLoops: A stream must be read sequentially so its byte limit can be enforced before buffering the next chunk.
    readResult = await reader.read();
  }

  if (byteLength > MAX_MCP_BODY_BYTES) {
    await reader.cancel();
    throw new McpBodyTooLargeError();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(body);
  return JSON.parse(text);
}

function validateMcpRequest(request: Request): Response | undefined {
  const { hostname, origin } = new URL(request.url);
  const isLocalEndpoint = localhostAllowedHostnames().includes(hostname);
  const isWorkersDevEndpoint = hostname.endsWith(".workers.dev");
  let acceptedHostnames: string[] | undefined;
  if (isLocalEndpoint) {
    acceptedHostnames = localhostAllowedHostnames();
  } else if (isWorkersDevEndpoint) {
    acceptedHostnames = [hostname];
  }
  const hostRejection =
    acceptedHostnames === undefined
      ? undefined
      : hostHeaderValidationResponse(request, acceptedHostnames);
  if (hostRejection !== undefined) {
    return hostRejection;
  }

  if (isWorkersDevEndpoint) {
    const requestOrigin = request.headers.get("origin");
    if (
      requestOrigin === null ||
      requestOrigin === "" ||
      requestOrigin === origin
    ) {
      return undefined;
    }
    return originValidationResponse(request, []);
  }
  return originValidationResponse(request, localhostAllowedOrigins());
}

export function createRegistryMcpHandler(
  registry: OperationRegistry,
  options: McpHandlerOptions
) {
  const handler = createMcpHandler(
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
            } catch {
              return {
                content: [
                  { text: "Error: Tool invocation failed", type: "text" },
                ],
                isError: true,
              };
            }
          }
        );
      }

      return server;
    },
    {
      legacy: "stateless",
      responseMode: "auto",
      route: options.route,
    }
  );

  return async (
    request: Request,
    env: unknown,
    context: ExecutionContext
  ): Promise<Response> => {
    if (request.method !== "POST") {
      return handler(request, env, context);
    }

    const validationRejection = validateMcpRequest(request);
    if (validationRejection !== undefined) {
      return validationRejection;
    }

    try {
      const parsedBody = await readBoundedJsonBody(request);
      return handler.fetch(request, { parsedBody });
    } catch (error) {
      if (error instanceof McpBodyTooLargeError) {
        return jsonRpcError(-32_000, "Request body is too large", 413);
      }
      if (error instanceof SyntaxError) {
        return jsonRpcError(-32_700, "Parse error", 400);
      }
      throw error;
    }
  };
}
