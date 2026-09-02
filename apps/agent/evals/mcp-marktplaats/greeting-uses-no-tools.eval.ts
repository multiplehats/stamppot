import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

const HELP_TOPICS_PATTERN = /marktplaats|second-hand|listing/i;

/**
 * Every tool call costs a read against a source that permits only modest
 * personal use, so a greeting or a capability question must be answered
 * without touching Marktplaats.
 */
export default defineEval({
  description: "Answers a capability question without calling any tool.",
  tags: ["fast"],
  async test(t) {
    await t.send("Hi! What can you help me with?");

    t.succeeded();
    t.usedNoTools();
    t.check(t.reply, includes(HELP_TOPICS_PATTERN));
  },
});
