import { type ZodObject, type ZodRawShape, z } from "zod";

const MCP_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export interface OperationContext {
  readonly now: () => Date;
  readonly request: Request;
  readonly signal: AbortSignal;
}

/**
 * What one tool invocation is allowed to say about itself.
 *
 * Deliberately closed and deliberately small. SECURITY.md forbids putting tool
 * arguments — a shopping-list `listKey` above all — into analytics, so nothing
 * derived from the input or from an error message may ever join this shape.
 * Every field here is either a name this repository already publishes or a
 * number.
 */
export interface ToolCallRecord {
  /** The calling harness, e.g. "claude-code". Caller-asserted; see {@link normalizeClientLabel}. */
  readonly client: string;
  readonly clientVersion: string;
  readonly durationMs: number;
  /** The MCP the operation belongs to, or "unknown" for an unrouted name. */
  readonly mcp: string;
  readonly outcome: ToolCallOutcome;
  readonly tool: string;
  readonly transport: ToolCallTransport;
}

/** What a caller says it is. Never verified — an agent can claim any name. */
export interface ClientIdentity {
  readonly client: string;
  readonly clientVersion: string;
}

/** Frozen: a shared singleton spread into records across two packages. */
export const UNKNOWN_CLIENT: ClientIdentity = Object.freeze({
  client: "unknown",
  clientVersion: "unknown",
});

const MAX_CLIENT_LENGTH = 40;
const MAX_CLIENT_VERSION_LENGTH = 24;
const DISALLOWED_LABEL_CHARACTERS = /[^a-z0-9._-]+/g;
const TRIM_SEPARATORS = /^[.\-_]+|[.\-_]+$/g;
/** `claude-code/2.1.258 (sdk-cli)` — the leading product token only. */
const USER_AGENT_PRODUCT = /^([^\s/]{1,80})(?:\/([^\s]{1,40}))?/;

/**
 * Bound a caller-supplied label before it becomes an analytics dimension.
 *
 * Every identity here arrives from the caller and none of it is verifiable, so
 * the value is lowercased, stripped to a conservative charset and truncated.
 * That keeps a hostile or buggy client from writing arbitrary text — or an
 * unbounded number of distinct values — into the event stream, while leaving
 * real names like `claude-code` untouched.
 */
export function normalizeClientLabel(
  value: unknown,
  maxLength: number = MAX_CLIENT_LENGTH
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value
    .toLowerCase()
    .replace(DISALLOWED_LABEL_CHARACTERS, "-")
    .replace(TRIM_SEPARATORS, "")
    .slice(0, maxLength)
    .replace(TRIM_SEPARATORS, "");
  return normalized === "" ? undefined : normalized;
}

/** Read `name` and `version` off an MCP `clientInfo`-shaped value. */
export function clientIdentityFrom(value: unknown): ClientIdentity | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const client = normalizeClientLabel(Reflect.get(value, "name"));
  if (client === undefined) {
    return undefined;
  }
  return {
    client,
    clientVersion:
      normalizeClientLabel(
        Reflect.get(value, "version"),
        MAX_CLIENT_VERSION_LENGTH
      ) ?? UNKNOWN_CLIENT.clientVersion,
  };
}

/**
 * The fallback identity, for callers that declare no MCP `clientInfo`: a
 * plain HTTP tool call, or a 2025-era MCP client whose name only ever appears
 * in its `initialize` handshake.
 */
export function clientIdentityFromUserAgent(
  userAgent: string | null
): ClientIdentity | undefined {
  const match =
    userAgent === null ? null : USER_AGENT_PRODUCT.exec(userAgent.trim());
  if (match === null) {
    return undefined;
  }
  const client = normalizeClientLabel(match[1]);
  if (client === undefined) {
    return undefined;
  }
  return {
    client,
    clientVersion:
      normalizeClientLabel(match[2], MAX_CLIENT_VERSION_LENGTH) ??
      UNKNOWN_CLIENT.clientVersion,
  };
}

export type ToolCallOutcome = "error" | "invalid_input" | "success";

/**
 * A client reaching the MCP endpoint without calling a tool: the handshake and
 * discovery traffic a harness sends when it connects. Without this, a harness
 * that installs Stamppot and never calls anything is invisible.
 */
export interface McpDiscoveryRecord {
  readonly client: string;
  readonly clientVersion: string;
  readonly mcp: string;
  /** One of {@link REPORTED_DISCOVERY_METHODS}, never free text. */
  readonly method: string;
}

export type McpDiscoveryReporter = (
  record: McpDiscoveryRecord,
  context: ExecutionContext
) => void;

/**
 * The JSON-RPC methods worth one event each. Deliberately a closed set: it
 * keeps the `method` dimension bounded, and it leaves out the chatty ones —
 * `subscriptions/listen` is a long poll that reconnects, and `tools/call`
 * already reports itself as a {@link ToolCallRecord}.
 */
export const REPORTED_DISCOVERY_METHODS: ReadonlySet<string> = new Set([
  "initialize",
  "server/discover",
  "tools/list",
]);

export type ToolCallTransport = "http" | "mcp";

/**
 * Called once per tool invocation, after it settles. Receives the request's
 * `ExecutionContext` so the caller — not the adapter — decides whether the
 * report outlives the response (`waitUntil`) or is dropped.
 */
export type ToolCallReporter = (
  record: ToolCallRecord,
  context: ExecutionContext
) => void;

/**
 * The caller's arguments failed the operation's input schema, so the operation
 * never ran. Only this class means `invalid_input`: a `ZodError` on its own
 * does not, because operations also use Zod on upstream responses and on
 * their own output, and those failures are the server's, not the caller's.
 */
