import { createExecutionContext, env } from "cloudflare:test";
import {
  defineMcp,
  defineOperation,
  type McpDiscoveryRecord,
  normalizeClientLabel,
  OperationRegistry,
  type ToolCallRecord,
} from "@stamppot/core";
import { handleHttpToolsRequest } from "@stamppot/http-adapter";
import { createRegistryMcpHandler } from "@stamppot/mcp-adapter";
import { OpenPanelServerProvider } from "trakoo/providers/server";
import { createServerAnalytics } from "trakoo/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { stamppotEvents } from "../apps/edge/src/analytics/events";
import {
  createEdgeAnalytics,
  hasOpenPanelCredentials,
} from "../apps/edge/src/analytics/server";

// Stands in for a shopping-list capability: the class of argument SECURITY.md
// forbids from reaching analytics. Every assertion below hunts for it.
const SECRET_ARGUMENT = "secret-list-key-sentinel";

const echo = defineOperation({
  description: "Echo a capability-shaped argument back.",
  execute(_context, input) {
    return { value: input.listKey };
  },
  input: z.object({ listKey: z.string() }).strict(),
  name: "echo_value",
  output: z.object({ value: z.string() }).strict(),
  title: "Echo value",
});

const explode = defineOperation({
  description: "Fail with the argument in the message.",
  execute(_context, input) {
    throw new Error(`upstream rejected ${input.listKey}`);
  },
  input: z.object({ listKey: z.string() }).strict(),
  name: "explode",
  output: z.object({ value: z.string() }).strict(),
  title: "Explode",
});

// Stands in for a client parsing an upstream response: a ZodError raised
// after the caller's input was accepted. That is the server's failure.
const misparse = defineOperation({
  description: "Fail while parsing an upstream response.",
  execute(_context, _input) {
    z.object({ items: z.array(z.string()) }).parse({ items: "not a list" });
    return { value: "unreachable" };
  },
  input: z.object({ listKey: z.string() }).strict(),
  name: "misparse",
  output: z.object({ value: z.string() }).strict(),
  title: "Misparse",
});

const testMcp = defineMcp({
  description: "Analytics reporting test operations.",
  id: "analytics-test",
  operations: [echo, explode, misparse],
  title: "Analytics test",
});

const registry = new OperationRegistry([testMcp]);

const RECORD_KEYS = [
  "client",
  "clientVersion",
  "durationMs",
  "mcp",
  "outcome",
  "tool",
  "transport",
];

const MODERN_PROTOCOL_VERSION = "2026-07-28";
const LEGACY_PROTOCOL_VERSION = "2025-06-18";

/** A 2026-07-28 per-request envelope, which is where a modern client names itself. */
function metaFor(clientInfo: Record<string, unknown>) {
  return {
    "io.modelcontextprotocol/clientCapabilities": {
      elicitation: {},
      roots: { listChanged: true },
    },
    "io.modelcontextprotocol/clientInfo": clientInfo,
    "io.modelcontextprotocol/protocolVersion": MODERN_PROTOCOL_VERSION,
  };
}

// Exactly what Claude Code 2.1.258 puts on the wire, captured from a real
// `claude mcp` connection against this Worker.
const CLAUDE_CODE_CLIENT_INFO = {
  description: "Anthropic's agentic coding tool",
  name: "claude-code",
  title: "Claude Code",
  version: "2.1.258",
  websiteUrl: "https://claude.com/claude-code",
};
const CLAUDE_CODE_META = metaFor(CLAUDE_CODE_CLIENT_INFO);

/** Every string a record carries, however deeply nested. */
function stringsIn(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.values(value).flatMap(stringsIn);
}

