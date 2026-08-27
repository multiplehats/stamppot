import { type OperationRegistry, UnknownOperationError } from "@stamppot/core";
import { z } from "zod";

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const TOOL_ROUTE_PATTERN = /^\/v1\/tools\/([a-z][a-z0-9_]*)$/;

interface ErrorPayload {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large");
    this.name = "BodyTooLargeError";
  }
}

async function collectBodyChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  chunks: Uint8Array[],
  byteLength: number,
  maxBytes: number
): Promise<number> {
  const { done, value } = await reader.read();
  if (done) {
    return byteLength;
  }

  const nextByteLength = byteLength + value.byteLength;
  if (nextByteLength > maxBytes) {
    await reader.cancel();
    throw new BodyTooLargeError();
  }
  chunks.push(value);
  return collectBodyChunks(reader, chunks, nextByteLength, maxBytes);
}

export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES
): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new BodyTooLargeError();
  }

  if (request.body === null) {
    return {};
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  const byteLength = await collectBodyChunks(reader, chunks, 0, maxBytes);
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(body);
  return text === "" ? {} : JSON.parse(text);
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function errorResponse(
  code: string,
  message: string,
  status: number
): Response {
  return json({ error: { code, message } } satisfies ErrorPayload, { status });
}

export async function handleHttpToolsRequest(
  request: Request,
  registry: OperationRegistry
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/v1/mcps") {
    return json({ mcps: registry.describeMcps() });
  }

  if (request.method === "GET" && url.pathname === "/v1/tools") {
    return json({
      tools: registry.listOperations().map((operation) => operation.describe()),
    });
  }

  const match = TOOL_ROUTE_PATTERN.exec(url.pathname);
  if (match === null) {
    return undefined;
  }

  if (request.method !== "POST") {
    return errorResponse(
      "method_not_allowed",
      "Use POST to invoke a tool",
      405
    );
  }

  const [, operationName] = match;
  if (operationName === undefined) {
    return errorResponse("not_found", "Tool not found", 404);
  }

  try {
    const input = await readJsonBody(request);
    const result = await registry.invoke(
      operationName,
      {
        now: () => new Date(),
        request,
        signal: request.signal,
      },
      input
    );
    return json(result);
  } catch (error) {
    if (error instanceof UnknownOperationError) {
      return errorResponse("not_found", "Tool not found", 404);
    }
    if (error instanceof BodyTooLargeError) {
      return errorResponse("body_too_large", error.message, 413);
    }
    if (error instanceof SyntaxError) {
      return errorResponse(
        "invalid_json",
        "Request body must be valid JSON",
        400
      );
    }
    if (error instanceof z.ZodError) {
      return errorResponse("invalid_input", z.prettifyError(error), 400);
    }

    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        event: "tool_invocation_failed",
        operation: operationName,
      })
    );
    return errorResponse("internal_error", "Tool invocation failed", 500);
  }
}
