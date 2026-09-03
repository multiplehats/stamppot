---
"@stamppot/core": minor
"@stamppot/edge": minor
"@stamppot/http-adapter": minor
"@stamppot/mcp-adapter": minor
---

Measure the site and MCP usage with trakoo and OpenPanel, across two separate projects. The browser reports page views and install-snippet copies to the web project, the Worker reports one `mcp_tool_called` event per settled tool call — over both the MCP and the `/v1/tools` HTTP transport — to the backend project, and it reports reads of the Markdown and JSON catalog surfaces that browser JavaScript never sees.

Each `mcp_tool_called` event also names the calling harness and its version — `claude-code` and `2.1.258`, say — read from the MCP client-info envelope that modern clients repeat on every request, falling back to the `User-Agent` for 2025-era clients and plain HTTP callers. Those labels are self-reported and never verified, so they are lowercased, stripped to a conservative charset and truncated before being recorded.

A second event, `mcp_client_connected`, reports the handshake and discovery calls — `initialize`, `server/discover` and `tools/list` — so a harness that installs Stamppot without ever calling a tool is still counted. Chatty methods are deliberately excluded. The agent-facing page views carry the calling harness too.

Beyond that, MCP events carry only the MCP id, the tool name, the transport, an outcome and a duration. Tool arguments, error messages, request context and user identity are all excluded by construction, as `SECURITY.md` requires, and a test asserts the exact property set that reaches OpenPanel. Every report is delivered through `waitUntil`, so no visitor or MCP client ever waits on analytics.

Both projects stay off unless both halves of their credentials are present — the build-time client id and the Worker secret — so `pnpm dev`, CI and a contributor without decryption keys all build, test and serve the site with tracking disabled. The test Worker blanks both secrets outright, so no test run can write to a live project.
