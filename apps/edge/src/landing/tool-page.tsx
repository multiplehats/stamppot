import type { ReactNode } from "react";
import type { ToolContentCatalog, ToolPageContent } from "./content";
import { deckSuit, mcpBadge } from "./deck";
import { InstallCard } from "./install-card";
import { installOptions } from "./install-targets";
import { toolPath } from "./routes";
import {
  DeckSection,
  REPO_URL,
  SiteDocument,
  SiteFooter,
  SiteNavigation,
} from "./site";

interface ToolPageProps {
  readonly content: ToolContentCatalog;
  readonly origin: string;
  readonly tool: ToolPageContent;
}

const EYEBROW_ON_FELT =
  "font-display font-extrabold text-ash text-caption uppercase tracking-[0.08em]";
const EYEBROW_ON_CARD =
  "font-display font-extrabold text-caption text-graphite uppercase tracking-[0.08em]";
const MICRO_ON_CARD =
  "font-display font-extrabold text-[11px] text-graphite leading-[18px] tracking-[0.08em]";
const MICRO_ON_FELT =
  "font-display font-extrabold text-[11px] text-ash leading-[18px] tracking-[0.08em]";

/** The card shows a bare host and path; the scheme is noise on a label. */
const URL_SCHEME = /^https?:\/\//;

