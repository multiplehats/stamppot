import { buttonVariants, cardVariants } from "@heroui/styles";
import type { ReactNode } from "react";
import { GitHubMark, StarCount } from "./github";
import { STATIC_PAGES } from "./pages";
import { StyleAssets } from "./style-assets";
import { REPO_URL } from "./urls";

/**
 * JSON-LD inside a `<script>` is HTML, not JavaScript: an unescaped `<` would
 * let a string in the payload close the tag early. Escaping it keeps the
 * document well-formed whatever the registry happens to contain.
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

/**
 * HeroUI's own component classes, resolved once. `@heroui/styles` is a pure
 * styling package — no React, no react-aria — so a server component may call
 * these directly and ship a HeroUI-shaped page with no client JavaScript.
 * Interactive parts (`install-card.tsx`) use the real components instead.
 */
export const card = cardVariants();

/** A HeroUI button, worn by an anchor. `.button` styles hover and focus with
 *  plain CSS selectors, so a link needs no behaviour to look like a button. */
export function buttonClass(
  variant: "ghost" | "outline" | "primary" | "secondary" | "tertiary",
  size: "lg" | "md" | "sm" = "md"
): string {
  return buttonVariants({ size, variant });
}

/** The page column. Every section is the same width and the same gutter. */
export const CONTAINER = "mx-auto w-full max-w-5xl px-6";

interface SiteDocumentProps {
  readonly children: ReactNode;
  readonly description: string;
  readonly head?: ReactNode;
  readonly title: string;
}

export function SiteDocument({
  children,
  description,
  head,
  title,
}: SiteDocumentProps): ReactNode {
  return (
    <html className="scroll-smooth" lang="nl">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <meta content={description} name="description" />
        <title>{title}</title>
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
        {head}
        <StyleAssets />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}

/** A page band. `muted` lifts a section off the page background. */
export function Section({
  children,
  className = "",
  id,
  muted = false,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly id?: string;
  readonly muted?: boolean;
}): ReactNode {
  return (
    <section
      className={`py-20 ${muted ? "bg-background-secondary" : ""} ${className}`}
      id={id}
    >
      <div className={CONTAINER}>{children}</div>
    </section>
  );
}

/** The section opener: a muted eyebrow over a heading, optionally centred. */
export function SectionHeading({
  centered = false,
  children,
  eyebrow,
}: {
  readonly centered?: boolean;
  readonly children: ReactNode;
  readonly eyebrow: string;
}): ReactNode {
  return (
    <div className={centered ? "text-center" : ""}>
      <p className="font-medium text-muted text-sm">{eyebrow}</p>
      <h2 className="mt-3 text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
        {children}
      </h2>
    </div>
  );
}

/**
 * Both pages wear the same bar. Only the deep links differ: the landing page
 * scrolls to its own list of MCPs, a tool page goes back out to it.
 */
const NAV_LINKS = {
  landing: [
    { href: "#mcps", label: "Tools" },
    { href: "/v1/mcps", label: "JSON" },
  ],
  tool: [
    { href: "/#mcps", label: "Alle tools" },
    { href: "/v1/tools", label: "JSON" },
  ],
} as const;

export function SiteNavigation({
  page,
  stars,
}: {
  readonly page: "landing" | "tool";
  /** The repository's star count, when the page bothered to look it up. */
  readonly stars?: number | undefined;
}): ReactNode {
  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="sticky top-0 z-30 border-border border-b bg-background/80 backdrop-blur"
    >
      <div className={`${CONTAINER} flex h-16 items-center justify-between`}>
        <a
          className="font-semibold text-lg tracking-tight no-underline"
          href="/"
        >
          Stamppot
        </a>
        <div className="flex items-center gap-1">
          {NAV_LINKS[page].map((link) => (
            <a
              className={buttonClass("ghost", "sm")}
              href={link.href}
              key={link.label}
            >
              {link.label}
            </a>
          ))}
          <a
            className={`${buttonClass("secondary", "sm")} gap-2`}
            href={REPO_URL}
          >
            <GitHubMark />
            GitHub
            <StarCount stars={stars} />
          </a>
        </div>
      </div>
    </nav>
  );
}

const FOOTER_LINKS = [
  ...STATIC_PAGES.map((page) => ({ href: page.path, label: page.navLabel })),
  { href: REPO_URL, label: "GitHub" },
  { href: `${REPO_URL}/blob/main/CONTRIBUTING.md`, label: "Bijdragen" },
  { href: `${REPO_URL}/blob/main/SECURITY.md`, label: "Beveiliging" },
  { href: `${REPO_URL}/blob/main/LICENSE`, label: "Apache-2.0" },
] as const;

export function SiteFooter(): ReactNode {
  return (
    <footer className="border-border border-t py-10">
      <div
        className={`${CONTAINER} flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center`}
      >
        <p className="font-semibold tracking-tight">Stamppot</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <a
              className="text-muted text-sm no-underline hover:text-foreground"
              href={link.href}
              key={link.label}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
