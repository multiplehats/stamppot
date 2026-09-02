import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { createMcpContentPlugin } from "./build/mcp-content-plugin.ts";

// Wrangler builds the Worker's `env` by reading .env files off disk, which here hold
// ciphertext. Stop it: .dev.vars (written by scripts/write-dev-vars.mjs) supplies the
// real values instead, and a name with nothing behind it should be absent rather than
// silently bound to an "encrypted:..." string.
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV ??= "false";

export default defineConfig(async () => ({
  plugins: [
    await createMcpContentPlugin(),
    cloudflareTest(() => ({
      // These are Worker secrets, so they are absent from the Wrangler
      // configuration and would otherwise come from a contributor's decrypted
      // .dev.vars. The NS key gets a fixed value and tests never reach NS; the
      // OpenPanel keys are blanked so that a test run can never write to a
      // real analytics project, whatever client ids happen to be in the
      // environment (notably under `pnpm check:ci`).
      miniflare: {
        bindings: {
          NS_API_KEY: "test-ns-key",
          OPENPANEL_API_KEY: "",
          OPENPANEL_BACKEND_API_KEY: "",
        },
      },
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
      "./style-assets": fileURLToPath(
        new URL(
          "./apps/edge/src/landing/style-assets.testing.tsx",
          import.meta.url
        )
      ),
    },
  },
}));
