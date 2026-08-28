import { brandIconUrl } from "./parsew";

/**
 * How a target is installed, which decides what the copy button hands over and
 * what the card says to do with it. A command is pasted into a shell; a config
 * is pasted into a file, so its snippet is useless without the path.
 */
export type InstallKind = "command" | "config";

export interface InstallContext {
  /** The MCP endpoint to connect, combined (`/mcp`) or per-domain. */
  readonly endpoint: string;
  /** The name the server is registered under in the client's config. */
  readonly serverName: string;
}

interface InstallTarget {
  /** Registrable domain, used only to look the brand icon up through Parsew. */
  readonly domain: string;
  readonly id: string;
  readonly kind: InstallKind;
  readonly label: string;
  /** Where the snippet goes: a config path, or the shell it is typed into. */
  readonly location: string;
  readonly snippet: (context: InstallContext) => string;
}

/**
 * Every install target, in the order they appear in the picker. The first is
 * the default selection.
 *
 * Each snippet is transcribed from that client's own documentation rather than
 * inferred from the others, because the flag shapes genuinely disagree:
 * Claude Code and Gemini put the URL last as a positional, Codex and OpenClaw
 * take `--url`, and Windsurf is the only one that spells the field `serverUrl`.
 * The source is on each entry so the next person can re-check it.
 */
const TARGETS: readonly InstallTarget[] = [
  {
    // https://docs.claude.com/en/docs/claude-code/mcp
    domain: "claude.com",
    id: "claude-code",
    kind: "command",
    label: "Claude Code",
    location: "Terminal",
    snippet: ({ endpoint, serverName }) =>
      `claude mcp add --transport http ${serverName} ${endpoint}`,
  },
  {
    // https://developers.openai.com/codex/mcp
    domain: "openai.com",
    id: "codex",
    kind: "command",
    label: "Codex",
    location: "Terminal",
    snippet: ({ endpoint, serverName }) =>
      `codex mcp add ${serverName} --url ${endpoint}`,
  },
  {
    // https://cursor.com/docs/context/mcp
    domain: "cursor.com",
    id: "cursor",
    kind: "config",
    label: "Cursor",
    location: "~/.cursor/mcp.json",
    snippet: ({ endpoint, serverName }) =>
      jsonServers(serverName, { url: endpoint }),
  },
  {
    // https://code.visualstudio.com/docs/agent-customization/mcp-servers
    domain: "code.visualstudio.com",
    id: "vscode",
    kind: "command",
    label: "VS Code",
    location: "Terminal",
    snippet: ({ endpoint, serverName }) =>
      `code --add-mcp '${JSON.stringify({
        name: serverName,
        type: "http",
        url: endpoint,
      })}'`,
  },
  {
    // https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html
    domain: "gemini.google.com",
    id: "gemini-cli",
    kind: "command",
    label: "Gemini CLI",
    location: "Terminal",
    snippet: ({ endpoint, serverName }) =>
      `gemini mcp add --transport http ${serverName} ${endpoint}`,
  },
  {
    // https://docs.windsurf.com/windsurf/cascade/mcp
    domain: "windsurf.com",
    id: "windsurf",
    kind: "config",
    label: "Windsurf",
    location: "~/.codeium/windsurf/mcp_config.json",
    snippet: ({ endpoint, serverName }) =>
      jsonServers(serverName, { serverUrl: endpoint }),
  },
  {
    // https://docs.openclaw.ai/cli/mcp
    domain: "openclaw.ai",
    id: "openclaw",
    kind: "command",
    label: "OpenClaw",
    location: "Terminal",
    snippet: ({ endpoint, serverName }) =>
      `openclaw mcp add ${serverName} --url ${endpoint} --transport streamable-http`,
  },
  {
    // https://hermes-agent.ai/blog/hermes-mcp-integration-guide
    domain: "nousresearch.com",
    id: "hermes",
    kind: "command",
    label: "Hermes Agent",
    location: "Terminal",
    snippet: ({ endpoint, serverName }) =>
      `hermes mcp add ${serverName} --url ${endpoint}`,
  },
];

/** The `mcpServers` shape three of the clients share, differing only in the key. */
function jsonServers(
  serverName: string,
  entry: Record<string, string>
): string {
  return JSON.stringify({ mcpServers: { [serverName]: entry } }, null, 2);
}

/**
 * One install target resolved against a specific endpoint. Every field is a
 * plain string, so a server component can build the list and hand it straight
 * to a client component without `@parsew/sdk` reaching the browser bundle.
 */
export interface InstallSnippet {
  readonly id: string;
  readonly kind: InstallKind;
  readonly label: string;
  readonly location: string;
  /** First letter of the label, drawn when there is no icon to show. */
  readonly monogram: string;
  readonly snippet: string;
}

export interface InstallOption extends InstallSnippet {
  /** Absent when Parsew has no key configured, or rejected the domain. */
  readonly iconUrl?: string | undefined;
}

interface InstallOptionsInput extends InstallContext {
  /**
   * The surface the logo is drawn on, not the card behind it. Parsew returns a
   * near-white mark for `dark`, which disappears on a light surface — the
   * `Avatar` in `InstallCard` sits on HeroUI's `--default`, which is light in
   * the default theme, so every caller passes `light`. Follow that surface if
   * a dark theme is ever added.
   */
  readonly theme: "dark" | "light";
}

/**
 * Every target's snippet for one endpoint, with no icons attached. The Markdown
 * rendering of a page uses this, so it never pays for a Parsew lookup it cannot
 * display.
 */
export function installSnippets({
  endpoint,
  serverName,
}: InstallContext): readonly InstallSnippet[] {
  return TARGETS.map((target) => ({
    id: target.id,
    kind: target.kind,
    label: target.label,
    location: target.location,
    monogram: target.label.slice(0, 1),
    snippet: target.snippet({ endpoint, serverName }),
  }));
}

/** The same list with a brand icon per target, for the rendered pages. */
export function installOptions({
  theme,
  ...context
}: InstallOptionsInput): readonly InstallOption[] {
  return installSnippets(context).map((option, index) => ({
    ...option,
    iconUrl: brandIconUrl(TARGETS[index]?.domain ?? "", { theme }),
  }));
}
