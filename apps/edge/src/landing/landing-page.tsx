import type { McpDescription, OperationRegistry } from "@stamppot/core";
import type { ReactNode } from "react";
import { GitHubMark, StarCount } from "./github";
import { InstallCard } from "./install-card";
import { installOptions } from "./install-targets";
import { McpDialogCard } from "./mcp-dialog";
import { presentationFor } from "./mcp-presentation";
import { brandIconUrl } from "./parsew";
import { toolPath } from "./routes";
import {
  buttonClass,
  CONTAINER,
  card,
  Section,
  SectionHeading,
  SiteDocument,
  SiteFooter,
  SiteNavigation,
  safeJson,
} from "./site";
import { REPO_URL, SITE_NAME, SOCIAL_IMAGE_PATH } from "./urls";

interface LandingPageProps {
  readonly origin: string;
  readonly registry: OperationRegistry;
  /** Undefined whenever GitHub did not answer in time; the page copes. */
  readonly stars: number | undefined;
}

/** The second step names a real endpoint, so it cannot go stale. */
function steps(sampleMcpId: string) {
  return [
    {
      body: "Geen account, geen sleutel, geen aparte testomgeving. Plak de URL in je client en roep meteen aan.",
      title: "Plakken en beginnen",
    },
    {
      body: `Gebruik /mcp voor alle servers tegelijk, of /mcp/${sampleMcpId} als je er maar één nodig hebt.`,
      title: "Alles samen, of per bron",
    },
    {
      body: "Spreekt je client geen MCP? Dezelfde operaties staan op gewone HTTP, uit dezelfde definitie, dus de schema's lopen nooit uit elkaar.",
      title: "Ook zonder MCP-client",
    },
  ] as const;
}

/**
 * The one sentence pair that has to survive being quoted out of context: what
 * Stamppot is, what it costs, and how you connect. It feeds the meta
 * description, `og:description`, `twitter:description` and the `@graph`, and
 * the hero paragraph and the `llms.txt` blockquote assert the same three facts
 * in their own words.
 */
const DESCRIPTION =
  "Gratis MCP-servers voor Nederlandse supermarktprijzen, tweedehands advertenties en openbaar vervoer. Geen account en geen API-sleutel: plak het endpoint in je client.";

/** One string for `<title>`, `og:title` and `twitter:title`. */
const TITLE = "Stamppot — gratis MCP-servers voor Nederlandse data";

/**
 * One `@graph` rather than three scripts, so the nodes can reference each other
 * by `@id`: the tool pages and the prose pages both point back at this
 * `Organization` and this `WebSite` instead of restating them.
 *
 * The `ItemList` is generated from the registry, so a new MCP appears in the
 * structured data at the same moment it appears on the page. There is no
 * postal address beyond the country and no contact e-mail: Stamppot is a
 * personal open-source project, everything runs through the public issue
 * tracker, and inventing either would be worse than omitting them.
 */
function structuredData(origin: string, mcps: readonly McpDescription[]) {
  // Read per render: a Worker's module-scope clock is still at the epoch.
  const BUILT_AT = new Date().toISOString().slice(0, 10);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": `${origin}/#organization`,
        "@type": "Organization",
        address: { "@type": "PostalAddress", addressCountry: "NL" },
        contactPoint: {
          "@type": "ContactPoint",
          availableLanguage: ["nl", "en"],
          contactType: "technical support",
          url: `${REPO_URL}/issues`,
        },
        description:
          "Bouwt en onderhoudt Stamppot, een verzameling gratis MCP-servers voor Nederlandse open data.",
        founder: { "@type": "Person", name: "Chris Jayden" },
        logo: `${origin}${SOCIAL_IMAGE_PATH}`,
        name: SITE_NAME,
        sameAs: [REPO_URL],
        url: `${origin}/`,
      },
      {
        "@id": `${origin}/#website`,
        "@type": "WebSite",
        dateModified: BUILT_AT,
        description: DESCRIPTION,
        inLanguage: "nl-NL",
        name: SITE_NAME,
        publisher: { "@id": `${origin}/#organization` },
        url: `${origin}/`,
      },
      {
        "@id": `${origin}/#software`,
        "@type": "SoftwareApplication",
        applicationCategory: "DeveloperApplication",
        author: { "@id": `${origin}/#organization` },
        dateModified: BUILT_AT,
        description: DESCRIPTION,
        featureList: mcps.map((mcp) => mcp.title),
        inLanguage: "nl-NL",
        isAccessibleForFree: true,
        license: `${REPO_URL}/blob/main/LICENSE`,
        name: SITE_NAME,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "EUR",
        },
        operatingSystem: "Any",
        softwareHelp: `${origin}/developers`,
        url: `${origin}/`,
      },
      {
        "@type": "ItemList",
        itemListElement: mcps.map((mcp, index) => ({
          "@type": "ListItem",
          item: {
            "@type": "SoftwareApplication",
            applicationCategory: "DeveloperApplication",
            description: presentationFor(mcp.id).tagline,
            isAccessibleForFree: true,
            name: mcp.title,
            operatingSystem: "Any",
            url: `${origin}/mcp/${mcp.id}`,
          },
          position: index + 1,
        })),
        name: "Stamppot MCP-servers",
        numberOfItems: mcps.length,
      },
    ],
  };
}

