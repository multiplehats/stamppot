import type { McpDescription, OperationRegistry } from "@stamppot/core";
import type { ReactNode } from "react";
import { InstallCard } from "./install-card";
import { installOptions } from "./install-targets";
import { McpDialogCard } from "./mcp-dialog";
import { presentationFor } from "./mcp-presentation";
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
}

/** The second reason names a real endpoint, so it cannot go stale. */
function reasons(sampleMcpId: string) {
  return [
    {
      body: "Plak de URL in je client en je kunt beginnen.",
      title: "Geen setup",
    },
    {
      body: `Gebruik /mcp voor alle servers tegelijk, of /mcp/${sampleMcpId} voor alleen deze.`,
      title: "Alles samen, of per server",
    },
    {
      body: "Allebei roepen ze dezelfde operatie aan, dus de schema's lopen nooit uit elkaar.",
      title: "MCP en HTTP, uit dezelfde definitie",
    },
  ] as const;
}

const GUARANTEES = [
  {
    body: "Alleen het opslaan van een boodschappenlijst schrijft iets, en dat kan niet zonder het token dat jij beheert.",
    title: "Lezen tenzij je expliciet anders vraagt",
  },
  {
    body: "We tellen welke tool is aangeroepen en of hij slaagde. Wat je zocht of opvroeg gaat daar nooit in mee.",
    title: "Je invoer wordt niet vastgelegd",
  },
  {
    body: "Elke nieuwe operatie legt zijn limieten vast voordat hij live gaat.",
    title: "Harde limieten op input, response, tijd en complexiteit",
  },
  {
    body: "Ongeldige input wordt geweigerd voordat de tool draait.",
    title: "Schemavalidatie op de edge",
  },
] as const;

const DESCRIPTION =
  "Gratis, open source MCP-servers voor Nederlandse data, zonder authenticatie. Boodschappenprijzen, tweedehands advertenties en openbaar vervoer via één endpoint.";

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
        isAccessibleForFree: true,
        license: `${REPO_URL}/blob/main/LICENSE`,
        name: SITE_NAME,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "EUR",
        },
        operatingSystem: "Any",
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

export function LandingPage({ origin, registry }: LandingPageProps): ReactNode {
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
          <meta
            content="Stamppot: MCP-servers voor Nederlandse data"
            property="og:title"
          />
          <meta content={DESCRIPTION} property="og:description" />
          <meta content={canonicalUrl} property="og:url" />
          <meta content="nl_NL" property="og:locale" />
          <meta content={`${origin}${SOCIAL_IMAGE_PATH}`} property="og:image" />
          <meta content="Een kom stamppot" property="og:image:alt" />
          <meta content="summary_large_image" name="twitter:card" />
          <meta
            content="Stamppot: MCP-servers voor Nederlandse data"
            name="twitter:title"
          />
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
      title="Stamppot: MCP-servers voor Nederlandse data"
    >
      <SiteNavigation page="landing" />
      <main>
        <Hero origin={origin} />
        <Why sampleMcpId={firstMcp?.id ?? "groceries"} />
        <Mcps mcps={mcps} origin={origin} />
        <OpenSource />
        <SafeByDesign />
      </main>
      <SiteFooter />
    </SiteDocument>
  );
}

function Hero({ origin }: { readonly origin: string }): ReactNode {
  return (
    <section className="py-20 sm:py-28">
      <div className={`${CONTAINER} flex flex-col items-center text-center`}>
        <img
          alt="Een kom stamppot"
          className="h-24 w-24"
          height={97}
          src="/stamppot-bowl.png"
          width={96}
        />
        <h1 className="mt-8 max-w-3xl text-balance font-semibold text-4xl tracking-tight sm:text-6xl">
          Nederlandse MCP-servers voor je (persoonlijke) agents. Geen account
          nodig.
        </h1>
        <p className="mt-6 max-w-xl text-balance text-lg text-muted">
          Gratis, open source en zonder authenticatie. Koppel alle servers via
          hetzelfde endpoint, of alleen degene die je nodig hebt.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <a className={buttonClass("primary", "lg")} href="#mcps">
            Koppel een MCP
          </a>
          <a className={buttonClass("outline", "lg")} href="/v1/tools">
            Bekijk de tools
          </a>
        </div>
        <InstallCard
          className="mt-14 w-full max-w-2xl text-left"
          eyebrow="Koppel je agent"
          options={installOptions({
            endpoint: `${origin}/mcp`,
            serverName: "stamppot",
            theme: "light",
          })}
          placement="landing"
        />
      </div>
    </section>
  );
}

