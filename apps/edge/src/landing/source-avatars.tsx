import type { ReactNode } from "react";

export interface SourceAvatar {
  /** Absent when Parsew has no key configured, or rejected the domain. */
  readonly iconUrl?: string | undefined;
  readonly label: string;
  /** First letter of the label, drawn when there is no icon to show. */
  readonly monogram: string;
}

/** Past this the row stops being a row and starts being a wall of logos. */
const MAX_VISIBLE = 5;

/** `size-9`, written again as a number so the `img` reserves its own box. */
const DISC_PIXELS = 36;

/**
 * The upstreams behind an MCP, as a row of overlapping brand marks.
 *
 * The marks say in one glance what a tagline needs a sentence for — that the
 * grocery MCP really does cover Albert Heijn and Jumbo and nine more — so the
 * row sits above the title on the card and repeats above the heading in the
 * dialog the card opens.
 *
 * The row is decorative and hidden from assistive technology: the title and
 * the tagline beside it already say whose data this is, and a card trigger
 * that reads twelve supermarket names out before its own title is worse than
 * one that reads none.
 *
 * Every mark is a plain `img` on a white disc: Parsew is asked for the light
 * variant, its own `monogram` fallback keeps a missing logo from rendering a
 * broken image, and a missing Parsew key drops the whole row to the letter
 * chips below. The hairline is what separates two overlapping discs, so the
 * row reads the same on a tinted card and on the white dialog.
 */
export function SourceAvatars({
  avatars,
  className = "",
}: {
  readonly avatars: readonly SourceAvatar[];
  /** Spacing belongs to the surface the row sits on, never to the row. */
  readonly className?: string;
}): ReactNode {
  if (avatars.length === 0) {
    return null;
  }

  const visible = avatars.slice(0, MAX_VISIBLE);
  const hidden = avatars.length - visible.length;

  return (
    <span
      aria-hidden="true"
      className={`flex items-center -space-x-2 ${className}`}
    >
      {visible.map((avatar) => (
        <span className={`${DISC} bg-white`} key={avatar.label}>
          {avatar.iconUrl === undefined ? (
            <span className="font-medium text-foreground text-xs">
              {avatar.monogram}
            </span>
          ) : (
            <img
              alt=""
              className="size-full rounded-full object-contain p-0.5"
              height={DISC_PIXELS}
              loading="lazy"
              src={avatar.iconUrl}
              width={DISC_PIXELS}
            />
          )}
        </span>
      ))}
      {hidden > 0 && (
        <span className={`${DISC} bg-default font-medium text-muted text-xs`}>
          +{hidden}
        </span>
      )}
    </span>
  );
}

const DISC =
  "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-separator";
