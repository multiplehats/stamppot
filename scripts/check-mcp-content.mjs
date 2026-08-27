import { loadMcpContent } from "./mcp-content.mjs";

const content = await loadMcpContent(process.cwd());
const packageCount = new Set(content.map((tool) => tool.mcpId)).size;
process.stdout.write(
  `Validated ${content.length} MCP tool content file(s) across ${packageCount} package(s).\n`
);