async function callOverMcp(
  toolName: string,
  args: Record<string, unknown>,
  identity: { meta?: Record<string, unknown>; userAgent?: string } = {}
): Promise<ToolCallRecord[]> {
  const records: ToolCallRecord[] = [];
  const handler = createRegistryMcpHandler(registry, {
    mcp: testMcp,
    onToolCall: (record) => records.push(record),
    route: "/mcp-analytics",
    serverName: "analytics-test",
    serverVersion: "1.0.0",
  });

  await handler(
    new Request("https://stamppot.test/mcp-analytics", {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: args,
          name: toolName,
          ...(identity.meta === undefined ? {} : { _meta: identity.meta }),
        },
      }),
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-method": "tools/call",
        "mcp-name": toolName,
        "mcp-protocol-version":
          identity.meta === undefined
            ? LEGACY_PROTOCOL_VERSION
            : MODERN_PROTOCOL_VERSION,
        ...(identity.userAgent === undefined
          ? {}
          : { "user-agent": identity.userAgent }),
      },
      method: "POST",
    }),
    {},
    createExecutionContext()
  );
  return records;
}

async function callOverHttp(
  toolName: string,
  body: string,
  userAgent?: string
): Promise<ToolCallRecord[]> {
  const records: ToolCallRecord[] = [];
  await handleHttpToolsRequest(
    new Request(`https://stamppot.test/v1/tools/${toolName}`, {
      body,
      headers: {
        "content-type": "application/json",
        ...(userAgent === undefined ? {} : { "user-agent": userAgent }),
      },
      method: "POST",
    }),
    registry,
    {
      context: createExecutionContext(),
      onToolCall: (record) => records.push(record),
    }
  );
  return records;
}

describe("tool call records", () => {
  it("reports a successful MCP call without any argument", async () => {
    const [record] = await callOverMcp("echo_value", {
      listKey: SECRET_ARGUMENT,
    });

    expect(record).toBeDefined();
    // The exact key set, not a negative assertion: a future `...input` spread
    // would pass `not.toHaveProperty("listKey")` but fails here.
    expect(Object.keys(record as object).sort()).toEqual(RECORD_KEYS);
    expect(record).toMatchObject({
      mcp: "analytics-test",
      outcome: "success",
      tool: "echo_value",
      transport: "mcp",
    });
    expect(record?.durationMs).toBeGreaterThanOrEqual(0);
    expect(stringsIn(record)).not.toContain(SECRET_ARGUMENT);
  });

  it("reports a thrown tool as an error without its message", async () => {
    const [record] = await callOverMcp("explode", {
      listKey: SECRET_ARGUMENT,
    });

    expect(record?.outcome).toBe("error");
    expect(Object.keys(record as object).sort()).toEqual(RECORD_KEYS);
    // The operation put the argument in its message; the record must not.
    expect(stringsIn(record).join(" ")).not.toContain(SECRET_ARGUMENT);
  });

  it("reports nothing when the protocol layer rejects the arguments", async () => {
    // The MCP SDK validates against the registered input schema before the
    // tool runs, so a rejected call never reaches the operation to be timed.
    expect(await callOverMcp("echo_value", { listKey: 42 })).toHaveLength(0);
  });

  it("reports HTTP tool calls under the http transport", async () => {
    const [record] = await callOverHttp(
      "echo_value",
      JSON.stringify({ listKey: SECRET_ARGUMENT })
    );

    expect(Object.keys(record as object).sort()).toEqual(RECORD_KEYS);
    expect(record).toMatchObject({
      mcp: "analytics-test",
      outcome: "success",
      tool: "echo_value",
      transport: "http",
    });
    expect(stringsIn(record)).not.toContain(SECRET_ARGUMENT);
  });

  it("reports input the schema rejects as invalid_input", async () => {
    // Unlike MCP, the HTTP route has no protocol-level validation in front of
    // it, so the operation's own schema is what turns the call away.
    const [record] = await callOverHttp(
      "echo_value",
      JSON.stringify({ listKey: 42 })
    );

    expect(record?.outcome).toBe("invalid_input");
    expect(Object.keys(record as object).sort()).toEqual(RECORD_KEYS);
  });

  it("reports a ZodError raised after the input was accepted as an error", async () => {
    // The caller did nothing wrong here, so neither transport may blame them.
    const [mcpRecord] = await callOverMcp("misparse", {
      listKey: SECRET_ARGUMENT,
    });
    const [httpRecord] = await callOverHttp(
      "misparse",
      JSON.stringify({ listKey: SECRET_ARGUMENT })
    );

    expect(mcpRecord?.outcome).toBe("error");
    expect(httpRecord?.outcome).toBe("error");
  });

  it("reports malformed JSON as invalid_input", async () => {
    const [record] = await callOverHttp("echo_value", "{not json");

    expect(record?.outcome).toBe("invalid_input");
  });

  it("does not report a name that is not a tool", async () => {
    expect(await callOverHttp("no_such_tool", "{}")).toHaveLength(0);
  });
});

