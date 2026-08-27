import { type ZodObject, type ZodRawShape, z } from "zod";

const MCP_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export interface OperationContext {
  readonly now: () => Date;
  readonly request: Request;
  readonly signal: AbortSignal;
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
      const parsedInput = definition.input.parse(input);
      const result = await definition.execute(context, parsedInput);
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
  readonly #mcps: ReadonlyMap<string, McpDefinition>;
  readonly #operations: ReadonlyMap<string, Operation>;

  constructor(mcps: readonly McpDefinition[]) {
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
      }
    }

    this.#mcps = mcpMap;
    this.#operations = operationMap;
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
