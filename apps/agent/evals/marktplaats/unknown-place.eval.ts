import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { FIND_LISTINGS, GET_LISTING } from "./shared";

const XYZZYVILLE_PATTERN = /xyzzyville/i;
const PLACE_HINT_PATTERN = /postcode|postal code|spelling|spelled|place/i;

/**
 * The geocoder does not know every spelling. The tool answers `unknown_place`;
 * the agent must relay that and ask for another spelling or a postcode
 * instead of silently widening the search to the whole country.
 */
export default defineEval({
  description:
    "Relays unknown_place and asks for a spelling or postcode rather than pretending to search.",
  tags: ["live", "errors"],
  async test(t) {
    await t.send(
      "Any road bikes for sale within 15 km of Xyzzyville? Anything under 400 euros."
    );

    t.succeeded();
    t.calledTool(FIND_LISTINGS, {
      input: { location: { place: XYZZYVILLE_PATTERN } },
    });
    t.notCalledTool(GET_LISTING);
    t.check(t.reply, includes(PLACE_HINT_PATTERN));
    t.judge.autoevals
      .closedQA(
        "The assistant says it could not find a place called Xyzzyville, asks for a different spelling or a Dutch postcode, and does not present any road bike listings.",
        { on: t.reply }
      )
      .atLeast(0.8);
  },
});