describe("who is calling", () => {
  it("names the harness from the MCP client-info envelope", async () => {
    const [record] = await callOverMcp(
      "echo_value",
      { listKey: SECRET_ARGUMENT },
      { meta: CLAUDE_CODE_META, userAgent: "claude-code/2.1.258 (sdk-cli)" }
    );

    expect(record).toMatchObject({
      client: "claude-code",
      clientVersion: "2.1.258",
    });
  });

  it("falls back to the User-Agent when no client info is declared", async () => {
    // A 2025-era client names itself only in `initialize`, which a stateless
    // server cannot tie to this call.
    const [record] = await callOverMcp(
      "echo_value",
      { listKey: SECRET_ARGUMENT },
      { userAgent: "SomeHarness/4.2 (linux; x64)" }
    );

    expect(record).toMatchObject({
      client: "someharness",
      clientVersion: "4.2",
    });
  });

  it("prefers the declared client info over the User-Agent", async () => {
    const [record] = await callOverMcp(
      "echo_value",
      { listKey: SECRET_ARGUMENT },
      { meta: CLAUDE_CODE_META, userAgent: "node/22.0.0" }
    );

    expect(record?.client).toBe("claude-code");
  });

  it("names the harness on the HTTP route from its User-Agent", async () => {
    const [record] = await callOverHttp(
      "echo_value",
      JSON.stringify({ listKey: SECRET_ARGUMENT }),
      "curl/8.7.1"
    );

    expect(record).toMatchObject({ client: "curl", clientVersion: "8.7.1" });
  });

  it("falls back to unknown when a caller says nothing", async () => {
    const [record] = await callOverHttp(
      "echo_value",
      JSON.stringify({ listKey: SECRET_ARGUMENT })
    );

    expect(record).toMatchObject({
      client: "unknown",
      clientVersion: "unknown",
    });
  });

  it("bounds a hostile User-Agent rather than passing it through", async () => {
    // The declared `clientInfo` is schema-checked by the MCP SDK before it
    // reaches us; the User-Agent is not, so this is the unguarded route.
    const [record] = await callOverHttp(
      "echo_value",
      JSON.stringify({ listKey: SECRET_ARGUMENT }),
      `${"A".repeat(60)}/${"9".repeat(60)}`
    );

    // Self-reported and never verified, so it is lowercased, stripped to a
    // conservative charset and truncated before becoming a chart dimension.
    expect(record?.client).toBe("a".repeat(40));
    expect(record?.clientVersion).toBe("9".repeat(24));
  });

  it("normalizes labels without mangling real client names", () => {
    expect(normalizeClientLabel("claude-code")).toBe("claude-code");
    expect(normalizeClientLabel("Claude Code")).toBe("claude-code");
    expect(normalizeClientLabel("cursor-vscode")).toBe("cursor-vscode");
    expect(normalizeClientLabel("  Hermes Agent  ")).toBe("hermes-agent");
    // Anything outside [a-z0-9._-] collapses to a separator, then trims.
    expect(normalizeClientLabel("<script>alert(1)</script>")).toBe(
      "script-alert-1-script"
    );
    expect(normalizeClientLabel("")).toBeUndefined();
    expect(normalizeClientLabel("!!!")).toBeUndefined();
    expect(normalizeClientLabel(42)).toBeUndefined();
    expect(normalizeClientLabel(undefined)).toBeUndefined();
    // Truncation must not leave a dangling separator, so the trim runs again
    // after the slice. This is the branch a "simplification" would break.
    expect(normalizeClientLabel(`${"a".repeat(39)}-b`)).toBe("a".repeat(39));
  });

  it("keeps the record's key set closed when a client is named", async () => {
    const [record] = await callOverMcp(
      "echo_value",
      { listKey: SECRET_ARGUMENT },
      { meta: CLAUDE_CODE_META }
    );

    // The envelope carries title, description and websiteUrl too; none of them
    // are copied across.
    expect(Object.keys(record as object).sort()).toEqual(RECORD_KEYS);
  });
});

