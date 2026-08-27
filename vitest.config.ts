import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { createMcpContentPlugin } from "./build/mcp-content-plugin.ts";

export default defineConfig(async () => ({
  plugins: [
    await createMcpContentPlugin(),
    cloudflareTest(() => ({
      wrangler: { configPath: "./apps/edge/wrangler.jsonc" },
    })),
  ],
  resolve: {
    alias: {
      // The Cloudflare test pool runs one module graph. Production build and
      // preview validate the separate RSC/SSR graphs; Worker route tests use
      // ordinary React SSR so they can stay inside this single graph.
      "./landing/render-page": fileURLToPath(
        new URL(
          "./apps/edge/src/landing/render-page.testing.tsx",
          import.meta.url
        )
      ),
    },
  },
}));
