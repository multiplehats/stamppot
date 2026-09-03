import type { ReactNode } from "react";
import type { StaticPage } from "./pages";
import {
  buttonClass,
  CONTAINER,
  Section,
  SiteDocument,
  SiteFooter,
  SiteNavigation,
  safeJson,
} from "./site";
import { SITE_NAME, SOCIAL_IMAGE_PATH } from "./urls";

interface StaticPageViewProps {
  readonly origin: string;
  readonly page: StaticPage;
}

/**
 * The prose pages — over, contact, privacy. One column, no cards: these are
 * read start to finish, by a person deciding whether to trust the project and
 * by an agent checking that it is a real one.
 */
export function StaticPageView({
  origin,
  page,
}: StaticPageViewProps): ReactNode {
  const canonicalUrl = `${origin}${page.path}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    description: page.description,
    inLanguage: "nl-NL",
    isPartOf: { "@id": `${origin}/#website` },
    name: page.title,
    publisher: { "@id": `${origin}/#organization` },
    url: canonicalUrl,
  };

  return (
    <SiteDocument
      description={page.description}
      head={
        <>
          <link href={canonicalUrl} rel="canonical" />
          <meta content="website" property="og:type" />
          <meta content={`${page.title} · ${SITE_NAME}`} property="og:title" />
          <meta content={page.description} property="og:description" />
          <meta content={canonicalUrl} property="og:url" />
          <meta content={`${origin}${SOCIAL_IMAGE_PATH}`} property="og:image" />
          <meta content="summary" name="twitter:card" />
          <script type="application/ld+json">{safeJson(structuredData)}</script>
        </>
      }
      title={`${page.title} · ${SITE_NAME}`}
    >
      <SiteNavigation page="tool" />
      <main>
        <section className="border-border border-b py-16">
          <div className={CONTAINER}>
            <h1 className="max-w-3xl text-balance font-semibold text-4xl tracking-tight sm:text-5xl">
              {page.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted">{page.intro}</p>
          </div>
        </section>
        <Section>
          <div className="max-w-2xl">
            {page.sections.map((section) => (
              <section className="mt-12 first:mt-0" key={section.heading}>
                <h2 className="font-semibold text-2xl tracking-tight">
                  {section.heading}
                </h2>
                {section.body.map((paragraph) => (
                  <p
                    className="mt-4 text-muted leading-relaxed"
                    key={paragraph}
                  >
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </Section>
      </main>
      <SiteFooter />
    </SiteDocument>
  );
}

/**
 * The 404 an agent lands on. It names the four places worth trying next, in
 * the same order as the Markdown representation, so neither audience gets a
 * dead end that only says "no".
 */
export function NotFoundPage({ path }: { readonly path: string }): ReactNode {
  const routes = [
    {
      description: "Elke tool met zijn JSON Schema.",
      href: "/v1/tools",
      label: "Alle tools",
    },
    {
      description: "Wanneer je Stamppot gebruikt en hoe je hem aanroept.",
      href: "/llms.txt",
      label: "Overzicht voor agents",
    },
    {
      description: "Elke indexeerbare pagina op deze site.",
      href: "/sitemap.xml",
      label: "Sitemap",
    },
    { description: "Terug naar het begin.", href: "/", label: "Homepage" },
  ];

  return (
    <SiteDocument
      description={`De pagina ${path} bestaat niet op ${SITE_NAME}.`}
      head={<meta content="noindex, follow" name="robots" />}
      title={`Niet gevonden · ${SITE_NAME}`}
    >
      <SiteNavigation page="tool" />
      <main>
        <Section>
          <p className="font-medium text-muted text-sm">404</p>
          <h1 className="mt-3 max-w-3xl text-balance font-semibold text-4xl tracking-tight sm:text-5xl">
            Deze pagina bestaat niet.
          </h1>
          <p className="mt-5 max-w-2xl break-words text-lg text-muted">
            <code className="font-mono">{path}</code> staat niet op deze server.
            Een toolpagina staat altijd op{" "}
            <code className="font-mono">/tools/&lt;naam&gt;</code>.
          </p>
          <ul className="mt-10 grid max-w-2xl list-none gap-px overflow-hidden rounded-xl bg-separator p-0">
            {routes.map((route) => (
              <li key={route.href}>
                <a
                  className="block bg-background p-4 no-underline hover:bg-default"
                  href={route.href}
                >
                  <span className="block font-medium">{route.label}</span>
                  <span className="mt-1 block text-muted text-sm">
                    {route.description}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <a className={`${buttonClass("outline")} mt-10`} href="/#mcps">
            Bekijk alle MCP's
          </a>
        </Section>
      </main>
      <SiteFooter />
    </SiteDocument>
  );
}
