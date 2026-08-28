import type { ReactNode } from "react";
import "./styles.css";

/**
 * The page stylesheet, as a `<link>` the RSC build resolves to its hashed
 * asset. Importing the CSS for its side effect is what puts it in the graph;
 * `loadCss` is what turns that into a tag the document can carry.
 */
export function StyleAssets(): ReactNode {
  return import.meta.viteRsc.loadCss();
}
