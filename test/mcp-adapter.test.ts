import { createExecutionContext } from "cloudflare:test";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { defineMcp, defineOperation, OperationRegistry } from "@stamppot/core";
import { createRegistryMcpHandler } from "@stamppot/mcp-adapter";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const CURRENT_PROTOCOL_VERSION = "2026-07-28";
const LEGACY_PROTOCOL_VERSION = "2025-06-18";
const SECRET_SENTINEL = "secret-adapter-sentinel";

const readValue = defineOperation({
  description: "Read a deterministic value for transport tests.",
  execute(_context, input) {
    return { value: input.filters.query };
  },
  input: z
    .object({
      filters: z
        .object({
          query: z
            .string()
            .describe("Nested query text used to prove schema descriptions."),
        })
        .strict()
        .describe("Nested filters passed to this read operation."),
    })
    .strict(),
  name: "read_value",
  output: z.object({ value: z.string() }).strict(),
  title: "Read value",
});

const throwSecret = defineOperation({
  description: "Throw a sentinel for transport error-boundary tests.",
  execute() {
    throw new Error(SECRET_SENTINEL);
  },
  input: z.object({}).strict(),
  name: "throw_secret",
  output: z.object({ value: z.string() }).strict(),
  title: "Throw secret",
});

const testMcp = defineMcp({
  description: "MCP adapter test operations.",
  id: "adapter-test",
  operations: [readValue, throwSecret],
  title: "Adapter test",
});

const registry = new OperationRegistry([testMcp]);
const handler = createRegistryMcpHandler(registry, {
  mcp: testMcp,
  route: "/mcp-test",
  serverName: "adapter-test",
  serverVersion: "1.0.0",
});

interface JsonRpcPayload {
  readonly error?: { readonly code: number; readonly message: string };
  readonly id?: number | null;
  readonly result?: {
    readonly [key: string]: unknown;
    readonly tools?: unknown;
  };
}

function requestMeta(protocolVersion: string) {
  return {
    [CLIENT_CAPABILITIES_META_KEY]: {},
    [CLIENT_INFO_META_KEY]: { name: "stamppot-adapter-test", version: "1" },
    [PROTOCOL_VERSION_META_KEY]: protocolVersion,
  };
}

async function readProtocolPayload(
  response: Response
): Promise<JsonRpcPayload> {
  const body = await response.text();
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    return JSON.parse(body) as JsonRpcPayload;
  }

  const messages = [...body.matchAll(/^data:\s*(.+)$/gmu)].map((match) =>
    JSON.parse(match[1] ?? "null")
  ) as JsonRpcPayload[];
  const responseMessage = messages.findLast(
    (message) => message.result !== undefined || message.error !== undefined
  );
  if (responseMessage === undefined) {
    throw new Error("SSE response did not contain a JSON-RPC result");
  }
  return responseMessage;
}

async function callProtocol(
  protocolVersion: string,
  method: string,
  params: Record<string, unknown>,
  id = 1
): Promise<{ payload: JsonRpcPayload; response: Response }> {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-method": method,
    "mcp-protocol-version": protocolVersion,
  });
  const { name: requestedToolName } = params;
  if (method === "tools/call" && typeof requestedToolName === "string") {
    headers.set("mcp-name", requestedToolName);
  }
  const requestParams =
    protocolVersion === CURRENT_PROTOCOL_VERSION
      ? { ...params, _meta: requestMeta(protocolVersion) }
      : params;

  const response = await handler(
    new Request("https://stamppot.test/mcp-test", {
      body: JSON.stringify({
        id,
        jsonrpc: "2.0",
        method,
        params: requestParams,
      }),
      headers,
      method: "POST",
    }),
    {},
    createExecutionContext()
  );
  return { payload: await readProtocolPayload(response.clone()), response };
}

