import { defineMcp, defineOperation, OperationRegistry } from "@stamppot/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const echo = defineOperation({
  description: "Return a value.",
  execute(_context, input) {
    return input;
  },
  input: z.object({ value: z.string() }),
  name: "echo_value",
  output: z.object({ value: z.string() }),
  title: "Echo",
});

describe("OperationRegistry", () => {
  it("exposes and invokes an operation through its public interface", async () => {
    const registry = new OperationRegistry([
      defineMcp({
        description: "Test operations.",
        id: "test",
        operations: [echo],
        title: "Test",
      }),
    ]);

    const result = await registry.invoke(
      "echo_value",
      {
        now: () => new Date("2026-08-27T10:00:00Z"),
        request: new Request("https://example.test"),
        signal: AbortSignal.timeout(1000),
      },
      { value: "stamppot" }
    );

    expect(result).toEqual({ value: "stamppot" });
    expect(registry.describeMcps()[0]?.operations[0]?.name).toBe("echo_value");
  });

  it("rejects duplicate operation names across MCPs", () => {
    const first = defineMcp({
      description: "First MCP.",
      id: "first",
      operations: [echo],
      title: "First",
    });
    const second = defineMcp({
      description: "Second MCP.",
      id: "second",
      operations: [echo],
      title: "Second",
    });

    expect(() => new OperationRegistry([first, second])).toThrow(
      "Duplicate operation name"
    );
  });
});