export function LandingPage({
  origin,
  registry,
  stars,
}: LandingPageProps): ReactNode {
  const mcps = registry.describeMcps();
  const [firstMcp] = mcps;
  const canonicalUrl = `${origin}/`;

  return (
    <SiteDocument
      description={DESCRIPTION}
      head={
        <>
          <link href={canonicalUrl} rel="canonical" />
          <meta content="website" property="og:type" />
          <meta content={SITE_NAME} property="og:site_name" />
          <meta content={TITLE} property="og:title" />
          <meta content={DESCRIPTION} property="og:description" />
          <meta content={canonicalUrl} property="og:url" />
          <meta content="nl_NL" property="og:locale" />
          <meta content={`${origin}${SOCIAL_IMAGE_PATH}`} property="og:image" />
          <meta content="Een kom stamppot" property="og:image:alt" />
          <meta content="summary_large_image" name="twitter:card" />
          <meta content={TITLE} name="twitter:title" />
          <meta content={DESCRIPTION} name="twitter:description" />
          <meta
            content={`${origin}${SOCIAL_IMAGE_PATH}`}
            name="twitter:image"
          />
          <link href="/llms.txt" rel="alternate" type="text/plain" />
          <script type="application/ld+json">
            {safeJson(structuredData(origin, mcps))}
          </script>
        </>
      }
      title={TITLE}
    >
      <SiteNavigation page="landing" stars={stars} />
      <main>
        <Hero origin={origin} />
        <Mcps mcps={mcps} origin={origin} />
        <HowToConnect sampleMcpId={firstMcp?.id ?? "groceries"} />
        <OpenSource stars={stars} />
      </main>
      <SiteFooter />
    </SiteDocument>
  );
}

/**
 * One screen that has to do the whole job: name what this is, say what it
 * costs, and put the next step within reach. The install card is the call to
 * action, so there is no button row above it competing for the same click.
 */
function Hero({ origin }: { readonly origin: string }): ReactNode {
  return (
    <section className="py-20 sm:py-24">
      <div className={`${CONTAINER} flex flex-col items-center text-center`}>
        <img
          alt="Een kom stamppot"
          className="h-24 w-24"
          height={97}
          src="/stamppot-bowl.png"
          width={96}
        />
        <h1 className="mt-8 max-w-3xl text-balance font-semibold text-4xl tracking-tight sm:text-6xl">
          Gratis MCP-servers voor Nederlandse data.
        </h1>
        <p className="mt-6 max-w-2xl text-balance text-lg text-muted">
          Supermarktprijzen, tweedehands advertenties en openbaar vervoer,
          achter één endpoint. Gratis en open source, zonder account of
          API-sleutel: koppelen is de URL plakken.
        </p>
        <InstallCard
          className="mt-12 w-full max-w-2xl text-left"
          eyebrow="Koppel je agent"
          options={installOptions({
            endpoint: `${origin}/mcp`,
            serverName: "stamppot",
            theme: "light",
          })}
          placement="landing"
        />
        <p className="mt-6 text-muted text-sm">
          Liever eerst kijken: <a href="#mcps">alle MCP&apos;s</a>,{" "}
          <a href="/v1/tools">de tools met hun schema&apos;s</a> of{" "}
          <a href="/llms.txt">llms.txt</a>.
        </p>
      </div>
    </section>
  );
}

interface McpsProps {
  readonly mcps: readonly McpDescription[];
  readonly origin: string;
}

