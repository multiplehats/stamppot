import type { ReactNode } from "react";
import landingStyles from "./styles.css?inline";

export const REPO_URL = "https://github.com/multiplehats/stamppot";

/** Full-bleed section padding, shared by every deck section and the shell bars. */
const DECK_GUTTER = "px-[120px] max-[1100px]:px-16 max-sm:px-6";
const DECK_SECTION = `${DECK_GUTTER} py-[120px] max-[1100px]:py-20 max-sm:py-14`;
const DECK_CONTAINER = "mx-auto w-full max-w-page";

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
    <html className="scroll-smooth" lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <meta content={description} name="description" />
        <meta content="#16352b" name="theme-color" />
        <title>{title}</title>
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
        {head}
        <style>{landingStyles}</style>
      </head>
      <body className="shell-deck m-0 font-body text-body antialiased">
        {children}
      </body>
    </html>
  );
}

/** Full-bleed band with the 1200px deck column centred inside it. */
export function DeckSection({
  children,
  className = "",
  id,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly id?: string;
}): ReactNode {
  return (
    <section className={`${DECK_SECTION} ${className}`} id={id}>
      <div className={DECK_CONTAINER}>{children}</div>
    </section>
  );
}

export function DeckWordmark({ as = "span" }: { readonly as?: "h2" | "span" }) {
  const Tag = as;
  return (
    <Tag className="font-display font-extrabold text-[24px] text-card leading-[30px] tracking-[-0.02em]">
      Stamppot
    </Tag>
  );
}

interface SiteNavigationProps {
  readonly page: "landing" | "tool";
}

const NAV_LINK =
  "font-display font-extrabold text-[14px] text-card leading-[20px] no-underline hover:text-signal-red";

/**
 * Both pages wear the same bar. Only the deep links differ: the landing page
 * scrolls to its own deck, a tool page goes back out to it.
 */
const NAV_LINKS = {
  landing: [
    { href: "#deck", label: "Tools" },
    { href: "/v1/mcps", label: "JSON" },
  ],
  tool: [
    { href: "/#deck", label: "All tools" },
    { href: "/v1/tools", label: "JSON" },
  ],
} as const;

export function SiteNavigation({ page }: SiteNavigationProps): ReactNode {
  return (
    <nav
      aria-label="Primary navigation"
      className={`${DECK_GUTTER} flex h-[88px] items-center bg-felt`}
    >
      <div className={`${DECK_CONTAINER} flex items-center justify-between`}>
        <a className="no-underline" href="/">
          <DeckWordmark />
        </a>
        <div className="flex items-center gap-9 max-sm:gap-6">
          {NAV_LINKS[page].map((link) => (
            <a className={NAV_LINK} href={link.href} key={link.label}>
              {link.label}
            </a>
          ))}
          <a className={NAV_LINK} href={REPO_URL}>
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}

const DECK_FOOTER_LINKS = [
  { href: REPO_URL, label: "GitHub" },
  { href: `${REPO_URL}/blob/main/CONTRIBUTING.md`, label: "Contributing" },
  { href: `${REPO_URL}/blob/main/SECURITY.md`, label: "Security" },
  { href: `${REPO_URL}/blob/main/LICENSE`, label: "Apache-2.0" },
] as const;

export function SiteFooter(): ReactNode {
  return (
    <footer
      className={`${DECK_GUTTER} border-hairline border-t-2 bg-felt py-14`}
    >
      <div
        className={`${DECK_CONTAINER} flex items-center justify-between gap-8 max-sm:flex-col max-sm:items-start`}
      >
        <DeckWordmark as="h2" />
        <div className="flex items-center gap-9 max-sm:flex-wrap max-sm:gap-x-6 max-sm:gap-y-3">
          {DECK_FOOTER_LINKS.map((link) => (
            <a
              className="font-display font-extrabold text-[14px] text-smoke leading-[20px] no-underline hover:text-card"
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
