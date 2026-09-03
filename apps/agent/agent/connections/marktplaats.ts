import { defineMcpClientConnection } from "eve/connections";

const DEFAULT_MARKTPLAATS_MCP_URL = "https://stamppot.dev/mcp/marktplaats";

/**
 * Stamppot's Marktplaats MCP is authless, so no `auth` is attached. Point
 * `STAMPPOT_MCP_URL` at `http://localhost:5173/mcp/marktplaats` to run against
 * a local `pnpm dev` Worker instead of production.
 */
export default defineMcpClientConnection({
  description:
    "Dutch second-hand listings on Marktplaats: search listings by text, category, place and radius, price, condition and posting date, and read one listing in full.",
  url: process.env.STAMPPOT_MCP_URL ?? DEFAULT_MARKTPLAATS_MCP_URL,
});
