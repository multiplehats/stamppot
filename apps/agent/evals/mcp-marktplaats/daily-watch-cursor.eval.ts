import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { FIND_LISTINGS, INSTANT_PATTERN } from "./shared";

const POSTCODE_3511_PATTERN = /^3511/;
const NEW_SINCE_PATTERN = /new|since|nothing|no new/i;

/**
 * The daily-watch recipe: the tools keep no state, so the agent must carry
 * the previous `observedAt` forward as `postedSince` and keep its own memory
 * of which listings it already reported.
 */
export default defineEval({
  description:
    "Carries observedAt forward as postedSince on a follow-up check and reports only what is new.",
  tags: ["live", "watch"],
  async test(t) {
    await t.send(
      "Keep an eye out for a used Bosch dishwasher within 15 km of postcode 3511, up to 250 euros. Do a first check now."
    );
    t.calledTool(FIND_LISTINGS, {
      input: {
        location: { postcode: POSTCODE_3511_PATTERN, radiusKm: 15 },
        maxPriceEuro: (value: unknown) =>
          typeof value === "number" && value <= 250,
      },
    });

    const followUp = await t.send(
      "Check again: has anything new been posted since your last look?"
    );
    t.succeeded();
    followUp.calledTool(FIND_LISTINGS, {
      count: 1,
      input: {
        location: { postcode: POSTCODE_3511_PATTERN },
        postedSince: INSTANT_PATTERN,
      },
    });
    t.check(followUp.message, includes(NEW_SINCE_PATTERN));
    t.judge.autoevals
      .closedQA(
        "On the second check the assistant reports only listings posted since the first check, or says plainly that nothing new appeared, and does not repeat the first check's listings as if they were new.",
        { on: t.transcript }
      )
      .atLeast(0.7);
  },
});
