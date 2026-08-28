import type { McpDescription, OperationRegistry } from "@stamppot/core";
import type { ReactNode } from "react";
import type { ToolContentCatalog } from "./content";
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

interface LandingPageProps {
  readonly content: ToolContentCatalog;
  readonly origin: string;
  readonly registry: OperationRegistry;
}

const EYEBROW_ON_FELT =
  "font-display font-extrabold text-ash text-caption uppercase tracking-[0.08em]";
const EYEBROW_ON_CARD =
  "font-display font-extrabold text-caption text-graphite uppercase tracking-[0.08em]";

const PILL = "flex h-14 items-center rounded-pill px-9 max-sm:h-12 max-sm:px-7";
const PILL_LABEL = "font-display font-extrabold text-[16px] leading-[20px]";

/** The second reason names a real domain endpoint, so it cannot go stale. */
function reasons(sampleMcpId: string) {
  return [
    {
      accent: "text-signal-red",
      body: "Point your client at the URL and start calling.",
      number: "01",
      title: "Nothing to set up",
    },
    {
      accent: "text-royal-violet",
      body: `Connect /mcp for every server, or /mcp/${sampleMcpId} for one.`,
      number: "02",
      title: "Combined endpoint, or one domain on its own",
    },
    {
      accent: "text-antique-gold",
      body: "Both transports call the same operation, so the schemas always match.",
      number: "03",
      title: "MCP and plain JSON, from one definition",
    },
  ] as const;
}

const GUARANTEES = [
  {
    body: "Nothing an agent calls here can write, delete or spend.",
    title: "Read-only, every operation",
  },
  {
    body: "No account means nothing to attach a log to.",
    title: "No request data stored",
  },
  {
    body: "Every new operation has to declare its limits before it ships.",
    title: "Bounded input, response, time and complexity",
  },
  {
    body: "Malformed input is rejected before it reaches the tool body.",
    title: "Validated schemas, rejected at the edge",
  },
] as const;

/** Cards strewn across the felt behind the hero, anchored to the viewport edges. */
const SCATTER = [
  { className: "-left-[60px] top-24 rotate-[-13deg] bg-card", inner: false },
  { className: "top-[398px] left-[78px] rotate-[9deg] bg-lemon", inner: true },
  { className: "-left-24 top-[520px] rotate-[6deg] bg-card", inner: false },
  {
    className: "-right-[50px] top-[60px] rotate-[11deg] bg-card",
    inner: false,
  },
  {
    className:
      "top-[330px] right-[62px] rotate-[-7deg] shadow-[inset_0_0_0_2px_var(--color-signal-red)]",
    inner: true,
  },
  {
    className: "-right-[82px] top-[530px] rotate-[-14deg] bg-lavender",
    inner: false,
  },
  { className: "top-[646px] right-[110px] rotate-[5deg] bg-card", inner: true },
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
      description="Free, authless and open-source MCP servers for Dutch data."
      title="Stamppot — MCP servers for Dutch data"
    >
      <SiteNavigation page="landing" />
      <main>
        <Hero origin={origin} />
        <Why sampleMcpId={firstMcp?.id ?? "groceries"} />
        <Deck content={content} mcps={mcps} />
        <OpenSource />
        <SafeByDesign />
      </main>
      <SiteFooter />
    </SiteDocument>
  );
}

function Hero({ origin }: { readonly origin: string }): ReactNode {
  return (
    <section className="relative bg-felt px-[120px] pt-[100px] pb-[140px] max-sm:px-6 max-sm:pt-12 max-sm:pb-16 max-[1100px]:px-16 max-[1100px]:pt-16 max-[1100px]:pb-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 select-none overflow-hidden max-[1024px]:hidden"
      >
        {SCATTER.map((card) => (
          <span
            className={`absolute h-[262px] w-[190px] rounded-card ${card.className} ${
              card.inner ? "max-[1439px]:hidden" : ""
            }`}
            key={card.className}
          />
        ))}
      </div>

      <div className="relative mx-auto flex w-full max-w-page flex-col items-center text-center">
        <img
          alt="A bowl of stamppot"
          className="h-[97px] w-24"
          height={97}
          src="/stamppot-bowl.png"
          width={96}
        />
        <h1 className="mt-10 max-w-[1000px] font-display font-extrabold text-card text-display-lg">
          MCP servers for Dutch data. No account needed.
        </h1>
        <p className="mt-8 max-w-[660px] font-extrabold text-card text-subheading leading-[1.6]">
          Free, open source and authless. Connect every server at one endpoint,
          or connect one on its own.
        </p>
        <div className="mt-10 flex items-center gap-4 max-sm:flex-col max-sm:gap-3">
          <a
            className={`${PILL} ${PILL_LABEL} bg-card text-felt no-underline`}
            href="#deck"
          >
            Connect an MCP
          </a>
          <a
            className={`${PILL} ${PILL_LABEL} text-card no-underline shadow-[inset_0_0_0_2px_var(--color-card)]`}
            href="/v1/tools"
          >
            Browse the tools
          </a>
        </div>
        <InstallCard
          className="mt-14 w-[680px] max-w-full rotate-[-1.5deg]"
          eyebrow="Connect your agent"
          options={installOptions({
            endpoint: `${origin}/mcp`,
            serverName: "stamppot",
            theme: "light",
          })}
          tone="card"
        />
      </div>
    </section>
  );
}

