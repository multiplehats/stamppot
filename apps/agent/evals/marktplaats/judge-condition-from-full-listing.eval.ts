import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { FIND_LISTINGS, GET_LISTING, LISTING_ID_PATTERN } from "./shared";

const CONDITION_WORDS_PATTERN = /condition|new|used|working|scratch/i;

/**
 * A search summary is truncated, so judging condition requires reading the
 * full listing. The agent must open the listing it found rather than answer
 * from the snippet, and it must quote the description and attributes.
 */
export default defineEval({
  description:
    "Opens a found listing in full before judging its condition and pickup options.",
  tags: ["live", "listing"],
  async test(t) {
    await t.send(
      "Find me one used or like-new PS5 within 30 km of Enschede, then open that listing and tell me honestly what condition it's in, what's included, and whether I can pick it up."
    );

    t.succeeded();
    t.calledTool(FIND_LISTINGS);
    t.calledTool(GET_LISTING, {
      count: (count) => count >= 1 && count <= 3,
      input: { id: LISTING_ID_PATTERN },
    });
    t.toolOrder([FIND_LISTINGS, GET_LISTING]);
    t.check(t.reply, includes(CONDITION_WORDS_PATTERN));
    t.judge.autoevals
      .closedQA(
        "The assistant's assessment of condition, contents and pickup is grounded in the listing's full description and attribute table (for example the declared condition and delivery options), states the price together with whether it is an asking price or a bid, and includes the listing link. It does not add facts that are not in the listing.",
        { on: t.transcript }
      )
      .atLeast(0.7);
  },
});
