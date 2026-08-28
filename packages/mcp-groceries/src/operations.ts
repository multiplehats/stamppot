import { defineOperation, type Operation } from "@stamppot/core";
import {
  CatalogUnavailableError,
  type FindGroceryOptionsInput,
  type FindGroceryOptionsSuccess,
  findGroceryOptionsInputSchema,
  findGroceryOptionsOutputSchema,
  getShoppingListInputSchema,
  getShoppingListOutputSchema,
  listKeySchema,
  type PlanGroceryBasketInput,
  type PlanGroceryBasketSuccess,
  planGroceryBasketInputSchema,
  planGroceryBasketOutputSchema,
  type ShoppingListDocument,
  type ShoppingListEnvelope,
  saveShoppingListInputSchema,
  saveShoppingListOutputSchema,
} from "./contracts";

export interface CatalogCallContext {
  readonly now: Date;
  readonly signal: AbortSignal;
}

export interface GroceryCatalogService {
  readonly planBasket: (
    input: PlanGroceryBasketInput,
    context: CatalogCallContext
  ) => Promise<PlanGroceryBasketSuccess>;
  readonly search: (
    input: FindGroceryOptionsInput,
    context: CatalogCallContext
  ) => Promise<FindGroceryOptionsSuccess>;
}

export interface ShoppingListService {
  readonly create: (
    listKey: string,
    document: ShoppingListDocument,
    now: Date
  ) => Promise<ShoppingListEnvelope | undefined>;
  readonly get: (
    listKey: string,
    now: Date
  ) => Promise<ShoppingListEnvelope | undefined>;
  readonly replace: (
    listKey: string,
    document: ShoppingListDocument,
    now: Date
  ) => Promise<ShoppingListEnvelope | undefined>;
}

export interface ShoppingListWriteLimiter {
  readonly consume: (
    request: Request,
    listKey: string | undefined
  ) => Promise<boolean>;
}

export interface GroceriesMcpDependencies {
  readonly catalog: GroceryCatalogService;
  readonly createListKey: () => string;
  readonly shoppingLists: ShoppingListService;
  readonly writeLimiter: ShoppingListWriteLimiter;
}

function catalogUnavailableResult() {
  return {
    retryable: true,
    status: "catalog_unavailable" as const,
  };
}

function unknownListResult() {
  return {
    retryable: false,
    status: "unknown_list" as const,
  };
}

function genericDependencyFailure(): Error {
  return new Error("Grocery operation dependency failed");
}

export function createGroceryOperations(
  dependencies: GroceriesMcpDependencies
): readonly Operation[] {
  const findGroceryOptions = defineOperation({
    description:
      "Read the current Checkjebon snapshot to find real Dutch grocery packages. Returns relevance-ranked offers, the cheapest checkout price, and separate mass, volume, or each unit-value winners. Prices are indicative, may vary by location or checkout time, and do not guarantee inventory.",
    async execute(context, input) {
      try {
        return await dependencies.catalog.search(input, {
          now: context.now(),
          signal: context.signal,
        });
      } catch (error) {
        if (error instanceof CatalogUnavailableError) {
          return catalogUnavailableResult();
        }
        throw genericDependencyFailure();
      }
    },
    input: findGroceryOptionsInputSchema,
    name: "find_grocery_options",
    output: findGroceryOptionsOutputSchema,
    title: "Find current grocery options (read-only)",
  });

  const planGroceryBasket = defineOperation({
    description:
      "Price a concrete grocery basket against the current Checkjebon snapshot without creating a quote or ID. For an occasion, first decompose the request into at most 20 specific lines and quantities. The result rounds up sale packages, reports unmatched lines honestly, compares one store with up to the requested store limit, and returns complete replayInput. For a follow-up, resend that entire replayInput after editing the desired fields; prices may refresh because replay is intentionally not version-pinned.",
    async execute(context, input) {
      try {
        return await dependencies.catalog.planBasket(input, {
          now: context.now(),
          signal: context.signal,
        });
      } catch (error) {
        if (error instanceof CatalogUnavailableError) {
          return catalogUnavailableResult();
        }
        throw genericDependencyFailure();
      }
    },
    input: planGroceryBasketInputSchema,
    name: "plan_grocery_basket",
    output: planGroceryBasketOutputSchema,
    title: "Plan a current grocery basket (read-only)",
  });

  const getShoppingList = defineOperation({
    description:
      "Read one anonymous saved shopping-list document using its bearer listKey. Reads do not extend the 90-day expiry and do not access the grocery catalog. To price the desired unchecked or complete lines, pass them separately to plan_grocery_basket. The capability is unrecoverable if the client or user loses it.",
    async execute(context, input) {
      try {
        const envelope = await dependencies.shoppingLists.get(
          input.listKey,
          context.now()
        );
        if (envelope === undefined) {
          return unknownListResult();
        }
        return {
          ...envelope,
          listKey: input.listKey,
          status: "ok" as const,
        };
      } catch {
        // biome-ignore lint/style/useErrorCause: Dependency details and capabilities must never cross this public error boundary.
        throw genericDependencyFailure();
      }
    },
    input: getShoppingListInputSchema,
    name: "get_shopping_list",
    output: getShoppingListOutputSchema,
    title: "Get a saved shopping list (read-only)",
  });

  const saveShoppingList = defineOperation({
    description:
      "Create or replace one bounded anonymous shopping-list document. Omit listKey only to create; retain the returned capability because it cannot be recovered. Before changing an existing list, call get_shopping_list, preserve every line the user still wants, edit that complete document, and resend it with listKey. Replacement is last-write-wins, extends expiry to 90 days, and is subject to an approximate abuse rate limit.",
    async execute(context, input) {
      try {
        const isAllowed = await dependencies.writeLimiter.consume(
          context.request,
          input.listKey
        );
        if (!isAllowed) {
          return {
            retryAfterSeconds: 60 as const,
            retryable: true,
            status: "rate_limited" as const,
          };
        }

        const now = context.now();
        if (input.listKey !== undefined) {
          const envelope = await dependencies.shoppingLists.replace(
            input.listKey,
            input.document,
            now
          );
          if (envelope === undefined) {
            return unknownListResult();
          }
          return {
            ...envelope,
            listKey: input.listKey,
            status: "ok" as const,
          };
        }

        const listKey = dependencies.createListKey();
        if (!listKeySchema.safeParse(listKey).success) {
          throw genericDependencyFailure();
        }
        const envelope = await dependencies.shoppingLists.create(
          listKey,
          input.document,
          now
        );
        if (envelope === undefined) {
          throw genericDependencyFailure();
        }
        return {
          ...envelope,
          listKey,
          status: "ok" as const,
        };
      } catch {
        // biome-ignore lint/style/useErrorCause: Dependency details and capabilities must never cross this public error boundary.
        throw genericDependencyFailure();
      }
    },
    input: saveShoppingListInputSchema,
    name: "save_shopping_list",
    output: saveShoppingListOutputSchema,
    title: "Save a complete shopping list (mutating)",
  });

  return [
    findGroceryOptions,
    planGroceryBasket,
    getShoppingList,
    saveShoppingList,
  ];
}
