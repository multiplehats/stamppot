import { z } from "zod";
import { MAX_ATTRIBUTES, MAX_DESCRIPTION_CHARACTERS } from "./contracts";

const WINDOW_CONFIG_MARKER = "window.__CONFIG__";
const MAX_CONFIG_SCAN_CHARACTERS = 1024 * 1024;
const MAX_DOM_NODES = 400;
const MAX_ENTITY_CODE_POINT = 0x10_ff_ff;
const DESCRIPTION_SELECTOR = '[data-collapsable="description"]';
const ATTRIBUTE_LABEL_SELECTOR = '[class*="Attributes-module-label"]';
const ATTRIBUTE_VALUE_SELECTOR = '[class*="Attributes-module-value"]';
const JSON_LD_SCRIPT_PATTERN =
  /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
const ENTITY_PATTERN = /&(?:#x([0-9a-fA-F]{1,6})|#(\d{1,7})|([a-zA-Z]+));/g;
const HORIZONTAL_WHITESPACE_PATTERN = /[^\S\n]+/g;
const EXCESS_NEWLINE_PATTERN = /\n{3,}/g;
const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", '"'],
]);

/** Present-or-absent passthrough: every upstream field is read defensively. */
const jsonLdNodeSchema = z
  .object({
    "@type": z.unknown().optional(),
    description: z.unknown().optional(),
  })
  .loose();

export interface ListingAttribute {
  readonly label: string;
  readonly value: string;
}

export interface ListingDom {
  readonly attributes: ListingAttribute[];
  readonly description?: string;
}

interface DomTextNode {
  readonly kind: "label" | "value";
  readonly parts: string[];
}

/** The small, bounded entity set a Marktplaats description actually uses. */
export function decodeHtmlEntities(value: string): string {
  return value.replace(
    ENTITY_PATTERN,
    (match, hex: string | undefined, decimal: string | undefined, name) => {
      if (hex !== undefined) {
        const codePoint = Number.parseInt(hex, 16);
        return codePoint > 0 && codePoint <= MAX_ENTITY_CODE_POINT
          ? String.fromCodePoint(codePoint)
          : match;
      }
      if (decimal !== undefined) {
        const codePoint = Number.parseInt(decimal, 10);
        return codePoint > 0 && codePoint <= MAX_ENTITY_CODE_POINT
          ? String.fromCodePoint(codePoint)
          : match;
      }
      return NAMED_ENTITIES.get(String(name)) ?? match;
    }
  );
}

function normalizeDescription(value: string): string {
  return decodeHtmlEntities(value)
    .replace(HORIZONTAL_WHITESPACE_PATTERN, " ")
    .replace(EXCESS_NEWLINE_PATTERN, "\n\n")
    .trim()
    .slice(0, MAX_DESCRIPTION_CHARACTERS);
}

function normalizeAttributeText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(HORIZONTAL_WHITESPACE_PATTERN, " ")
    .replace(EXCESS_NEWLINE_PATTERN, " ")
    .trim();
}

interface StringScanState {
  readonly inString: boolean;
  readonly isEscaped: boolean;
}

function nextStringState(
  character: string | undefined,
  isEscaped: boolean
): StringScanState {
  if (isEscaped) {
    return { inString: true, isEscaped: false };
  }
  if (character === "\\") {
    return { inString: true, isEscaped: true };
  }
  return { inString: character !== '"', isEscaped: false };
}

