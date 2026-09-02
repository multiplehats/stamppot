import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { FIND_LISTINGS, GET_LISTING } from "./shared";

const ENSCHEDE_PATTERN = /enschede/i;
const MARKTPLAATS_LINK_PATTERN = /marktplaats\.nl/i;

/**
 * The founding scenario: a person wants a second-hand PS5 in good condition
 * near Enschede. The agent must translate that into one bounded search with a
 * place, a radius and the two "good condition" values, and report what it
 * found with prices and links.
 */
export default defineEval({
  description:
    "Turns a plain wish for a used PS5 near Enschede into one filtered search and reports the matches.",
  tags: ["live", "search"],
  async test(t) {
    await t.send(
      "I'm looking for a second-hand PlayStation 5 in good condition within 20 km of Enschede. What's out there right now?"
    );

    t.succeeded();
    t.calledTool(FIND_LISTINGS, {
      input: {
        conditions: (value: unknown) =>
          Array.isArray(value) &&
          value.length > 0 &&
          value.every((entry) => entry === "like_new" || entry === "used"),
        location: { place: ENSCHEDE_PATTERN, radiusKm: 20 },
      },
    });
    t.notCalledTool(GET_LISTING).soft();
    t.maxToolCalls(4);
    t.check(t.reply, includes(MARKTPLAATS_LINK_PATTERN));
    t.judge.autoevals
      .closedQA(
        "The reply lists concrete PlayStation 5 listings with a price, the kind of price (asking price or bid), the city or distance, and a link, or clearly says nothing matched. It does not invent listings.",
        { on: t.reply }
      )
      .atLeast(0.7);
  },
});
