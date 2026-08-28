import type { ReactNode } from "react";

/**
 * Worker route tests render outside the RSC graph, where `import.meta.viteRsc`
 * does not exist. They assert markup, never styling, so the page carries no
 * stylesheet at all.
 */
export function StyleAssets(): ReactNode {
  return null;
}
