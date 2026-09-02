import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { FIND_LISTINGS, GET_LISTING } from "./shared";

const INSPECT_IMAGES = "inspect-marktplaats-images";
const MARKTPLAATS_IMAGE_PATTERN =
  /^https:\/\/(?:images\.)?(?:www\.)?marktplaats\.(?:com|nl)\//i;
const VISUAL_ASSESSMENT_PATTERN =
  /photo|image|visible|scratch|crack|dent|damage|wear|cannot tell|can't tell/i;

export default defineEval({
  description:
    "Opens a real listing and inspects its photos before assessing scratches or other visible damage.",
  tags: ["live", "listing", "vision"],
  async test(t) {
    await t.send(
      "Find one used PlayStation 5 within 30 km of Enschede. Open the most promising listing, inspect its photos, and tell me whether you can see scratches, cracks, dents, discoloration, or other damage. Separate visual evidence from the seller's written claims and be honest about anything the photos cannot prove."
    );

    t.succeeded();
    t.calledTool(FIND_LISTINGS);
    t.calledTool(GET_LISTING);
    t.calledTool(INSPECT_IMAGES, {
      count: 1,
      input: {
        imageUrls: (value: unknown) =>
          Array.isArray(value) &&
          value.length >= 1 &&
          value.length <= 4 &&
          value.every(
            (url) =>
              typeof url === "string" && MARKTPLAATS_IMAGE_PATTERN.test(url)
          ),
      },
    });
    t.toolOrder([FIND_LISTINGS, GET_LISTING, INSPECT_IMAGES]);
    t.check(t.reply, includes(VISUAL_ASSESSMENT_PATTERN));
    t.judge.autoevals
      .closedQA(
        "The assistant bases scratch and damage observations on the listing photos it inspected, clearly separates visual observations from the seller's written claims, avoids claiming that unseen areas or functionality were verified, and states uncertainty when the photos are insufficient.",
        { on: t.transcript }
      )
      .atLeast(0.8);
  },
});
