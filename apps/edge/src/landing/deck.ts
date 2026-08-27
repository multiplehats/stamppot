/**
 * Every MCP is a playing card, and every card needs a face. A suit is derived
 * from the MCP id alone, so the landing page and each of that MCP's tool pages
 * reach the same colour without sharing a lookup table that could drift.
 *
 * Each suit pairs a face fill with an accent that is legible on it. Accents are
 * never used as text on the felt or on a white section — only as ink on their
 * own face, as a badge fill, or as a 2px outline — because antique gold on
 * white and royal violet on black both fall below the contrast floor.
 */
export interface DeckSuit {
  /**
   * Full Tailwind class strings. Tailwind reads source files statically, so a
   * class assembled by interpolation would never reach the stylesheet.
   */
  readonly badgeFill: string;
  readonly badgeText: string;
  readonly face: string;
  readonly faceText: string;
  readonly outline: string;
}

/**
 * Order is load-bearing: it is what decides which MCP gets which accent. The
 * three MCPs named in DESIGN.md land on their documented accents under the hash
 * below — calendar on signal red, transit on royal violet, groceries on
 * antique gold. The last three suits are headroom; they carry felt ink so any
 * future face stays legible without re-checking contrast.
 */
const SUITS: readonly DeckSuit[] = [
  {
    badgeFill: "bg-antique-gold",
    badgeText: "text-felt",
    face: "bg-cobalt",
    faceText: "text-antique-gold",
    outline: "shadow-[inset_0_0_0_2px_var(--color-antique-gold)]",
  },
  {
    badgeFill: "bg-signal-red",
    badgeText: "text-card",
    face: "bg-lemon",
    faceText: "text-signal-red",
    outline: "shadow-[inset_0_0_0_2px_var(--color-signal-red)]",
  },
  {
    badgeFill: "bg-royal-violet",
    badgeText: "text-card",
    face: "bg-lavender",
    faceText: "text-royal-violet",
    outline: "shadow-[inset_0_0_0_2px_var(--color-royal-violet)]",
  },
  {
    badgeFill: "bg-signal-red",
    badgeText: "text-card",
    face: "bg-sky",
    faceText: "text-felt",
    outline: "shadow-[inset_0_0_0_2px_var(--color-signal-red)]",
  },
  {
    badgeFill: "bg-royal-violet",
    badgeText: "text-card",
    face: "bg-mint",
    faceText: "text-felt",
    outline: "shadow-[inset_0_0_0_2px_var(--color-royal-violet)]",
  },
  {
    badgeFill: "bg-antique-gold",
    badgeText: "text-felt",
    face: "bg-bubblegum",
    faceText: "text-felt",
    outline: "shadow-[inset_0_0_0_2px_var(--color-antique-gold)]",
  },
];

/**
 * djb2, chosen over FNV-1a because it separates the known MCP ids cleanly.
 * The modulo keeps the accumulator in unsigned 32-bit range without a bitwise
 * operator; every intermediate stays far below Number.MAX_SAFE_INTEGER, so the
 * arithmetic is exact.
 */
const HASH_SEED = 5381;
const HASH_MULTIPLIER = 33;
const UINT32 = 4_294_967_296;

function suitIndex(mcpId: string): number {
  let hash = HASH_SEED;
  for (const character of mcpId) {
    hash = (hash * HASH_MULTIPLIER + character.charCodeAt(0)) % UINT32;
  }
  return hash % SUITS.length;
}

/** The card face, accent and badge for an MCP. Stable for the life of the id. */
export function deckSuit(mcpId: string): DeckSuit {
  const suit = SUITS[suitIndex(mcpId)];
  if (suit === undefined) {
    throw new Error(`No deck suit for MCP: ${mcpId}`);
  }
  return suit;
}

/** `calendar` becomes `MCP-CALENDAR`, the badge worn by every card it fronts. */
export function mcpBadge(mcpId: string): string {
  return `MCP-${mcpId.toUpperCase()}`;
}
