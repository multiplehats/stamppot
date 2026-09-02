import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";
import { createMcpContentPlugin } from "./build/mcp-content-plugin.ts";

// Wrangler builds the Worker's `env` by reading .env files off disk, which here hold
// ciphertext. Stop it: .dev.vars (written by scripts/write-dev-vars.mjs) supplies the
// real values instead, and a name with nothing behind it should be absent rather than
// silently bound to an "encrypted:..." string.
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV ??= "false";

export default defineConfig(async () => ({
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            index: "./apps/edge/src/landing/entry.browser.tsx",
          },
        },
      },
    },
    rsc: {
      build: {
        outDir: "./dist/stamppot",
      },
    },
    ssr: {
      build: {
        outDir: "./dist/stamppot/ssr",
        rollupOptions: {
          input: {
            index: "./apps/edge/src/landing/entry.ssr.tsx",
          },
        },
      },
    },
  },
  plugins: [
    await createMcpContentPlugin(),
    tailwindcss(),
    react(),
    rsc(),
    cloudflare({
      configPath: "./apps/edge/wrangler.jsonc",
      viteEnvironment: {
        childEnvironments: ["ssr"],
        name: "rsc",
      },
    }),
  ],
  publicDir: "apps/edge/public",
}));
