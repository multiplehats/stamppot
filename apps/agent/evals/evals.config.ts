import { defineEvalConfig } from "eve/evals";

/**
 * The judge routes through the Vercel AI Gateway like the agent itself, so
 * `AI_GATEWAY_API_KEY` covers both. Without a key the judge assertions are
 * reported as skipped rather than failing the run.
 */
export default defineEvalConfig({
  judge: { model: "anthropic/claude-sonnet-5" },
});
