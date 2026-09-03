import type {
  ClientIdentity,
  McpDiscoveryReporter,
  ToolCallRecord,
  ToolCallReporter,
} from "@stamppot/core";
import { OpenPanelServerProvider } from "trakoo/providers/server";
import { createServerAnalytics } from "trakoo/server";
import { stamppotEvents } from "./events";

/**
 * The two OpenPanel client secrets. Declared here rather than trusted to
 * `CloudflareBindings`, which `wrangler types` regenerates from whatever
 * `.dev.vars` happened to hold — a contributor without decryption keys would
 * otherwise break typecheck. Optional for the same reason: absent keys must
 * disable analytics, never fail the Worker.
 */
interface AnalyticsSecretBindings {
  readonly OPENPANEL_API_KEY?: string;
  readonly OPENPANEL_BACKEND_API_KEY?: string;
}

type ServerAnalytics = ReturnType<typeof createProjectAnalytics>;

/** Which agent-facing surface was read. Both are invisible to browser JS. */
export type AgentSurface = "catalog" | "markdown";

export interface EdgeAnalytics {
  /**
   * A read of a page variant no browser executes: the Markdown rendering of a
   * page, or the JSON catalog. Reported to the web project, alongside the
   * browser page views, so the site's whole audience lands in one place.
   */
  readonly reportAgentPageView: (
    path: string,
    surface: AgentSurface,
    identity: ClientIdentity,
    context: ExecutionContext
  ) => void;
  /** A handshake or discovery call, reported to the backend project. */
  readonly reportDiscovery: McpDiscoveryReporter;
  /** One settled tool call, reported to the backend project. */
  readonly reportToolCall: ToolCallReporter;
}

/**
 * Tracking is on only when a project has both halves of its credentials: the
 * public client id, inlined at build time, and the secret, uploaded as a
 * Worker secret. Either one missing means off — which is the state a
 * contributor's `pnpm dev` and CI both run in, and the reason neither needs a
 * key to build, test or serve the site.
 */
function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

export function hasOpenPanelCredentials(
  clientId: string | undefined,
  clientSecret: string | undefined
): boolean {
  return isSet(clientId) && isSet(clientSecret);
}

function openPanelProviders(
  clientId: string | undefined,
  clientSecret: string | undefined
) {
  // Constructed only when it can work: an OpenPanel client built with an empty
  // secret would authenticate as nobody and retry every rejected POST.
  return isSet(clientId) && isSet(clientSecret)
    ? [new OpenPanelServerProvider({ clientId, clientSecret })]
    : [];
}

function createProjectAnalytics(
  clientId: string | undefined,
  clientSecret: string | undefined
) {
  const providers = openPanelProviders(clientId, clientSecret);
  // No key pair, no provider, and `enabled: false` makes every call a
  // synchronous no-op instead of a rejected promise. This is the path a
  // contributor's `pnpm dev` and CI both take.
  return createServerAnalytics({
    enabled: providers.length > 0,
    events: stamppotEvents,
    providers,
  });
}

function logAnalyticsFailure(error: unknown): void {
  // Safe to log the message: this path only ever carries an operation name, an
  // outcome, a duration and a public route, so an OpenPanel error cannot echo
  // a tool argument back. Observability is on, so this reaches `wrangler tail`
  // rather than leaving a broken pipeline measuring nothing in silence.
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
      event: "analytics_report_failed",
    })
  );
}

/**
 * Hands the report to the runtime and returns immediately. Nothing a visitor
 * or an MCP client waits on may depend on OpenPanel being reachable: the
 * OpenPanel SDK retries a failed POST three times with backoff, which would
 * otherwise be added to a tool call's latency.
 */
function deliver(context: ExecutionContext, send: () => Promise<void>): void {
  try {
    context.waitUntil(send().catch(logAnalyticsFailure));
  } catch (error) {
    // `waitUntil` throws once the request context is gone.
    logAnalyticsFailure(error);
  }
}

/**
 * The Worker's analytics, bound to two separate OpenPanel projects: the web
 * project for the site, the backend project for MCP usage.
 *
 * Both instances are built on first use and then kept. They are never shut
 * down, and nothing is lost by that: trakoo's `shutdown()` clears identity
 * rather than flushing, and the OpenPanel SDK only buffers when `disabled` or
 * `waitForProfile` is set — neither of which applies here — so every `track()`
 * is its own POST, already held open by `waitUntil`.
 *
 * Neither instance ever calls `identify()` or passes a user: Stamppot is
 * authless, and an anonymous MCP has no profile to attach.
 */
export function createEdgeAnalytics(
  getBindings: () => CloudflareBindings
): EdgeAnalytics {
  let mcpProject: ServerAnalytics | undefined;
  let webProject: ServerAnalytics | undefined;

  const secrets = () =>
    getBindings() as CloudflareBindings & AnalyticsSecretBindings;

  const mcpAnalytics = (): ServerAnalytics => {
    mcpProject ??= createProjectAnalytics(
      import.meta.env.VITE_OPENPANEL_BACKEND_CLIENT_ID,
      secrets().OPENPANEL_BACKEND_API_KEY
    );
    return mcpProject;
  };

  const webAnalytics = (): ServerAnalytics => {
    webProject ??= createProjectAnalytics(
      import.meta.env.VITE_OPENPANEL_CLIENT_ID,
      secrets().OPENPANEL_API_KEY
    );
    return webProject;
  };

  return {
    reportAgentPageView(path, surface, identity, context) {
      deliver(context, () =>
        webAnalytics().pageView(
          {
            client: identity.client,
            clientVersion: identity.clientVersion,
            surface,
          },
          { context: { page: { path } } }
        )
      );
    },
    reportDiscovery(record, context) {
      deliver(context, () =>
        mcpAnalytics().track("mcp_client_connected", {
          client: record.client,
          clientVersion: record.clientVersion,
          mcp: record.mcp,
          method: record.method,
        })
      );
    },
    reportToolCall(record: ToolCallRecord, context) {
      // Spread into a fresh object: `track()` receives exactly the five fields
      // the registry declares, and nothing a future caller bolts onto the
      // record can ride along unnoticed.
      deliver(context, () =>
        mcpAnalytics().track("mcp_tool_called", {
          client: record.client,
          clientVersion: record.clientVersion,
          durationMs: record.durationMs,
          mcp: record.mcp,
          outcome: record.outcome,
          tool: record.tool,
          transport: record.transport,
        })
      );
    },
  };
}