describe("discovery traffic", () => {
  async function discover(
    method: string,
    meta?: Record<string, unknown>
  ): Promise<McpDiscoveryRecord[]> {
    const records: McpDiscoveryRecord[] = [];
    const handler = createRegistryMcpHandler(registry, {
      mcp: testMcp,
      onDiscovery: (record) => records.push(record),
      route: "/mcp-analytics",
      serverName: "analytics-test",
      serverVersion: "1.0.0",
    });

    await handler(
      new Request("https://stamppot.test/mcp-analytics", {
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method,
          params: meta === undefined ? {} : { _meta: meta },
        }),
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-method": method,
          "mcp-protocol-version":
            meta === undefined
              ? LEGACY_PROTOCOL_VERSION
              : MODERN_PROTOCOL_VERSION,
          "user-agent": "claude-code/2.1.258 (sdk-cli)",
        },
        method: "POST",
      }),
      {},
      createExecutionContext()
    );
    return records;
  }

  it("reports a harness that lists tools but calls none", async () => {
    const [record] = await discover("tools/list", CLAUDE_CODE_META);

    expect(record).toEqual({
      client: "claude-code",
      clientVersion: "2.1.258",
      mcp: "analytics-test",
      method: "tools/list",
    });
  });

  it("reports the handshake and discovery probes", async () => {
    expect(
      (await discover("server/discover", CLAUDE_CODE_META))[0]?.method
    ).toBe("server/discover");
    expect((await discover("initialize"))[0]?.method).toBe("initialize");
  });

  it("ignores chatty and already-reported methods", async () => {
    // A long poll that reconnects, and the call that reports itself as a
    // ToolCallRecord — neither belongs in the discovery stream.
    expect(await discover("subscriptions/listen", CLAUDE_CODE_META)).toEqual(
      []
    );
    expect(await discover("tools/call", CLAUDE_CODE_META)).toEqual([]);
    expect(await discover("notifications/cancelled")).toEqual([]);
  });
});

