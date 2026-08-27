import type { OperationRegistry } from "@stamppot/core";
import { renderToReadableStream } from "@vitejs/plugin-rsc/rsc/server";
import type { ReactNode } from "react";
import { injectRSCPayload } from "rsc-html-stream/server";
import type { ToolContentCatalog, ToolPageContent } from "./content";
import { LandingPage } from "./landing-page";
import { isRscUrl } from "./routes";
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
  registry: OperationRegistry,
  content: ToolContentCatalog
): Promise<Response> {
  return renderPage(
    request,
    <LandingPage content={content} origin={origin} registry={registry} />
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
