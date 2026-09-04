import type { ReactNode } from "react";
import { REPO_URL } from "./urls";

/**
 * GitHub's mark as inline SVG rather than an <img>, so it inherits the button's
 * colour through `currentColor` and costs no extra request. The upstream file
 * draws a 16-unit path scaled by 64 into a 1024 viewport; the transform is
 * dropped and the viewBox brought back to the path's own coordinates.
 */
export function GitHubMark(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      fill="currentColor"
      focusable="false"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        clipRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"
        fillRule="evenodd"
      />
    </svg>
  );
}

/** `multiplehats/stamppot` — the API path, derived rather than restated. */
const REPO_SLUG = new URL(REPO_URL).pathname.slice(1);

const STARS_CACHE_SECONDS = 3600;
const STARS_TIMEOUT_MS = 1500;
const THOUSAND = 1000;

/** `1234` reads as `1,2k`; Dutch takes a comma for the decimal separator. */
export function formatStars(stars: number): string {
  if (stars < THOUSAND) {
    return String(stars);
  }
  return `${(stars / THOUSAND).toFixed(1).replace(".", ",")}k`;
}

/**
 * The count beside a GitHub link, or nothing.
 *
 * Nothing covers two cases that should look the same: GitHub did not answer,
 * and the answer was zero. A badge reading "0" is a decoration that argues
 * against the thing it decorates, so it is left off until there is a number
 * worth showing.
 */
export function StarCount({
  stars,
}: {
  readonly stars: number | undefined;
}): ReactNode {
  if (stars === undefined || stars === 0) {
    return null;
  }
  return (
    <span className="font-mono text-muted text-xs tabular-nums">
      {formatStars(stars)}
    </span>
  );
}

/**
 * The repository's star count, or `undefined`.
 *
 * A decoration must never be able to break the page it decorates, so every
 * failure path — a timeout, a rate limit, an unparseable body, no network at
 * all in a test — collapses to `undefined` and the button simply renders
 * without a count. The response is cached for an hour at the edge, because a
 * star count that is sixty minutes stale is indistinguishable from a fresh one.
 */
export async function fetchGitHubStars(): Promise<number | undefined> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO_SLUG}`, {
      cf: { cacheEverything: true, cacheTtl: STARS_CACHE_SECONDS },
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "stamppot.dev",
      },
      signal: AbortSignal.timeout(STARS_TIMEOUT_MS),
    } as RequestInit);
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as { stargazers_count?: unknown };
    const stars = body.stargazers_count;
    return typeof stars === "number" && Number.isFinite(stars)
      ? stars
      : undefined;
  } catch {
    return undefined;
  }
}
