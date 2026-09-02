import { defineEval } from "eve/evals";
import { FIND_LISTINGS } from "./shared";

const POSTCODE_7511_PATTERN = /^7511/;

/**
 * Marktplaats ignores a subcategory sent without its parent. When asked to
 * narrow a search, the agent has to copy both ids from the category
 * suggestions it already received instead of guessing them.
 */
export default defineEval({
  description:
    "Refines a broad search into the suggested category by copying id and parentId from categorySuggestions.",
  tags: ["live", "search", "category"],
  async test(t) {
    await t.send(
      "Search Marktplaats for 'ps5' around postcode 7511, radius 20 km, and tell me which categories the results fall into."
    );
    t.calledTool(FIND_LISTINGS, {
      input: { location: { postcode: POSTCODE_7511_PATTERN } },
    });

    const refined = await t.send(
      "Now narrow it down to the PlayStation 5 console category only and show me the newest five."
    );
    t.succeeded();
    refined.calledTool(FIND_LISTINGS, {
      input: {
        categoryId: (value: unknown) => typeof value === "number" && value > 0,
        limit: (value: unknown) => typeof value === "number" && value <= 5,
        parentCategoryId: (value: unknown) =>
          typeof value === "number" && value > 0,
      },
    });
    t.judge.autoevals
      .closedQA(
        "In the second answer the assistant applied a category filter taken from the earlier category suggestions rather than inventing category numbers, and it lists at most five listings.",
        { on: t.transcript }
      )
      .atLeast(0.7);
  },
});
