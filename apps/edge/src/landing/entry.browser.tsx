import { createFromReadableStream } from "@vitejs/plugin-rsc/browser";
import type { ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { rscStream } from "rsc-html-stream/client";
import { trackPageView } from "../analytics/client";

const root = await createFromReadableStream<ReactNode>(rscStream);
hydrateRoot(document, root);

// After hydration and deliberately not awaited: loading OpenPanel must never
// sit between a visitor and an interactive page. Every page is a full document
// load — there is no client router — so one call per entry is one page view.
trackPageView();