function Why({ sampleMcpId }: { readonly sampleMcpId: string }): ReactNode {
  return (
    <Section muted>
      <SectionHeading eyebrow="Waarom">
        Nederlandse open data, meteen aanroepbaar.
      </SectionHeading>
      <ol className="mt-10 grid gap-6 sm:grid-cols-3">
        {reasons(sampleMcpId).map((reason, index) => (
          <li className={card.base()} key={reason.title}>
            <div className={card.header()}>
              <span className="font-mono text-muted text-sm">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={`${card.title()} mt-2 text-base`}>
                {reason.title}
              </h3>
            </div>
            <div className={card.content()}>
              <p className={card.description()}>{reason.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
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
 * One card per registered MCP, in registry order. The title, the operations and
 * their links come from the registry; only the tagline and the accent are
 * written by hand, in `mcp-presentation.ts`, and both fall back so that a new
 * MCP still adds itself to this grid without touching either file.
 *
 * Three cards is what three registered MCPs happen to produce today, not a
 * layout — the grid is written for any number.
 */
function Mcps({ mcps, origin }: McpsProps): ReactNode {
  return (
    <Section id="mcps">
      <SectionHeading centered eyebrow="Nu beschikbaar">
        {mcps.length === 1
          ? "Eén bron, klaar om te koppelen."
          : `${countWord(mcps.length)} bronnen, één endpoint.`}
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
  const { accent, tagline } = presentationFor(mcp.id);

  return (
    <McpDialogCard
      accent={accent}
      description={mcp.description}
      endpoint={`${origin}/mcp/${mcp.id}`}
      id={mcp.id}
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

function OpenSource(): ReactNode {
  return (
    <Section muted>
      <div className="flex flex-col items-center text-center">
        <SectionHeading centered eyebrow="Open source">
          Bekijk de code, fork de repo en draai je eigen versie.
        </SectionHeading>
        <p className="mt-6 max-w-xl text-balance text-muted">
          Apache-2.0, draait op een enkele Cloudflare Worker. Elke operatie, elk
          schema en elk contentbestand staat gewoon in de repo.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <a className={buttonClass("primary")} href="/developers">
            Documentatie voor developers
          </a>
          <a className={buttonClass("outline")} href={REPO_URL}>
            Bekijk de code
          </a>
        </div>
        <p className="mt-6 text-muted text-sm">
          Of ga direct naar de <a href="/openapi.json">OpenAPI-spec</a>,{" "}
          <a href="/v1/tools">de tools met hun schema&apos;s</a> en{" "}
          <a href="/llms.txt">llms.txt</a>.
        </p>
      </div>
    </Section>
  );
}

function SafeByDesign(): ReactNode {
  return (
    <Section>
      <SectionHeading eyebrow="Veilig ontworpen">
        Je kunt Stamppot aan een agent geven zonder toe te kijken.
      </SectionHeading>
      <ul className="mt-10 grid gap-6 sm:grid-cols-2">
        {GUARANTEES.map((guarantee) => (
          <li className={card.base()} key={guarantee.title}>
            <div className={card.header()}>
              <h3 className={`${card.title()} text-base`}>{guarantee.title}</h3>
            </div>
            <div className={card.content()}>
              <p className={card.description()}>{guarantee.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