describe.each([
  ["current 2026", CURRENT_PROTOCOL_VERSION],
  ["stateless 2025", LEGACY_PROTOCOL_VERSION],
])("MCP adapter %s lane", (_label, protocolVersion) => {
  it("lists tools and calls a read operation twice without a session", async () => {
    const list = await callProtocol(protocolVersion, "tools/list", {}, 1);
    const first = await callProtocol(
      protocolVersion,
      "tools/call",
      { arguments: { filters: { query: "first" } }, name: "read_value" },
      2
    );
    const second = await callProtocol(
      protocolVersion,
      "tools/call",
      { arguments: { filters: { query: "second" } }, name: "read_value" },
      3
    );

    expect(list.payload.error).toBeUndefined();
    expect(first.payload.error).toBeUndefined();
    expect(second.payload.error).toBeUndefined();

    const tools = list.payload.result?.tools as
      | Array<{ name: string }>
      | undefined;
    expect(tools?.map(({ name }) => name)).toEqual([
      "read_value",
      "throw_secret",
    ]);
    expect(JSON.stringify(first.payload)).toContain("first");
    expect(JSON.stringify(second.payload)).toContain("second");
    expect(list.response.headers.get("mcp-session-id")).toBeNull();
    expect(first.response.headers.get("mcp-session-id")).toBeNull();
    expect(second.response.headers.get("mcp-session-id")).toBeNull();
  });
});

describe("MCP adapter ingress", () => {
  it("preserves nested input descriptions in tools/list", async () => {
    const { payload } = await callProtocol(
      CURRENT_PROTOCOL_VERSION,
      "tools/list",
      {}
    );
    const tools = payload.result?.tools as
      | Array<{
          inputSchema: {
            properties: {
              filters: {
                description: string;
                properties: { query: { description: string } };
              };
            };
          };
          name: string;
        }>
      | undefined;
    const readTool = tools?.find(({ name }) => name === "read_value");

    expect(readTool?.inputSchema.properties.filters.description).toBe(
      "Nested filters passed to this read operation."
    );
    expect(
      readTool?.inputSchema.properties.filters.properties.query.description
    ).toBe("Nested query text used to prove schema descriptions.");
  });

  it("rejects an oversized declared body with a stable JSON-RPC error", async () => {
    const response = await handler(
      new Request("https://stamppot.test/mcp-test", {
        body: "{}",
        headers: {
          "content-length": String(64 * 1024 + 1),
          "content-type": "application/json",
        },
        method: "POST",
      }),
      {},
      createExecutionContext()
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: { code: -32_000, message: "Request body is too large" },
      id: null,
      jsonrpc: "2.0",
    });
  });

  it("rejects an oversized streamed body at 64 KiB", async () => {
    const response = await handler(
      new Request("https://stamppot.test/mcp-test", {
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(64 * 1024));
            controller.enqueue(new Uint8Array([1]));
            controller.close();
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      {},
      createExecutionContext()
    );

    expect(response.status).toBe(413);
    const body = await response.text();
    expect(body).toContain("Request body is too large");
    expect(body).not.toContain("Uint8Array");
  });

  it("returns a stable parse error for malformed JSON", async () => {
    const response = await handler(
      new Request("https://stamppot.test/mcp-test", {
        body: "{not-json",
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      {},
      createExecutionContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: -32_700, message: "Parse error" },
      id: null,
      jsonrpc: "2.0",
    });
  });

  it("rejects an invalid Origin before attempting to parse", async () => {
    const response = await handler(
      new Request("http://localhost/mcp-test", {
        body: "{not-json",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        method: "POST",
      }),
      {},
      createExecutionContext()
    );
    const body = await response.text();

    expect(response.status).toBe(403);
    expect(body).not.toContain("Parse error");
    expect(body).not.toContain("not-json");
  });

  it("never exposes an operation exception message", async () => {
    const { payload } = await callProtocol(
      CURRENT_PROTOCOL_VERSION,
      "tools/call",
      { arguments: {}, name: "throw_secret" }
    );
    const serialized = JSON.stringify(payload);

    expect(serialized).toContain("Error: Tool invocation failed");
    expect(serialized).not.toContain(SECRET_SENTINEL);
  });
});