describe("the OpenPanel payload", () => {
  it("carries the declared properties and nothing else", async () => {
    const captured: { payload: { properties?: unknown } }[] = [];
    const analytics = createServerAnalytics({
      events: stamppotEvents,
      providers: [
        new OpenPanelServerProvider({
          clientId: "test-client",
          clientSecret: "test-secret",
          // Returning false captures the final OpenPanel payload and stops it
          // before the network, so this asserts the real shape without a fetch.
          filter: (payload) => {
            captured.push(payload as { payload: { properties?: unknown } });
            return false;
          },
        }),
      ],
    });

    await analytics.track("mcp_tool_called", {
      client: "claude-code",
      clientVersion: "2.1.258",
      durationMs: 12,
      mcp: "groceries",
      outcome: "success",
      tool: "save_shopping_list",
      transport: "mcp",
    });

    const [sent] = captured;
    expect(sent).toBeDefined();
    // `category` and `__timestamp` are trakoo's; the rest are the record's.
    expect(Object.keys(sent?.payload.properties as object).sort()).toEqual([
      "__timestamp",
      "category",
      "client",
      "clientVersion",
      "durationMs",
      "mcp",
      "outcome",
      "tool",
      "transport",
    ]);
    // Authless by design: no profile is ever attached to an MCP call.
    expect(sent?.payload).not.toHaveProperty("profileId", expect.anything());
  });

  it("keeps install-copy properties clear of the injected page context", async () => {
    const captured: { payload: { properties?: Record<string, unknown> } }[] =
      [];
    const analytics = createServerAnalytics({
      events: stamppotEvents,
      providers: [
        new OpenPanelServerProvider({
          clientId: "test-client",
          clientSecret: "test-secret",
          filter: (payload) => {
            captured.push(
              payload as { payload: { properties?: Record<string, unknown> } }
            );
            return false;
          },
        }),
      ],
    });

    // The browser always attaches a page context, and OpenPanel's property
    // builder writes it in *after* the event's own properties. An event
    // property named `page`, `device`, `utm` or `category` is silently
    // overwritten, so this asserts the declared ones survive that merge.
    await analytics.track(
      "install_snippet_copied",
      { client: "claude-code", placement: "tool" },
      { context: { page: { path: "/tools/find_ov_stop" } } }
    );

    const [sent] = captured;
    expect(sent?.payload.properties).toMatchObject({
      client: "claude-code",
      placement: "tool",
    });
  });

  it("sends an agent page view as a screen view with only its path", async () => {
    const captured: { payload: { properties?: unknown } }[] = [];
    const analytics = createServerAnalytics({
      events: stamppotEvents,
      providers: [
        new OpenPanelServerProvider({
          clientId: "test-client",
          clientSecret: "test-secret",
          filter: (payload) => {
            captured.push(payload as { payload: { properties?: unknown } });
            return false;
          },
        }),
      ],
    });

    await analytics.pageView(
      { surface: "markdown" },
      { context: { page: { path: "/tools/search_products" } } }
    );

    const [sent] = captured;
    expect(Object.keys(sent?.payload.properties as object).sort()).toEqual([
      "__path",
      "category",
      "page",
      "surface",
    ]);
    expect(sent?.payload).not.toHaveProperty("profileId", expect.anything());
  });
});

describe("credential gating", () => {
  it("binds no OpenPanel secret in the test Worker", () => {
    // Asserts the vitest.config.ts override actually beats a contributor's
    // decrypted .dev.vars. Without it a `pnpm check:ci` run — which does put a
    // real client id on the environment — would emit events to a live project.
    expect(env.OPENPANEL_API_KEY).toBe("");
    expect(env.OPENPANEL_BACKEND_API_KEY).toBe("");
  });

  it("is on only when both halves of a project's credentials are set", () => {
    expect(hasOpenPanelCredentials("client", "secret")).toBe(true);
    expect(hasOpenPanelCredentials(undefined, "secret")).toBe(false);
    expect(hasOpenPanelCredentials("client", undefined)).toBe(false);
    expect(hasOpenPanelCredentials(undefined, undefined)).toBe(false);
    // dotenvx leaves an undecryptable value out rather than blank, but an
    // empty string must never be mistaken for a configured key either.
    expect(hasOpenPanelCredentials("", "secret")).toBe(false);
    expect(hasOpenPanelCredentials("client", "")).toBe(false);
  });

  it("reports without reaching OpenPanel when no key is configured", async () => {
    const pending: Promise<unknown>[] = [];
    const analytics = createEdgeAnalytics(() => ({}) as CloudflareBindings);

    analytics.reportToolCall(
      {
        client: "claude-code",
        clientVersion: "2.1.258",
        durationMs: 1,
        mcp: "groceries",
        outcome: "success",
        tool: "save_shopping_list",
        transport: "mcp",
      },
      {
        passThroughOnException: () => undefined,
        props: {},
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      } as unknown as ExecutionContext
    );

    // Settles rather than rejecting: an unconfigured Worker must serve tools
    // exactly as a configured one does.
    await expect(Promise.all(pending)).resolves.toBeDefined();
  });
});
