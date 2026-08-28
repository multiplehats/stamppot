import { defineMcp, type McpDefinition } from "@stamppot/core";
import {
  createGroceryOperations,
  type GroceriesMcpDependencies,
} from "./operations";

export type { CatalogObjectStore } from "./catalog";
// biome-ignore lint/performance/noBarrelFile: This package entrypoint defines the supported catalog API.
export {
  GroceryCatalog,
  MemoryCatalogObjectStore,
} from "./catalog";
export type {
  FindGroceryOptionsInput,
  PlanGroceryBasketInput,
  ShoppingListDocument,
  ShoppingListEnvelope,
} from "./contracts";
export {
  CatalogUnavailableError,
  findGroceryOptionsInputSchema,
  findGroceryOptionsOutputSchema,
  getShoppingListInputSchema,
  getShoppingListOutputSchema,
  LIST_KEY_PATTERN,
  MAX_SHOPPING_LIST_BYTES,
  planGroceryBasketInputSchema,
  planGroceryBasketOutputSchema,
  saveShoppingListInputSchema,
  saveShoppingListOutputSchema,
  shoppingListDocumentSchema,
} from "./contracts";
export type {
  GroceriesMcpDependencies,
  GroceryCatalogService,
  ShoppingListService,
  ShoppingListWriteLimiter,
} from "./operations";

export function createGroceriesMcp(
  dependencies: GroceriesMcpDependencies
): McpDefinition {
  return defineMcp({
    description:
      "Current Dutch grocery package search and deterministic basket costing, plus optional capability-held shopping lists. Agents should decompose occasions into at most 20 concrete lines before planning and resend a result's complete replayInput for follow-ups. Prices are indicative Checkjebon snapshots and inventory is not guaranteed.",
    id: "groceries",
    operations: createGroceryOperations(dependencies),
    title: "Dutch groceries",
  });
}
