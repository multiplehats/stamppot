import type { OperationRegistry } from "@stamppot/core";
import { renderToReadableStream } from "@vitejs/plugin-rsc/rsc/server";
import type { ReactNode } from "react";
import { injectRSCPayload } from "rsc-html-stream/server";
import type { ToolContentCatalog, ToolPageContent } from "./content";
import { LandingPage } from "./landing-page";
import type { StaticPage } from "./pages";
import { isRscUrl } from "./routes";
import { NotFoundPage, StaticPageView } from "./static-page";
import { ToolPage } from "./tool-page";

interface SsrEntry {
  readonly renderHtml: (
    rscStream: ReadableStream<Uint8Array>,
    signal: AbortSignal
  ) => Promise<ReadableStream<Uint8Array>>;
}

export function renderLandingPage(
  request: Request,
  origin: string,
  registry: OperationRegistry
): Promise<Response> {
  return renderPage(
    request,
    <LandingPage origin={origin} registry={registry} />
  );
}

export function renderToolPage(
  request: Request,
  origin: string,
  content: ToolContentCatalog,
  tool: ToolPageContent
): Promise<Response> {
  return renderPage(
    request,
    <ToolPage content={content} origin={origin} tool={tool} />
  );
}

export function renderStaticPage(
  request: Request,
  origin: string,
  page: StaticPage
): Promise<Response> {
  return renderPage(request, <StaticPageView origin={origin} page={page} />);
}

export function renderNotFoundPage(
  request: Request,
  path: string
): Promise<Response> {
  return renderPage(request, <NotFoundPage path={path} />);
}

async function renderPage(
  request: Request,
  root: ReactNode
): Promise<Response> {
  const rscStream = renderToReadableStream(root);

  if (isRscUrl(new URL(request.url))) {
    return new Response(rscStream, {
      headers: { "content-type": "text/x-component; charset=utf-8" },
    });
  }

  const [ssrStream, browserStream] = rscStream.tee();
  const ssrEntry = await import.meta.viteRsc.loadModule<SsrEntry>(
    "ssr",
    "index"
  );
  const htmlStream = await ssrEntry.renderHtml(ssrStream, request.signal);

  return new Response(htmlStream.pipeThrough(injectRSCPayload(browserStream)), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
