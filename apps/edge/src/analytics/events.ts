import type { ToolCallOutcome, ToolCallTransport } from "@stamppot/core";
import { defineEvents, typed } from "trakoo";

/**
 * The one event registry, shared by every analytics instance.
 *
 * Environment-neutral on purpose: it imports nothing from `trakoo/client`,
 * `trakoo/server` or an OpenPanel SDK, so a server component and the browser
 * bundle can both reach it without dragging the other environment along.
 *
 * The instances that consume it are split by destination, not by event:
 * `client.ts` and the web half of `server.ts` report to the web OpenPanel
 * project, the MCP half of `server.ts` to the backend one.
 */
export const stamppotEvents = defineEvents({
  installSnippetCopied: {
    category: "conversion",
    name: "install_snippet_copied",
    // Not `page`: OpenPanel's property builder injects the page context under
    // that name after the event's own properties, silently overwriting it.
    properties: typed<{
      /** The install target's id, e.g. "claude-code". Never free text. */
      client: string;
      placement: "landing" | "tool";
    }>(),
  },
  mcpClientConnected: {
    category: "mcp",
    name: "mcp_client_connected",
    // A harness reaching the endpoint without calling a tool. Separates
    // "installed us" from "uses us"; without it the former is invisible.
    properties: typed<{
      client: string;
      clientVersion: string;
      mcp: string;
      /** A closed set of JSON-RPC methods, never free text. */
      method: string;
    }>(),
  },
  mcpToolCalled: {
    category: "mcp",
    name: "mcp_tool_called",
    // One event for every tool, with the tool as a property. Per-tool event
    // names would make every new operation a schema change in OpenPanel.
    //
    // This shape is the whole payload: SECURITY.md forbids tool arguments in
    // analytics, so there is deliberately nowhere here to put one.
    properties: typed<{
      /** The calling harness, e.g. "claude-code". Self-reported, never verified. */
      client: string;
      clientVersion: string;
      durationMs: number;
      mcp: string;
      outcome: ToolCallOutcome;
      tool: string;
      transport: ToolCallTransport;
    }>(),
  },
});
