import { chipVariants } from "@heroui/styles";
import type { McpDescription, OperationRegistry } from "@stamppot/core";
import type { ReactNode } from "react";
import type { ToolContentCatalog } from "./content";
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

interface LandingPageProps {
  readonly content: ToolContentCatalog;
  readonly origin: string;
  readonly registry: OperationRegistry;
}

const chip = chipVariants();

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
    body: "Geen enkele aanroep kan iets schrijven, wijzigen of verwijderen.",
    title: "Elke operatie is read-only",
  },
  {
    body: "Er is geen account, dus valt er ook niets te loggen.",
    title: "We loggen geen requests",
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

export function LandingPage({
  content,
  origin,
  registry,
}: LandingPageProps): ReactNode {
  const mcps = registry.describeMcps();
  const [firstMcp] = mcps;

  return (
    <SiteDocument
      description="Gratis, open source MCP-servers voor Nederlandse data, zonder authenticatie."
      title="Stamppot: MCP-servers voor Nederlandse data"
    >
      <SiteNavigation page="landing" />
      <main>
        <Hero origin={origin} />
        <Why sampleMcpId={firstMcp?.id ?? "groceries"} />
        <Mcps content={content} mcps={mcps} />
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
          MCP-servers voor Nederlandse data. Geen account nodig.
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
  readonly content: ToolContentCatalog;
  readonly mcps: readonly McpDescription[];
}

/**
 * One card per registered MCP, in registry order. Nothing here is written by
 * hand — the title, the operations and their links all come from the registry —
 * so a new MCP adds itself to the page.
 */
function Mcps({ content, mcps }: McpsProps): ReactNode {
  const toolCount = content.list().length;

  return (
    <Section id="mcps">
      <SectionHeading centered eyebrow="Nu beschikbaar">
        {toolCount === 1
          ? "Er is 1 tool live."
          : `Er zijn ${toolCount} tools live.`}
      </SectionHeading>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {mcps.map((mcp) => (
          <McpCard key={mcp.id} mcp={mcp} />
        ))}
        <AddYourOwnCard />
      </div>
    </Section>
  );
}

/**
 * The card heads with the MCP's title, not its description: a registry
 * description is written for the agent reading the protocol, and runs far too
 * long and too technical to serve as a headline. Each operation is its own
 * link, because every registered operation has a tool page.
 */
function McpCard({ mcp }: { readonly mcp: McpDescription }): ReactNode {
  return (
    <article className={`${card.base()} h-full`}>
      <div className={card.header()}>
        <h3 className={`${card.title()} text-lg`}>{mcp.title}</h3>
        <p className={card.description()}>
          {mcp.operations.length === 1
            ? "1 tool"
            : `${mcp.operations.length} tools`}
        </p>
      </div>
      <div className={card.content()}>
        <ul className="m-0 list-none divide-y divide-separator p-0">
          {mcp.operations.map((operation) => (
            <li key={operation.name}>
              <a
                className="-mx-2 block rounded-lg px-2 py-3 no-underline hover:bg-default"
                href={toolPath(operation.name)}
              >
                <span className="block font-mono text-muted text-xs">
                  {operation.name}
                </span>
                <span className="mt-1 block text-sm">{operation.title}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/**
 * Not an MCP that exists. It is a standing invitation, so the grid reads as a
 * set being built rather than a set with a card missing.
 */
function AddYourOwnCard(): ReactNode {
  return (
    <article
      className={`${card.base()} h-full border border-border border-dashed`}
    >
      <div className={card.header()}>
        <span className={`${chip.base()} w-fit`}>
          <span className={chip.label()}>Nog niet gebouwd</span>
        </span>
        <h3 className={`${card.title()} mt-3 text-lg`}>
          Voeg je eigen Nederlandse databron toe.
        </h3>
      </div>
      <div className={card.content()}>
        <p className={card.description()}>
          OV, boodschappen of postcodes. Het package-contract is klein en de
          review gaat snel.
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
          <a className={buttonClass("primary")} href={REPO_URL}>
            Bekijk de code
          </a>
          <a
            className={buttonClass("outline")}
            href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}
          >
            Voeg een MCP toe
          </a>
        </div>
      </div>
    </Section>
  );
}

function SafeByDesign(): ReactNode {
  return (
    <Section>
      <SectionHeading eyebrow="Veilig ontworpen">
        Elke operatie is read-only, met harde limieten en strikte validatie.
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