export class OperationInputError extends Error {
  override readonly cause: z.ZodError;

  constructor(cause: z.ZodError) {
    super("Operation input failed validation");
    this.name = "OperationInputError";
    this.cause = cause;
  }
}

/**
 * Classify a failed invocation without reading its message. Upstream errors
 * echo their input, so a message is never safe to forward to analytics.
 */
export function classifyOperationError(error: unknown): ToolCallOutcome {
  return error instanceof OperationInputError ? "invalid_input" : "error";
}

export interface OperationDescription {
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly name: string;
  readonly outputSchema: Record<string, unknown>;
  readonly title: string;
}

export interface Operation {
  readonly describe: () => OperationDescription;
  readonly description: string;
  readonly inputSchema: ZodObject<ZodRawShape>;
  readonly invoke: (
    context: OperationContext,
    input: unknown
  ) => Promise<Record<string, unknown>>;
  readonly name: string;
  readonly outputSchema: ZodObject<ZodRawShape>;
  readonly title: string;
}

interface OperationDefinition<
  TInputShape extends ZodRawShape,
  TOutputShape extends ZodRawShape,
> {
  readonly description: string;
  readonly execute: (
    context: OperationContext,
    input: z.output<ZodObject<TInputShape>>
  ) =>
    | Promise<z.input<ZodObject<TOutputShape>>>
    | z.input<ZodObject<TOutputShape>>;
  readonly input: ZodObject<TInputShape>;
  readonly name: string;
  readonly output: ZodObject<TOutputShape>;
  readonly title: string;
}

export function defineOperation<
  const TInputShape extends ZodRawShape,
  const TOutputShape extends ZodRawShape,
>(definition: OperationDefinition<TInputShape, TOutputShape>): Operation {
  return {
    describe() {
      return {
        description: definition.description,
        inputSchema: z.toJSONSchema(definition.input) as Record<
          string,
          unknown
        >,
        name: definition.name,
        outputSchema: z.toJSONSchema(definition.output) as Record<
          string,
          unknown
        >,
        title: definition.title,
      };
    },
    description: definition.description,
    inputSchema: definition.input,
    async invoke(context, input) {
      const parsedInput = definition.input.safeParse(input);
      if (!parsedInput.success) {
        throw new OperationInputError(parsedInput.error);
      }
      const result = await definition.execute(context, parsedInput.data);
      return definition.output.parse(result);
    },
    name: definition.name,
    outputSchema: definition.output,
    title: definition.title,
  };
}

export interface McpDefinition {
  readonly description: string;
  readonly id: string;
  readonly operations: readonly Operation[];
  readonly title: string;
}

export interface McpDescription {
  readonly description: string;
  readonly id: string;
  readonly operations: readonly OperationDescription[];
  readonly title: string;
}

export function defineMcp(definition: McpDefinition): McpDefinition {
  if (!MCP_ID_PATTERN.test(definition.id)) {
    throw new Error(`Invalid MCP id: ${definition.id}`);
  }

  return Object.freeze({
    ...definition,
    operations: Object.freeze([...definition.operations]),
  });
}

export class OperationRegistry {
  readonly #mcpIdsByOperation: ReadonlyMap<string, string>;
  readonly #mcps: ReadonlyMap<string, McpDefinition>;
  readonly #operations: ReadonlyMap<string, Operation>;

  constructor(mcps: readonly McpDefinition[]) {
    const mcpIdMap = new Map<string, string>();
    const mcpMap = new Map<string, McpDefinition>();
    const operationMap = new Map<string, Operation>();

    for (const mcp of mcps) {
      if (mcpMap.has(mcp.id)) {
        throw new Error(`Duplicate MCP id: ${mcp.id}`);
      }
      mcpMap.set(mcp.id, mcp);

      for (const operation of mcp.operations) {
        if (operationMap.has(operation.name)) {
          throw new Error(`Duplicate operation name: ${operation.name}`);
        }
        operationMap.set(operation.name, operation);
        mcpIdMap.set(operation.name, mcp.id);
      }
    }

    this.#mcpIdsByOperation = mcpIdMap;
    this.#mcps = mcpMap;
    this.#operations = operationMap;
  }

  /** The id of the MCP that owns `operationName`, or "unknown". */
  mcpIdFor(operationName: string): string {
    return this.#mcpIdsByOperation.get(operationName) ?? "unknown";
  }

  describeMcps(): readonly McpDescription[] {
    return [...this.#mcps.values()].map((mcp) => ({
      description: mcp.description,
      id: mcp.id,
      operations: mcp.operations.map((operation) => operation.describe()),
      title: mcp.title,
    }));
  }

  getMcp(id: string): McpDefinition | undefined {
    return this.#mcps.get(id);
  }

  getOperation(name: string): Operation | undefined {
    return this.#operations.get(name);
  }

  listOperations(mcpId?: string): readonly Operation[] {
    if (mcpId === undefined) {
      return [...this.#operations.values()];
    }

    return this.#mcps.get(mcpId)?.operations ?? [];
  }

  invoke(
    name: string,
    context: OperationContext,
    input: unknown
  ): Promise<Record<string, unknown>> {
    const operation = this.#operations.get(name);
    if (operation === undefined) {
      throw new UnknownOperationError(name);
    }

    return operation.invoke(context, input);
  }
}

export class UnknownOperationError extends Error {
  constructor(name: string) {
    super(`Unknown operation: ${name}`);
    this.name = "UnknownOperationError";
  }
}
