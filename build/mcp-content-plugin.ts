import type { Plugin } from "vite";
import { loadMcpContent } from "../scripts/mcp-content.mjs";

const PUBLIC_MODULE_ID = "virtual:stamppot-mcp-content";
const RESOLVED_MODULE_ID = `\0${PUBLIC_MODULE_ID}`;

export async function createMcpContentPlugin(): Promise<Plugin> {
  const content = await loadMcpContent(process.cwd());

  return {
    load(id) {
      if (id !== RESOLVED_MODULE_ID) {
        return undefined;
      }
      return `export default ${JSON.stringify(content)};`;
    },
    name: "stamppot-mcp-content",
    resolveId(id) {
      return id === PUBLIC_MODULE_ID ? RESOLVED_MODULE_ID : undefined;
    },
  };
}
