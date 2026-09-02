import { defineAgent } from "eve";

/**
 * The model id is a Vercel AI Gateway route (`provider/model`). The gateway
 * key comes from `AI_GATEWAY_API_KEY` in the environment; nothing in this
 * package holds a credential.
 */
export default defineAgent({
  model: "anthropic/claude-sonnet-5",
});
