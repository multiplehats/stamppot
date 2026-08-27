import type { OperationRegistry } from "@stamppot/core";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ToolContentCatalog, ToolPageContent } from "./content";
import { LandingPage } from "./landing-page";
import { ToolPage } from "./tool-page";

const HTML_DOCTYPE = "<!doctype html>";

export function renderLandingPage(
  _request: Request,
  origin: string,
  registry: OperationRegistry,
  content: ToolContentCatalog
): Promise<Response> {
  return Promise.resolve(
    html(<LandingPage content={content} origin={origin} registry={registry} />)
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

function html(root: ReactNode): Response {
  return new Response(`${HTML_DOCTYPE}${renderToStaticMarkup(root)}`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
