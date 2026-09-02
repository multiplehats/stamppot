import {
  CLIENT_INFO_META_KEY,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  McpServer,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import type {
  ClientIdentity,
  McpDefinition,
  McpDiscoveryReporter,
  OperationRegistry,
  ToolCallReporter,
} from "@stamppot/core";
import {
  classifyOperationError,
  clientIdentityFrom,
  clientIdentityFromUserAgent,
  REPORTED_DISCOVERY_METHODS,
  UNKNOWN_CLIENT,
} from "@stamppot/core";
import { createMcpHandler } from "agents/mcp/server";

interface McpHandlerOptions {
  readonly mcp?: McpDefinition;
  /** Reports handshake and discovery traffic, which calls no tool. */
  readonly onDiscovery?: McpDiscoveryReporter;
  /** Reports each settled tool call. Never receives tool arguments. */
  readonly onToolCall?: ToolCallReporter;
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

/**
 * Who is calling, from the request the SDK is about to serve.
 *
 * The 2026-07-28 protocol repeats `clientInfo` in the `_meta` envelope of
 * every request, so a `tools/call` names its own caller — Claude Code sends
 * `{ name: "claude-code", version: "2.1.258" }` there. A 2025-era client only
 * declares itself in `initialize`, which a stateless server cannot tie to a
 * later call, so those fall back to the `User-Agent` header.
 *
 * None of it is verified. A caller can claim any name, so these are
 * self-reported labels, bounded by `normalizeClientLabel`, not identities.
 */
function mcpClientIdentity(body: unknown, request: Request): ClientIdentity {
  // A JSON-RPC batch shares one HTTP request, so one caller sends all of it.
  const message = Array.isArray(body) ? body[0] : body;
  const params =
    typeof message === "object" && message !== null
      ? Reflect.get(message, "params")
      : undefined;

  if (typeof params === "object" && params !== null) {
    const meta = Reflect.get(params, "_meta");
    const declared =
      (typeof meta === "object" && meta !== null
        ? clientIdentityFrom(Reflect.get(meta, CLIENT_INFO_META_KEY))
        : undefined) ?? clientIdentityFrom(Reflect.get(params, "clientInfo"));
    if (declared !== undefined) {
      return declared;
    }
  }

  return (
    clientIdentityFromUserAgent(request.headers.get("user-agent")) ??
    UNKNOWN_CLIENT
  );
}

/** The JSON-RPC method of the request, when it is one worth an event. */
function reportedDiscoveryMethod(body: unknown): string | undefined {
  const message = Array.isArray(body) ? body[0] : body;
  const method =
    typeof message === "object" && message !== null
      ? Reflect.get(message, "method")
      : undefined;
  return typeof method === "string" && REPORTED_DISCOVERY_METHODS.has(method)
    ? method
    : undefined;
}

/** Reports handshake and discovery traffic. Never throws. */
function reportDiscovery(
  options: McpHandlerOptions,
  body: unknown,
  identity: ClientIdentity,
  context: ExecutionContext
): void {
  const { onDiscovery } = options;
  const method = onDiscovery && reportedDiscoveryMethod(body);
  if (onDiscovery === undefined || !method) {
    return;
  }
  try {
    onDiscovery(
      { ...identity, mcp: options.mcp?.id ?? "all", method },
      context
    );
  } catch {
    // Measurement must never change the answer.
  }
}

/**
 * Build the MCP handler.
 *
 * Called once per POST rather than once per Worker, so `report` can close over
 * that request's `ExecutionContext` — the only way an invocation deep inside
 * the SDK's dispatch can reach `waitUntil`. The alternatives (a `WeakMap` keyed
 * on the `Request` the SDK hands back, or `AsyncLocalStorage` across the SDK's
 * internals) both rest on third-party behaviour no type signature promises.
 * The cost is bounded: the SDK's own handler allocates a few closures and an
 * event bus, while the expensive part — building an `McpServer` and
 * registering every tool — already ran per request inside this factory.
 */
function buildHandler(
  registry: OperationRegistry,
  options: McpHandlerOptions,
  identity: ClientIdentity = UNKNOWN_CLIENT,
  report?: (record: Parameters<ToolCallReporter>[0]) => void
) {
  // A reporter that throws inside the success path would be caught below and
  // turn a completed tool call into an error response. It never gets to.
  const reportSafely = (record: Parameters<ToolCallReporter>[0]): void => {
    try {
      report?.(record);
    } catch {
      // Measurement must never change the answer.
    }
  };

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
            const startedAt = Date.now();
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

              reportSafely({
                ...identity,
                durationMs: Date.now() - startedAt,
                mcp: registry.mcpIdFor(operation.name),
                outcome: "success",
                tool: operation.name,
                transport: "mcp",
              });
              return {
                content: [{ text: JSON.stringify(result), type: "text" }],
                structuredContent: result,
              };
            } catch (error) {
              reportSafely({
                ...identity,
                durationMs: Date.now() - startedAt,
                mcp: registry.mcpIdFor(operation.name),
                outcome: classifyOperationError(error),
                tool: operation.name,
                transport: "mcp",
              });
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
}

export function createRegistryMcpHandler(
  registry: OperationRegistry,
  options: McpHandlerOptions
) {
  // Only POST carries tool calls, so every other method keeps the single
  // long-lived handler and pays nothing for reporting.
  const readOnlyHandler = buildHandler(registry, options);

  return async (
    request: Request,
    env: unknown,
    context: ExecutionContext
  ): Promise<Response> => {
    if (request.method !== "POST") {
      return readOnlyHandler(request, env, context);
    }

    const validationRejection = validateMcpRequest(request);
    if (validationRejection !== undefined) {
      return validationRejection;
    }

    const { onToolCall } = options;

    try {
      const parsedBody = await readBoundedJsonBody(request);
      const identity = mcpClientIdentity(parsedBody, request);

      reportDiscovery(options, parsedBody, identity, context);

      // Reported as each call settles rather than after `fetch` resolves:
      // under `responseMode: "auto"` the response can stream while the tool
      // still runs.
      const handler =
        onToolCall === undefined
          ? readOnlyHandler
          : buildHandler(registry, options, identity, (record) => {
              onToolCall(record, context);
            });
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
