import { ParsewBrands } from "@parsew/sdk/client";

/**
 * Parsew publishable key, used to draw each install target's brand icon.
 *
 * Publishable keys start with `pk_` and only authorise image reads, so this one
 * is safe to keep in source and safe to serve inside the rendered HTML. Paste
 * the key between the quotes to turn icons on.
 *
 * While it is empty no client is constructed and no request is made: every
 * install option falls back to the monogram chip drawn by `InstallCard`. That
 * is the deliberate default, because `new ParsewBrands({ token: "" })` throws.
 */
export const PARSEW_PUBLISHABLE_KEY =
  "pk_boSOdIVboBZPacHdexwwNiTOiZKGsjWoQEyGeXLVKWqCgKomliJcxkkJiVYZFYqF";

/** Matches the 64px icon slot in `InstallCard`, doubled for retina screens. */
const ICON_SIZE = 64;

interface BrandIconOptions {
  /** The chip the icon is drawn on, so Parsew returns the legible variant. */
  readonly theme: "dark" | "light";
}

function createClient(): ParsewBrands | undefined {
  if (PARSEW_PUBLISHABLE_KEY.trim() === "") {
    return;
  }

  try {
    return new ParsewBrands({ token: PARSEW_PUBLISHABLE_KEY });
  } catch {
    // A malformed key must not take the whole page down with it. Falling
    // through to `undefined` routes every option to its monogram instead.
  }
}

/** One client per Worker isolate, matching how the operation registry is built. */
const brands = createClient();

/**
 * The icon URL for a brand, or `undefined` when Parsew cannot serve one.
 *
 * Every failure mode collapses to `undefined` rather than throwing: no key
 * configured, a malformed key, or a domain Parsew rejects. Callers render the
 * monogram fallback instead, so a bad entry costs an icon and nothing more.
 */
export function brandIconUrl(
  domain: string,
  { theme }: BrandIconOptions
): string | undefined {
  if (brands === undefined) {
    return;
  }

  try {
    return brands.url(domain, {
      fallback: "monogram",
      format: "webp",
      retina: true,
      size: ICON_SIZE,
      theme,
    });
  } catch {
    // Parsew rejects domains it cannot parse. That costs one icon, not a render.
  }
}