function Why({ sampleMcpId }: { readonly sampleMcpId: string }): ReactNode {
  return (
    <DeckSection className="bg-card">
      <div className="flex items-start gap-[100px] max-[900px]:flex-col max-[900px]:gap-10">
        <div className="flex w-[420px] shrink-0 flex-col gap-6 max-[900px]:w-full">
          <p className={EYEBROW_ON_CARD}>Why</p>
          <h2 className="font-display font-extrabold text-display-sm text-felt">
            Dutch open data, one URL away.
          </h2>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {reasons(sampleMcpId).map((reason, index) => (
            <div
              className={`flex items-start gap-7 max-sm:gap-4 ${
                index === 0
                  ? "pt-2 pb-9"
                  : "border-felt border-t-2 py-9 max-sm:py-7"
              }`}
              key={reason.number}
            >
              <span
                className={`w-[52px] shrink-0 font-display font-extrabold text-heading-sm max-sm:w-9 ${reason.accent}`}
              >
                {reason.number}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
                <h3 className="font-display font-extrabold text-felt text-heading">
                  {reason.title}
                </h3>
                <p className="font-extrabold text-body text-charcoal">
                  {reason.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DeckSection>
  );
}

/** Three cards fill the deck row; fewer than that and the row is centred. */
const FULL_ROW = 3;

interface DeckProps {
  readonly content: ToolContentCatalog;
  readonly mcps: readonly McpDescription[];
}

/**
 * One card per registered MCP, in registry order. Nothing here is written by
 * hand: the badge, headline, operations and link all come from the registry and
 * the compiled content, so a new MCP adds itself to the page.
 */
function Deck({ content, mcps }: DeckProps): ReactNode {
  const toolCount = content.list().length;
  // The contribute card always rides at the end of the row.
  const cardCount = mcps.length + 1;
  // A short deck narrows rather than leaving a gap where a card should be.
  const grid =
    cardCount >= FULL_ROW
      ? "grid-cols-3 max-[1100px]:grid-cols-2 max-[720px]:grid-cols-1"
      : "mx-auto max-w-[800px] grid-cols-2 max-[720px]:grid-cols-1";

  return (
    <DeckSection className="bg-felt" id="deck">
      <div className="flex flex-col items-center gap-6 text-center">
        <p className={EYEBROW_ON_FELT}>Available now</p>
        <h2 className="max-w-[900px] font-display font-extrabold text-card text-display">
          {toolCount === 1
            ? "One tool is live."
            : `${toolCount} tools are live.`}
        </h2>
      </div>
      <div className={`relative mt-16 grid gap-5 ${grid}`}>
        {mcps.map((mcp) => (
          <DeckCard content={content} key={mcp.id} mcp={mcp} />
        ))}
        <AddYourOwnCard />
        <MoreToCome />
      </div>
    </DeckSection>
  );
}

interface DeckCardProps {
  readonly content: ToolContentCatalog;
  readonly mcp: McpDescription;
}

function DeckCard({ content, mcp }: DeckCardProps): ReactNode {
  const suit = deckSuit(mcp.id);
  const [firstOperation] = mcp.operations;
  const tool =
    firstOperation === undefined ? undefined : content.get(firstOperation.name);

  return (
    <article
      className={`relative flex h-[580px] flex-col overflow-clip rounded-card-lg p-8 ${suit.face}`}
    >
      <span
        className={`flex h-9 w-fit items-center rounded-pill px-[18px] font-display font-extrabold text-[13px] leading-[18px] tracking-[0.06em] ${suit.badgeFill} ${suit.badgeText}`}
      >
        {mcpBadge(mcp.id)}
      </span>
      <h3
        className={`mt-6 font-display font-extrabold text-heading-lg ${suit.faceText}`}
      >
        {mcp.description}
      </h3>
      <dl className="absolute top-[300px] left-11 w-[250px] rotate-[-5deg] rounded-card bg-card p-5">
        {mcp.operations.map((operation) => (
          <div className="grid gap-[6px]" key={operation.name}>
            <dt className="font-display font-extrabold text-[11px] text-graphite leading-[18px] tracking-[0.08em]">
              {operation.name.toUpperCase()}
            </dt>
            <dd className="m-0 font-display font-extrabold text-[15px] text-felt leading-[25px]">
              {operation.title}
            </dd>
          </div>
        ))}
      </dl>
      {tool === undefined ? null : (
        <a
          className={`absolute right-8 bottom-8 flex items-center gap-[10px] font-display font-extrabold text-subheading no-underline hover:underline ${suit.faceText}`}
          href={toolPath(tool.operationName)}
        >
          Read
          <ArrowBadge />
        </a>
      )}
    </article>
  );
}

/**
 * Not an MCP that exists. It is a standing invitation, so the row reads as a
 * set being built rather than a set with a card missing.
 */
function AddYourOwnCard(): ReactNode {
  return (
    <a
      className="relative flex h-[580px] flex-col rounded-card-lg p-8 no-underline shadow-[inset_0_0_0_2px_var(--color-hairline)]"
      href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}
    >
      <span className="flex h-9 w-fit items-center rounded-pill px-[18px] font-display font-extrabold text-[13px] text-smoke leading-[18px] tracking-[0.06em] shadow-[inset_0_0_0_2px_var(--color-hairline)]">
        NOT BUILT YET
      </span>
      <h3 className="mt-6 font-display font-extrabold text-card text-heading-lg">
        Add your own Dutch data source.
      </h3>
      <p className="mt-6 max-w-[280px] text-body text-smoke leading-[1.65]">
        Transit, groceries or postcodes. The package contract is small and the
        review is quick.
      </p>
      <span className="absolute right-8 bottom-8 flex items-center gap-[10px] font-display font-extrabold text-card text-subheading">
        Contribute
        <ArrowBadge />
      </span>
    </a>
  );
}

function ArrowBadge(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height="26"
      viewBox="0 0 26 26"
      width="26"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="13" cy="13" r="12" stroke="currentColor" strokeWidth="2" />
      <path
        d="M9.5 16.5L16.5 9.5M16.5 9.5H10.5M16.5 9.5V15.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function MoreToCome(): ReactNode {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -top-[70px] -right-[58px] grid size-[140px] rotate-[12deg] place-items-center max-[1100px]:hidden"
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0"
        height="140"
        viewBox="0 0 140 140"
        width="140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon
          fill="var(--color-card)"
          points="70,2 79,20 96,10 99,29 118,25 115,44 134,46 124,62 140,70 124,78 134,94 115,96 118,115 99,111 96,130 79,120 70,138 61,120 44,130 41,111 22,115 25,96 6,94 16,78 0,70 16,62 6,46 25,44 22,25 41,29 44,10 61,20"
        />
      </svg>
      <span className="relative w-[100px] text-center font-display font-extrabold text-[16px] text-felt leading-[21px] tracking-[-0.01em]">
        More to come!
      </span>
    </div>
  );
}

function OpenSource(): ReactNode {
  return (
    <DeckSection className="bg-card">
      <div className="flex flex-col items-center text-center">
        <p className={EYEBROW_ON_CARD}>Open source</p>
        <h2 className="mt-6 max-w-[860px] font-display font-extrabold text-display text-felt">
          Read the code, fork it, run your own copy.
        </h2>
        <p className="mt-7 max-w-[640px] font-extrabold text-body text-charcoal leading-[1.75]">
          Apache-2.0, on one Cloudflare Worker. Every operation, schema and
          content file lives in the open.
        </p>
        <div className="mt-12 flex items-center gap-4 max-sm:flex-col max-sm:gap-3">
          <a
            className={`${PILL} ${PILL_LABEL} bg-felt text-card no-underline`}
            href={REPO_URL}
          >
            Read the source
          </a>
          <a
            className={`${PILL} ${PILL_LABEL} text-felt no-underline shadow-[inset_0_0_0_2px_var(--color-felt)]`}
            href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}
          >
            Add an MCP
          </a>
        </div>
      </div>
    </DeckSection>
  );
}

function SafeByDesign(): ReactNode {
  return (
    <DeckSection className="overflow-clip bg-felt">
      <div className="flex items-start gap-[100px] max-[900px]:flex-col max-[900px]:gap-10">
        <div className="flex w-[460px] shrink-0 flex-col gap-6 max-[900px]:w-full">
          <p className={EYEBROW_ON_FELT}>Safe by design</p>
          <h2 className="font-display font-extrabold text-card text-display-sm">
            Every operation is read-only, bounded and validated.
          </h2>
          <div
            aria-hidden="true"
            className="relative mt-11 h-[210px] w-[400px] max-w-full max-sm:hidden"
          >
            <span className="absolute top-[10px] left-0 h-[200px] w-[150px] rotate-[-8deg] rounded-card bg-card" />
            <span className="absolute top-0 left-[120px] h-[200px] w-[150px] rotate-[4deg] rounded-card bg-lemon" />
            <span className="absolute top-4 left-[240px] h-[200px] w-[150px] rotate-[-3deg] rounded-card shadow-[inset_0_0_0_2px_var(--color-signal-red)]" />
          </div>
        </div>
        <ul className="flex min-w-0 flex-1 list-none flex-col p-0">
          {GUARANTEES.map((guarantee) => (
            <li
              className="flex items-start gap-6 pt-2 pb-7"
              key={guarantee.title}
            >
              <span
                aria-hidden="true"
                className="mt-[11px] size-2 shrink-0 rounded-full bg-card"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <h3 className="font-display font-extrabold text-card text-subheading">
                  {guarantee.title}
                </h3>
                <p className="font-extrabold text-body-sm text-smoke">
                  {guarantee.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </DeckSection>
  );
}
