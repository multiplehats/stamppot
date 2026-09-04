import type { OperationRegistry } from "@stamppot/core";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ToolContentCatalog, ToolPageContent } from "./content";
import { LandingPage } from "./landing-page";
import type { StaticPage } from "./pages";
import { NotFoundPage, StaticPageView } from "./static-page";
import { ToolPage } from "./tool-page";

const HTML_DOCTYPE = "<!doctype html>";

export function renderLandingPage(
  _request: Request,
  origin: string,
  registry: OperationRegistry
): Promise<Response> {
  return Promise.resolve(
    // No star count in tests: this double stands in for the real renderer
    // precisely so a page render never reaches for the network.
    html(<LandingPage origin={origin} registry={registry} stars={undefined} />)
  );
}

export function renderToolPage(
  _request: Request,
  origin: string,
  content: ToolContentCatalog,
  tool: ToolPageContent
): Promise<Response> {
  return Promise.resolve(
    html(<ToolPage content={content} origin={origin} tool={tool} />)
  );
}

export function renderStaticPage(
  _request: Request,
  origin: string,
  page: StaticPage
): Promise<Response> {
  return Promise.resolve(html(<StaticPageView origin={origin} page={page} />));
}

export function renderNotFoundPage(
  _request: Request,
  path: string
): Promise<Response> {
  return Promise.resolve(html(<NotFoundPage path={path} />));
}

function html(root: ReactNode): Response {
  return new Response(`${HTML_DOCTYPE}${renderToStaticMarkup(root)}`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