export function ToolPage({ content, origin, tool }: ToolPageProps): ReactNode {
  const canonicalUrl = `${origin}${toolPath(tool.operationName)}`;
  const domainEndpoint = `${origin}/mcp/${tool.mcpId}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    applicationCategory: "DeveloperApplication",
    description: tool.description,
    isAccessibleForFree: true,
    name: tool.title,
    operatingSystem: "Any",
    url: canonicalUrl,
  };

  return (
    <SiteDocument
      description={tool.description}
      head={
        <>
          <meta content={tool.tags.join(", ")} name="keywords" />
          <meta content="website" property="og:type" />
          <meta content={`${tool.title} — Stamppot`} property="og:title" />
          <meta content={tool.description} property="og:description" />
          <meta content={canonicalUrl} property="og:url" />
          <link href={canonicalUrl} rel="canonical" />
          <script type="application/ld+json">{safeJson(structuredData)}</script>
        </>
      }
      title={`${tool.title} — Stamppot MCP tool`}
    >
      <SiteNavigation page="tool" />
      <main>
        <Hero endpoint={domainEndpoint} tool={tool} />
        <Documentation endpoint={domainEndpoint} origin={origin} tool={tool} />
        <KeepCooking content={content} tool={tool} />
      </main>
      <SiteFooter />
    </SiteDocument>
  );
}

interface HeroProps {
  readonly endpoint: string;
  readonly tool: ToolPageContent;
}

function Hero({ endpoint, tool }: HeroProps): ReactNode {
  return (
    <section className="bg-felt px-[120px] pt-16 pb-[120px] max-sm:px-6 max-sm:pt-8 max-sm:pb-14 max-[1100px]:px-16 max-[1100px]:pt-12 max-[1100px]:pb-20">
      <div className="mx-auto flex w-full max-w-page items-start gap-16 max-[900px]:flex-col max-[900px]:gap-12">
        <div className="flex min-w-0 flex-1 flex-col items-start">
          <Breadcrumb tool={tool} />
          <p className={`mt-8 ${EYEBROW_ON_FELT}`}>
            {tool.category.replaceAll("-", " ")} tool
          </p>
          <h1 className="mt-5 max-w-[760px] font-display font-extrabold text-card text-display-lg">
            {tool.title}
          </h1>
          <p className="mt-7 max-w-[640px] font-extrabold text-card text-subheading leading-[1.6]">
            {tool.description}
          </p>
          <ul
            aria-label="Tool tags"
            className="mt-8 flex max-w-[640px] list-none flex-wrap gap-[10px] p-0"
          >
            {tool.tags.map((tag) => (
              <li
                className="flex h-[38px] items-center rounded-pill px-5 font-display font-extrabold text-[13px] text-smoke leading-[20px] shadow-[inset_0_0_0_2px_var(--color-hairline)]"
                key={tag}
              >
                {tag.replaceAll("-", " ")}
              </li>
            ))}
          </ul>
        </div>
        <ToolCard endpoint={endpoint} tool={tool} />
      </div>
    </section>
  );
}

function Breadcrumb({ tool }: { readonly tool: ToolPageContent }): ReactNode {
  return (
    <nav
      aria-label="Breadcrumb"
      className="font-display font-extrabold text-[13px] text-ash leading-[20px] tracking-[0.04em]"
    >
      <a className="text-ash no-underline hover:text-card" href="/">
        Stamppot
      </a>
      <span aria-hidden="true"> / </span>
      <a className="text-ash no-underline hover:text-card" href="/#deck">
        {tool.mcpTitle}
      </a>
      <span aria-hidden="true"> / </span>
      <span className="text-card">{tool.operationName}</span>
    </nav>
  );
}

/**
 * The tool as a playing card, wearing its MCP's suit. Every fact on it is one
 * an agent needs before it connects: where the endpoint is, what it costs, and
 * what comes back.
 */
function ToolCard({ endpoint, tool }: HeroProps): ReactNode {
  const suit = deckSuit(tool.mcpId);
  const facts = [
    { label: "Endpoint", value: endpoint.replace(URL_SCHEME, "") },
    { label: "Access", value: "Free · no account · read-only" },
    { label: "Result", value: "Structured JSON" },
  ];

  return (
    <article
      className={`w-[420px] shrink-0 rotate-[-1.5deg] rounded-card-lg p-8 max-[900px]:w-full max-[900px]:rotate-0 ${suit.face}`}
    >
      <span
        className={`flex h-9 w-fit items-center rounded-pill px-[18px] font-display font-extrabold text-[13px] leading-[18px] tracking-[0.06em] ${suit.badgeFill} ${suit.badgeText}`}
      >
        {mcpBadge(tool.mcpId)}
      </span>
      <h2
        className={`mt-6 break-words font-display font-extrabold text-heading leading-[40px] ${suit.faceText}`}
      >
        {tool.operationName}
      </h2>
      <dl className="mt-7 grid rotate-[2.5deg] gap-4 rounded-card bg-card px-6 py-[22px]">
        {facts.map((fact) => (
          <div className="grid gap-[3px]" key={fact.label}>
            <dt className={MICRO_ON_CARD}>{fact.label.toUpperCase()}</dt>
            <dd className="m-0 break-words font-display font-extrabold text-[15px] text-felt leading-[22px]">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

interface DocumentationProps {
  readonly endpoint: string;
  readonly origin: string;
  readonly tool: ToolPageContent;
}

function Documentation({
  endpoint,
  origin,
  tool,
}: DocumentationProps): ReactNode {
  return (
    <DeckSection className="bg-card">
      <div className="flex items-start gap-20 max-[900px]:flex-col max-[900px]:gap-12">
        <article
          aria-label="Tool documentation"
          className="tool-prose w-full min-w-0 flex-1"
          // The build compiles repository-owned Markdown into this HTML.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: compiled from trusted repository content
          dangerouslySetInnerHTML={{ __html: tool.html }}
        />
        <aside
          aria-label="Connect to this tool"
          className="sticky top-6 flex w-[360px] shrink-0 flex-col gap-5 max-[900px]:static max-[900px]:w-full"
        >
          <ConnectCard endpoint={endpoint} tool={tool} />
          <HttpCard origin={origin} tool={tool} />
        </aside>
      </div>
    </DeckSection>
  );
}

function ConnectCard({ endpoint, tool }: HeroProps): ReactNode {
  return (
    <InstallCard
      eyebrow="Connect"
      options={installOptions({
        endpoint,
        serverName: tool.mcpId,
        theme: "light",
      })}
      tone="felt"
    />
  );
}

function HttpCard({
  origin,
  tool,
}: {
  readonly origin: string;
  readonly tool: ToolPageContent;
}): ReactNode {
  return (
    <div className="rounded-card-lg px-8 py-7 shadow-[inset_0_0_0_2px_var(--color-felt)]">
      <p className={EYEBROW_ON_CARD}>No MCP client?</p>
      <p className="mt-[10px] font-display font-extrabold text-felt text-subheading">
        Call it over plain HTTP.
      </p>
      <a
        className="mt-3 block break-all font-display font-extrabold text-[14px] text-felt leading-[24px] underline underline-offset-4"
        href={`${origin}/v1/tools/${tool.operationName}`}
      >
        POST /v1/tools/{tool.operationName}
      </a>
    </div>
  );
}

interface KeepCookingProps {
  readonly content: ToolContentCatalog;
  readonly tool: ToolPageContent;
}

function KeepCooking({ content, tool }: KeepCookingProps): ReactNode {
  const related = content.related(tool);
  // One card should read as a card, not stretch into a banner.
  const cards =
    related.length === 0
      ? "w-[300px] max-[900px]:w-full"
      : "w-[540px] max-[900px]:w-full max-[640px]:flex-col";

  return (
    <DeckSection className="bg-felt">
      <div className="flex items-center gap-20 max-[900px]:flex-col max-[900px]:items-start max-[900px]:gap-12">
        <div className="flex min-w-0 flex-1 flex-col items-start">
          <p className={EYEBROW_ON_FELT}>More tools</p>
          <h2 className="mt-5 max-w-[460px] font-display font-extrabold text-card text-heading-lg">
            {related.length === 0
              ? `The ${tool.mcpTitle} MCP has one tool so far.`
              : `More tools from the ${tool.mcpTitle} MCP.`}
          </h2>
          <a
            className="mt-9 flex h-14 items-center rounded-pill bg-card px-9 font-display font-extrabold text-[16px] text-felt leading-[20px] no-underline max-sm:h-12 max-sm:px-7"
            href="/#deck"
          >
            Browse every tool
          </a>
        </div>
        <div className={`flex shrink-0 gap-[18px] ${cards}`}>
          {related.length === 0 ? (
            <PlannedCard mcpId={tool.mcpId} />
          ) : (
            related.map((relatedTool) => (
              <RelatedCard key={relatedTool.operationName} tool={relatedTool} />
            ))
          )}
        </div>
      </div>
    </DeckSection>
  );
}

function RelatedCard({ tool }: { readonly tool: ToolPageContent }): ReactNode {
  const suit = deckSuit(tool.mcpId);
  return (
    <a
      className={`flex min-h-[220px] flex-1 flex-col gap-[10px] rounded-card-lg p-[26px] no-underline ${suit.face}`}
      href={toolPath(tool.operationName)}
    >
      <span
        className={`font-display font-extrabold text-[11px] leading-[16px] tracking-[0.08em] ${suit.faceText}`}
      >
        {mcpBadge(tool.mcpId)}
      </span>
      <span
        className={`font-display font-extrabold text-[22px] leading-[28px] tracking-[-0.01em] ${suit.faceText}`}
      >
        {tool.operationName}
      </span>
      <span className="text-body-sm text-felt leading-[22px]">
        {tool.description}
      </span>
    </a>
  );
}

/**
 * The honest empty state. One tool means the MCP is early, so the gap is drawn
 * as a card waiting to be built rather than left blank.
 */
function PlannedCard({ mcpId }: { readonly mcpId: string }): ReactNode {
  const suit = deckSuit(mcpId);
  return (
    <a
      className={`flex min-h-[240px] flex-1 rotate-[-2deg] flex-col gap-[10px] rounded-card-lg p-[26px] no-underline ${suit.outline}`}
      href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}
    >
      <span className={MICRO_ON_FELT}>NOT BUILT YET</span>
      <span className="font-display font-extrabold text-[22px] text-card leading-[28px] tracking-[-0.01em]">
        Add a tool
      </span>
      <span className="text-body-sm text-smoke leading-[22px]">
        The package contract is in CONTRIBUTING.md.
      </span>
    </a>
  );
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
