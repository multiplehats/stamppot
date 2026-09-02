import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { FIND_LISTINGS } from "./shared";

const POSTCODE_7511AB_PATTERN = /^7511\s?AB$/i;
const DISTANCE_PATTERN = /km/i;

/**
 * A postcode the user already has must go straight into the search without a
 * place lookup, keeping the radius they asked for. The reply must carry
 * distances, which only exist when a location was applied.
 */
export default defineEval({
  description:
    "Uses a supplied Dutch postcode and radius directly and reports distances.",
  tags: ["live", "search", "location"],
  async test(t) {
    await t.send(
      "Show me solid wood dining tables within 10 km of 7511 AB, newest first, five results max."
    );

    t.succeeded();
    t.calledTool(FIND_LISTINGS, {
      count: 1,
      input: {
        limit: (value: unknown) => typeof value === "number" && value <= 5,
        location: {
          postcode: POSTCODE_7511AB_PATTERN,
          radiusKm: 10,
        },
        sortBy: "newest",
      },
    });
    t.check(t.reply, includes(DISTANCE_PATTERN));
    t.judge.autoevals
      .closedQA(
        "The assistant lists at most five dining tables, each with a price and its price type, a distance in kilometres, and a link, or clearly says nothing matched.",
        { on: t.reply }
      )
      .atLeast(0.7);
  },
});