/** Index of the `}` closing the object that opens at `openIndex`. */
function balancedObjectEnd(
  source: string,
  openIndex: number,
  scanEnd: number
): number | undefined {
  let depth = 0;
  let state: StringScanState = { inString: false, isEscaped: false };
  let index = openIndex;
  while (index < scanEnd) {
    const character = source[index];
    if (state.inString) {
      state = nextStringState(character, state.isEscaped);
    } else if (character === '"') {
      state = { inString: true, isEscaped: false };
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
    index += 1;
  }
  return undefined;
}

/**
 * Reads the balanced `{…}` after the `window.__CONFIG__` assignment. The page
 * puts several `window.X = {…};` statements in one script and the object holds
 * braces and escaped quotes inside strings, so the scan tracks string state
 * rather than counting braces alone.
 */
export function extractWindowConfig(html: string): unknown {
  const markerIndex = html.indexOf(WINDOW_CONFIG_MARKER);
  if (markerIndex < 0) {
    return;
  }
  const openIndex = html.indexOf("{", markerIndex);
  if (openIndex < 0) {
    return;
  }
  const closeIndex = balancedObjectEnd(
    html,
    openIndex,
    Math.min(html.length, openIndex + MAX_CONFIG_SCAN_CHARACTERS)
  );
  if (closeIndex === undefined) {
    return;
  }
  try {
    return JSON.parse(html.slice(openIndex, closeIndex + 1));
  } catch {
    // A page whose config is not valid JSON is treated as no config at all.
  }
}

function pushText(
  nodes: DomTextNode[],
  kind: DomTextNode["kind"],
  text: string
) {
  const current = nodes.at(-1);
  if (current !== undefined && current.kind === kind) {
    current.parts.push(text);
  }
}

function pairAttributes(nodes: readonly DomTextNode[]): ListingAttribute[] {
  const attributes: ListingAttribute[] = [];
  for (const [index, node] of nodes.entries()) {
    if (node.kind !== "label" || attributes.length >= MAX_ATTRIBUTES) {
      continue;
    }
    const next = nodes[index + 1];
    if (next === undefined || next.kind !== "value") {
      continue;
    }
    const label = normalizeAttributeText(node.parts.join(""));
    const value = normalizeAttributeText(next.parts.join(""));
    if (label !== "" && value !== "") {
      attributes.push({ label, value });
    }
  }
  return attributes;
}

/**
 * The full description and the attribute table live only in the DOM, so they
 * are streamed out with the runtime's own parser rather than a regex. `br` and
 * `p` start tags contribute the line breaks the text chunks do not carry.
 */
export async function extractListingDom(html: string): Promise<ListingDom> {
  const descriptionParts: string[] = [];
  const attributeNodes: DomTextNode[] = [];

  // biome-ignore lint/correctness/noUndeclaredVariables: HTMLRewriter is a Workers runtime global.
  const rewritten = new HTMLRewriter()
    .on(DESCRIPTION_SELECTOR, {
      text(chunk) {
        if (descriptionParts.length < MAX_DOM_NODES) {
          descriptionParts.push(chunk.text);
        }
      },
    })
    .on(`${DESCRIPTION_SELECTOR} br`, {
      element() {
        descriptionParts.push("\n");
      },
    })
    .on(`${DESCRIPTION_SELECTOR} p`, {
      element() {
        descriptionParts.push("\n");
      },
    })
    .on(ATTRIBUTE_LABEL_SELECTOR, {
      element() {
        if (attributeNodes.length < MAX_DOM_NODES) {
          attributeNodes.push({ kind: "label", parts: [] });
        }
      },
      text(chunk) {
        pushText(attributeNodes, "label", chunk.text);
      },
    })
    .on(ATTRIBUTE_VALUE_SELECTOR, {
      element() {
        if (attributeNodes.length < MAX_DOM_NODES) {
          attributeNodes.push({ kind: "value", parts: [] });
        }
      },
      text(chunk) {
        pushText(attributeNodes, "value", chunk.text);
      },
    })
    .transform(new Response(html));
  await rewritten.text();

  const description = normalizeDescription(descriptionParts.join(""));
  return {
    attributes: pairAttributes(attributeNodes),
    ...(description === "" ? {} : { description }),
  };
}

function productDescription(value: unknown): string | undefined {
  const parsed = jsonLdNodeSchema.safeParse(value);
  if (!parsed.success || parsed.data["@type"] !== "Product") {
    return;
  }
  const { description } = parsed.data;
  return typeof description === "string" && description.trim() !== ""
    ? description.trim()
    : undefined;
}

/**
 * The JSON-LD `Product` block carries a shortened description. It is the
 * fallback when the DOM yields nothing, and the caller marks it as truncated.
 */
export function extractJsonLdDescription(html: string): string | undefined {
  for (const match of html.matchAll(JSON_LD_SCRIPT_PATTERN)) {
    const [, source] = match;
    if (source === undefined) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const candidate of candidates) {
      const description = productDescription(candidate);
      if (description !== undefined) {
        return decodeHtmlEntities(description).slice(
          0,
          MAX_DESCRIPTION_CHARACTERS
        );
      }
    }
  }
}
