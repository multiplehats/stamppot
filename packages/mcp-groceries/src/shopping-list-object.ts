import { DurableObject } from "cloudflare:workers";
import {
  type ShoppingListDocument,
  type ShoppingListEnvelope,
  shoppingListDocumentSchema,
  shoppingListEnvelopeSchema,
} from "./contracts";

const SHOPPING_LIST_STORAGE_KEY = "shopping-list";
const SHOPPING_LIST_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function validNow(now: Date): Date {
  if (!(now instanceof Date && Number.isFinite(now.getTime()))) {
    throw new Error("Shopping-list operation requires a valid instant");
  }
  return now;
}

function createEnvelope(
  document: ShoppingListDocument,
  now: Date
): ShoppingListEnvelope {
  const savedAt = validNow(now);
  return shoppingListEnvelopeSchema.parse({
    document: shoppingListDocumentSchema.parse(document),
    expiresAt: new Date(savedAt.getTime() + SHOPPING_LIST_TTL_MS).toISOString(),
    savedAt: savedAt.toISOString(),
  });
}

export class ShoppingListObject extends DurableObject<CloudflareBindings> {
  async get(now: Date): Promise<ShoppingListEnvelope | undefined> {
    const requestedAt = validNow(now);
    const stored = await this.ctx.storage.get(SHOPPING_LIST_STORAGE_KEY);
    if (stored === undefined) {
      return undefined;
    }
    const envelope = shoppingListEnvelopeSchema.parse(stored);
    if (Date.parse(envelope.expiresAt) <= requestedAt.getTime()) {
      await this.ctx.storage.delete(SHOPPING_LIST_STORAGE_KEY);
      return undefined;
    }
    return envelope;
  }

  async create(
    document: ShoppingListDocument,
    now: Date
  ): Promise<ShoppingListEnvelope | undefined> {
    const existing = await this.ctx.storage.get(SHOPPING_LIST_STORAGE_KEY);
    if (existing !== undefined) {
      return undefined;
    }
    return this.#save(document, now);
  }

  async replace(
    document: ShoppingListDocument,
    now: Date
  ): Promise<ShoppingListEnvelope | undefined> {
    const requestedAt = validNow(now);
    const stored = await this.ctx.storage.get(SHOPPING_LIST_STORAGE_KEY);
    if (stored === undefined) {
      return undefined;
    }
    const existing = shoppingListEnvelopeSchema.parse(stored);
    if (Date.parse(existing.expiresAt) <= requestedAt.getTime()) {
      await this.ctx.storage.delete(SHOPPING_LIST_STORAGE_KEY);
      return undefined;
    }
    return this.#save(document, requestedAt);
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.delete(SHOPPING_LIST_STORAGE_KEY);
    await this.ctx.storage.deleteAlarm();
  }

  async #save(
    document: ShoppingListDocument,
    now: Date
  ): Promise<ShoppingListEnvelope> {
    const envelope = createEnvelope(document, now);
    await this.ctx.storage.put(SHOPPING_LIST_STORAGE_KEY, envelope);
    await this.ctx.storage.setAlarm(new Date(envelope.expiresAt));
    return envelope;
  }
}