/**
 * Dutch reads a small number better as a word than as a digit. Capitalised
 * because the only caller opens a sentence with it; anything past the list
 * falls back to the digit rather than growing the table forever.
 */
const NUMBER_WORDS = ["Nul", "Eén", "Twee", "Drie", "Vier", "Vijf", "Zes"];

function countWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

/**
 * One card per registered MCP, in registry order, directly under the hero:
 * this is the thing itself, and everything below it is explanation. The title,
 * the operations and their links come from the registry; only the tagline and
 * the accent are written by hand, in `mcp-presentation.ts`, and both fall back
 * so that a new MCP still adds itself to this grid without touching either
 * file.
 *
 * The heading counts the registry rather than the layout — the grid is written
 * for any number of cards.
 */
function Mcps({ mcps, origin }: McpsProps): ReactNode {
  return (
    <Section id="mcps" muted>
      <SectionHeading centered eyebrow="Nu beschikbaar">
        {mcps.length === 1
          ? "Eén bron, klaar om te koppelen."
          : `${countWord(mcps.length)} bronnen achter één endpoint.`}
      </SectionHeading>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {mcps.map((mcp) => (
          <McpCard key={mcp.id} mcp={mcp} origin={origin} />
        ))}
      </div>
      <p className="mt-10 text-balance text-muted">
        Mis je een Nederlandse databron? Het package-contract is klein en de
        review gaat snel —{" "}
        <a href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}>
          lees hoe je er zelf een toevoegt
        </a>
        .
      </p>
    </Section>
  );
}

/**
 * A card is a trigger, not a table of contents: it carries the written tagline
 * and the tool count, and the tools themselves live in the dialog it opens.
 * Everything the dialog needs is plain data, so it crosses the RSC boundary as
 * props rather than as a second fetch.
 */
function McpCard({
  mcp,
  origin,
}: {
  readonly mcp: McpDescription;
  readonly origin: string;
}): ReactNode {
  const { accent, sources, tagline } = presentationFor(mcp.id);

  return (
    <McpDialogCard
      accent={accent}
      description={mcp.description}
      endpoint={`${origin}/mcp/${mcp.id}`}
      id={mcp.id}
      // The light marks: every card panel is a soft tint, and so is the dialog.
      sources={sources.map((source) => ({
        iconUrl: brandIconUrl(source.domain, { theme: "light" }),
        label: source.label,
        monogram: source.label.slice(0, 1),
      }))}
      tagline={tagline}
      title={mcp.title}
      tools={mcp.operations.map((operation) => ({
        description: operation.description,
        href: toolPath(operation.name),
        name: operation.name,
        title: operation.title,
      }))}
    />
  );
}

function HowToConnect({
  sampleMcpId,
}: {
  readonly sampleMcpId: string;
}): ReactNode {
  return (
    <Section>
      <SectionHeading eyebrow="Koppelen">
        Van URL naar eerste aanroep, zonder tussenstap.
      </SectionHeading>
      <ol className="mt-10 grid gap-6 sm:grid-cols-3">
        {steps(sampleMcpId).map((step, index) => (
          <li className={card.base()} key={step.title}>
            <div className={card.header()}>
              <span className="font-mono text-muted text-sm">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={`${card.title()} mt-2 text-base`}>{step.title}</h3>
            </div>
            <div className={card.content()}>
              <p className={card.description()}>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-10 text-muted">
        De volledige uitleg — endpoints, foutcodes, limieten en de bestanden die
        agents lezen — staat op{" "}
        <a href="/developers">de pagina voor developers</a>.
      </p>
    </Section>
  );
}

function OpenSource({
  stars,
}: {
  readonly stars: number | undefined;
}): ReactNode {
  return (
    <Section muted>
      <div className="flex flex-col items-center text-center">
        <SectionHeading centered eyebrow="Open source">
          Lees na wat er gebeurt, of draai je eigen versie.
        </SectionHeading>
        <p className="mt-6 max-w-xl text-balance text-muted">
          Volledig open-source en makkelijk zelf te deployen.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <a className={buttonClass("primary")} href="/developers">
            Documentatie voor developers
          </a>
          <a className={`${buttonClass("outline")} gap-2`} href={REPO_URL}>
            <GitHubMark />
            Bekijk de code
            <StarCount stars={stars} />
          </a>
        </div>
      </div>
    </Section>
  );
}
