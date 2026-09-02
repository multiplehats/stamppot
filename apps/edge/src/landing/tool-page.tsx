import { breadcrumbsVariants, chipVariants } from "@heroui/styles";
import type { ReactNode } from "react";
import type { ToolContentCatalog, ToolPageContent } from "./content";
import { InstallCard } from "./install-card";
import { installOptions } from "./install-targets";
import { toolPath } from "./routes";
import {
  buttonClass,
  CONTAINER,
  card,
  REPO_URL,
  Section,
  SectionHeading,
  SiteDocument,
  SiteFooter,
  SiteNavigation,
} from "./site";

interface ToolPageProps {
  readonly content: ToolContentCatalog;
  readonly origin: string;
  readonly tool: ToolPageContent;
}

const chip = chipVariants();
const breadcrumbs = breadcrumbsVariants();

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
          <meta content={`${tool.title} (Stamppot)`} property="og:title" />
          <meta content={tool.description} property="og:description" />
          <meta content={canonicalUrl} property="og:url" />
          <link href={canonicalUrl} rel="canonical" />
          <script type="application/ld+json">{safeJson(structuredData)}</script>
        </>
      }
      title={`${tool.title} (Stamppot MCP-tool)`}
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
    <section className="border-border border-b py-16">
      <div
        className={`${CONTAINER} flex flex-col items-start gap-12 lg:flex-row`}
      >
        <div className="flex min-w-0 flex-1 flex-col items-start">
          <Breadcrumb tool={tool} />
          {/* The category stands alone: Dutch closes "boodschappen tool" into
              one compound, so appending a loose noun would read as an anglicism. */}
          <p className="mt-6 font-medium text-muted text-sm">
            {tool.category.replaceAll("-", " ")}
          </p>
          {/* Dutch closes compounds, so a title word like "boodschappenopties"
              is one unbreakable 18-character token. It hyphenates (the document
              is lang="nl") and breaks as a fallback. */}
          <h1 className="mt-3 hyphens-auto break-words font-semibold text-4xl tracking-tight sm:text-5xl">
            {tool.title}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">{tool.description}</p>
          <ul
            aria-label="Tags"
            className="mt-6 flex list-none flex-wrap gap-2 p-0"
          >
            {tool.tags.map((tag) => (
              <li className={chip.base({ size: "sm" })} key={tag}>
                <span className={chip.label()}>{tag.replaceAll("-", " ")}</span>
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
    <nav aria-label="Kruimelpad" className={breadcrumbs.base()}>
      <a className={breadcrumbs.link()} href="/">
        Stamppot
      </a>
      <span aria-hidden="true" className={breadcrumbs.separator()}>
        /
      </span>
      <a className={breadcrumbs.link()} href="/#mcps">
        {tool.mcpTitle}
      </a>
      <span aria-hidden="true" className={breadcrumbs.separator()}>
        /
      </span>
      <span className={breadcrumbs.item()}>{tool.operationName}</span>
    </nav>
  );
}

/**
 * Every fact an agent needs before it connects: where the endpoint is, what it
 * costs, and what comes back.
 */
function ToolCard({ endpoint, tool }: HeroProps): ReactNode {
  const facts = [
    { label: "Endpoint", value: endpoint.replace(URL_SCHEME, "") },
    { label: "Toegang", value: "Gratis · geen account · read-only" },
    { label: "Resultaat", value: "JSON" },
  ];

  return (
    <article className={`${card.base()} w-full shrink-0 lg:w-80`}>
      <div className={card.header()}>
        <h2 className={`${card.title()} break-words font-mono text-base`}>
          {tool.operationName}
        </h2>
      </div>
      <div className={card.content()}>
        <dl className="divide-y divide-separator">
          {facts.map((fact) => (
            <div className="py-3" key={fact.label}>
              <dt className="text-muted text-xs uppercase tracking-wide">
                {fact.label}
              </dt>
              <dd className="mt-1 break-words text-sm">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
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
    <Section>
      <div className="flex flex-col items-start gap-12 lg:flex-row">
        <article
          aria-label="Tooldocumentatie"
          className="typography-prose tool-prose w-full min-w-0 flex-1"
          // The build compiles repository-owned Markdown into this HTML.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: compiled from trusted repository content
          dangerouslySetInnerHTML={{ __html: tool.html }}
        />
        <aside
          aria-label="Deze tool koppelen"
          className="flex w-full shrink-0 flex-col gap-6 lg:sticky lg:top-24 lg:w-80"
        >
          <InstallCard
            eyebrow="Koppelen"
            options={installOptions({
              endpoint,
              serverName: tool.mcpId,
              theme: "light",
            })}
            placement="tool"
          />
          <HttpCard origin={origin} tool={tool} />
        </aside>
      </div>
    </Section>
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
    <div className={card.base()}>
      <div className={card.header()}>
        <p className="font-medium text-muted text-sm">Geen MCP-client?</p>
        <h3 className={`${card.title()} mt-2 text-base`}>
          Roep de tool aan via HTTP.
        </h3>
      </div>
      <div className={`${card.footer()} mt-auto`}>
        <a
          className={`${buttonClass("secondary", "sm")} font-mono`}
          href={`${origin}/v1/tools/${tool.operationName}`}
        >
          POST /v1/tools/{tool.operationName}
        </a>
      </div>
    </div>
  );
}

interface KeepCookingProps {
  readonly content: ToolContentCatalog;
  readonly tool: ToolPageContent;
}

function KeepCooking({ content, tool }: KeepCookingProps): ReactNode {
  const related = content.related(tool);

  return (
    <Section muted>
      <SectionHeading eyebrow="Meer tools">
        {related.length === 0
          ? `Dit is voorlopig de enige tool in de ${tool.mcpTitle} MCP.`
          : `Andere tools uit de ${tool.mcpTitle} MCP.`}
      </SectionHeading>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {related.length === 0 ? (
          <PlannedCard />
        ) : (
          related.map((relatedTool) => (
            <RelatedCard key={relatedTool.operationName} tool={relatedTool} />
          ))
        )}
      </div>
      <a className={`${buttonClass("outline")} mt-10`} href="/#mcps">
        Bekijk alle tools
      </a>
    </Section>
  );
}

function RelatedCard({ tool }: { readonly tool: ToolPageContent }): ReactNode {
  return (
    <article className={`${card.base()} h-full`}>
      <div className={card.header()}>
        <span className={`${chip.base({ size: "sm" })} w-fit`}>
          <span className={chip.label()}>{tool.mcpTitle}</span>
        </span>
        <h3 className={`${card.title()} mt-3 font-mono text-base`}>
          {tool.operationName}
        </h3>
      </div>
      <div className={card.content()}>
        <p className={card.description()}>{tool.description}</p>
      </div>
      <div className={`${card.footer()} mt-auto`}>
        <a
          className={buttonClass("secondary", "sm")}
          href={toolPath(tool.operationName)}
        >
          Bekijken
        </a>
      </div>
    </article>
  );
}

/**
 * The honest empty state. One tool means the MCP is early, so the gap is drawn
 * as a card waiting to be built rather than left blank.
 */
function PlannedCard(): ReactNode {
  return (
    <article
      className={`${card.base()} h-full border border-border border-dashed`}
    >
      <div className={card.header()}>
        <span className={`${chip.base({ size: "sm" })} w-fit`}>
          <span className={chip.label()}>Nog niet gebouwd</span>
        </span>
        <h3 className={`${card.title()} mt-3 text-base`}>Voeg een tool toe</h3>
      </div>
      <div className={card.content()}>
        <p className={card.description()}>
          Het package-contract staat in CONTRIBUTING.md.
        </p>
      </div>
      <div className={`${card.footer()} mt-auto`}>
        <a
          className={buttonClass("secondary", "sm")}
          href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}
        >
          Bijdragen
        </a>
      </div>
    </article>
  );
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
