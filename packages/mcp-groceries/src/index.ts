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
      "Doorzoekt actuele Nederlandse boodschappenverpakkingen en berekent een mandje deterministisch door, plus optionele boodschappenlijsten achter een capability. Agents moeten gelegenheden opdelen in maximaal 20 concrete regels voor het plannen en sturen bij een vervolgvraag de complete replayInput van een resultaat opnieuw mee. Prijzen zijn indicatieve Checkjebon-momentopnames en voorraad is niet gegarandeerd.",
    id: "groceries",
    operations: createGroceryOperations(dependencies),
    title: "Nederlandse boodschappen",
  });
}
