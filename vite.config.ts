import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";
import { createMcpContentPlugin } from "./build/mcp-content-plugin.ts";

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
