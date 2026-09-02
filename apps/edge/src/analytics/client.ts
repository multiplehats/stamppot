import { createClientAnalytics } from "trakoo/client";
import { OpenPanelClientProvider } from "trakoo/providers/client";
import { stamppotEvents } from "./events";

type BrowserAnalytics = ReturnType<typeof createBrowserAnalytics>;

const clientId = import.meta.env.VITE_OPENPANEL_CLIENT_ID;
const enabled = clientId !== undefined && clientId !== "";

function createBrowserAnalytics() {
  return createClientAnalytics({
    enabled,
    events: stamppotEvents,
    // The provider only exists when there is an id for it; `enabled` alone
    // would still hand OpenPanel's constructor an empty string.
    providers:
      clientId === undefined || clientId === ""
        ? []
        : [new OpenPanelClientProvider({ clientId })],
  });
}

let instance: BrowserAnalytics | undefined;

/**
 * Built on first use rather than at module scope. This module is reachable
 * from `install-card.tsx`, which the RSC pipeline also renders on the server,
 * and nothing analytics-shaped should be constructed during an SSR pass.
 */
function analytics(): BrowserAnalytics {
  instance ??= createBrowserAnalytics();
  return instance;
}

/**
 * Records the current page. `pageView()` reads `location` and `document`
 * itself, so it must run in the browser and needs no arguments.
 */
export function trackPageView(): void {
  if (!enabled) {
    return;
  }
  analytics().pageView();
}

/**
 * The site's one conversion: somebody took an install snippet away with them.
 * Fire-and-forget — a page must never wait on analytics, and `track()` already
 * queues until the provider finishes initializing.
 */
export function trackInstallSnippetCopied(
  client: string,
  placement: "landing" | "tool"
): void {
  if (!enabled) {
    return;
  }
  analytics()
    .track("install_snippet_copied", { client, placement })
    .catch(() => {
      // A dropped analytics event must never surface to a visitor.
    });
}
