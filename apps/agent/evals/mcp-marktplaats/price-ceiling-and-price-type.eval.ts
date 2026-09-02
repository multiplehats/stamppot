import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { FIND_LISTINGS } from "./shared";

const UTRECHT_PATTERN = /utrecht/i;
const SORT_PATTERN = /^(price_asc|newest|relevance)$/;
const EURO_PATTERN = /€|euro|eur/i;

/**
 * A budget must become a price filter, and the answer must not call a bid
 * amount an asking price. Bids dominate cheap electronics on Marktplaats, so
 * this checks that the agent surfaces the price type it was given.
 */
export default defineEval({
  description:
    "Applies a budget as maxPriceEuro and reports prices together with their price type.",
  tags: ["live", "search", "price"],
  async test(t) {
    await t.send(
      "What's the cheapest electric bike I can find around Utrecht for under 500 euros? Only ones that actually work, please."
    );

    t.succeeded();
    t.calledTool(FIND_LISTINGS, {
      input: {
        location: { place: UTRECHT_PATTERN },
        maxPriceEuro: (value: unknown) =>
          typeof value === "number" && value <= 500,
        sortBy: SORT_PATTERN,
      },
    });
    t.check(t.reply, includes(EURO_PATTERN));
    t.judge.autoevals
      .closedQA(
        "For each listing mentioned, the assistant makes clear whether the amount is a fixed asking price or a bid/starting amount (or that the price is on request, negotiable, free, or in the description), and it excluded or flagged listings marked as not working.",
        { on: t.reply }
      )
      .atLeast(0.7);
  },
});
