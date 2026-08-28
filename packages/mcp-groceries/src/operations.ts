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
      "Lees de actuele Checkjebon-momentopname om echte Nederlandse boodschappenverpakkingen te vinden. Geeft opties terug gerangschikt op relevantie, de laagste kassaprijs en apart de winnaar op prijs per gewicht, per volume of per stuk. Prijzen zijn indicatief, kunnen per locatie of afrekenmoment verschillen en zeggen niets over voorraad.",
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
    title: "Vind actuele boodschappenopties (alleen-lezen)",
  });

  const planGroceryBasket = defineOperation({
    description:
      "Bereken de prijs van een concreet boodschappenmandje aan de hand van de actuele Checkjebon-momentopname, zonder een offerte of ID aan te maken. Splits de aanvraag voor een gelegenheid eerst op in maximaal 20 specifieke regels en hoeveelheden. Het resultaat rondt verpakkingen naar boven af, meldt eerlijk welke regels niet gevonden zijn, vergelijkt van één winkel tot maximaal het gevraagde aantal winkels en geeft de complete replayInput terug. Stuur bij een vervolgvraag die volledige replayInput opnieuw mee na het aanpassen van de gewenste velden; prijzen kunnen daarbij veranderen omdat replay bewust niet aan een versie is vastgepind.",
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
    title: "Plan een actueel boodschappenmandje (alleen-lezen)",
  });

  const getShoppingList = defineOperation({
    description:
      "Haal één anoniem opgeslagen boodschappenlijstdocument op met de bijbehorende bearer listKey. Lezen verlengt de vervaltermijn van 90 dagen niet en heeft geen toegang tot de boodschappencatalogus. Geef de gewenste onaangevinkte of complete regels apart door aan plan_grocery_basket om de prijs te berekenen. De capability is niet herstelbaar als de client of gebruiker deze kwijtraakt.",
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
    title: "Haal een opgeslagen boodschappenlijst op (alleen-lezen)",
  });

  const saveShoppingList = defineOperation({
    description:
      "Maak een nieuw begrensd anoniem boodschappenlijstdocument aan of vervang een bestaand document. Laat listKey alleen weg om aan te maken; bewaar de teruggegeven capability, want deze kan niet worden hersteld. Roep voordat je een bestaande lijst wijzigt eerst get_shopping_list aan, behoud elke regel die de gebruiker nog wil, bewerk dat complete document en stuur het opnieuw mee met listKey. Vervangen werkt volgens last-write-wins, verlengt de vervaltermijn naar 90 dagen en valt onder een benaderende rate limit tegen misbruik.",
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
    title: "Sla een complete boodschappenlijst op (schrijvend)",
  });

  return [
    findGroceryOptions,
    planGroceryBasket,
    getShoppingList,
    saveShoppingList,
  ];
}
