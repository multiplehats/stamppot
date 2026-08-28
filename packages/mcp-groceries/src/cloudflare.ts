import { type CatalogObjectStore, GroceryCatalog } from "./catalog";
import { bytesToBase64Url, MAX_CATALOG_OBJECT_BYTES } from "./catalog-format";
import {
  listKeySchema,
  type ShoppingListDocument,
  type ShoppingListEnvelope,
} from "./contracts";
import type {
  GroceriesMcpDependencies,
  ShoppingListService,
  ShoppingListWriteLimiter,
} from "./operations";
import type { ShoppingListObject } from "./shopping-list-object";

const CREATION_LIMIT_NAMESPACE = "stamppot:shopping-list:create:v1";
const REPLACEMENT_LIMIT_NAMESPACE = "stamppot:shopping-list:replace:v1";
const LOCAL_ANONYMOUS_SOURCE = "local-anonymous";
const textEncoder = new TextEncoder();

type BindingSupplier<T> = () => T;

export class R2CatalogObjectStore implements CatalogObjectStore {
  readonly #bucket: BindingSupplier<R2Bucket>;

  constructor(bucket: BindingSupplier<R2Bucket>) {
    this.#bucket = bucket;
  }

  async getJson(key: string, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const object = await this.#bucket().get(key);
    signal?.throwIfAborted();
    if (object === null) {
      return undefined;
    }
    if (object.size > MAX_CATALOG_OBJECT_BYTES) {
      throw new Error("Catalog object exceeds the runtime size bound");
    }
    const body = await object.arrayBuffer();
    signal?.throwIfAborted();
    if (body.byteLength > MAX_CATALOG_OBJECT_BYTES) {
      throw new Error("Catalog object exceeds the runtime size bound");
    }
    return JSON.parse(new TextDecoder().decode(body));
  }
}

export class DurableObjectShoppingListService implements ShoppingListService {
  readonly #namespace: BindingSupplier<
    DurableObjectNamespace<ShoppingListObject>
  >;

  constructor(
    namespace: BindingSupplier<DurableObjectNamespace<ShoppingListObject>>
  ) {
    this.#namespace = namespace;
  }

  create(
    listKey: string,
    document: ShoppingListDocument,
    now: Date
  ): Promise<ShoppingListEnvelope | undefined> {
    return this.#stub(listKey).create(document, now);
  }

  get(listKey: string, now: Date): Promise<ShoppingListEnvelope | undefined> {
    return this.#stub(listKey).get(now);
  }

  replace(
    listKey: string,
    document: ShoppingListDocument,
    now: Date
  ): Promise<ShoppingListEnvelope | undefined> {
    return this.#stub(listKey).replace(document, now);
  }

  #stub(listKey: string): DurableObjectStub<ShoppingListObject> {
    const validListKey = listKeySchema.parse(listKey);
    return this.#namespace().getByName(validListKey);
  }
}

async function limiterHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(value)
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

export class CloudflareShoppingListWriteLimiter
  implements ShoppingListWriteLimiter
{
  readonly #limiter: BindingSupplier<RateLimit>;

  constructor(limiter: BindingSupplier<RateLimit>) {
    this.#limiter = limiter;
  }

  async consume(
    request: Request,
    listKey: string | undefined
  ): Promise<boolean> {
    const source =
      listKey === undefined
        ? (request.headers.get("CF-Connecting-IP") ?? LOCAL_ANONYMOUS_SOURCE)
        : listKeySchema.parse(listKey);
    const namespace =
      listKey === undefined
        ? CREATION_LIMIT_NAMESPACE
        : REPLACEMENT_LIMIT_NAMESPACE;
    const operation = listKey === undefined ? "create" : "replace";
    const key = await limiterHash(`${namespace}\0${source}`);
    const result = await this.#limiter().limit({
      key: `groceries-list-${operation}:${key}`,
    });
    return result.success;
  }
}

export function createListKey(): string {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  return `lst_${bytesToBase64Url(randomBytes)}`;
}

export function createCloudflareGroceriesDependencies(
  bindings: BindingSupplier<CloudflareBindings>
): GroceriesMcpDependencies {
  return {
    catalog: new GroceryCatalog(
      new R2CatalogObjectStore(() => bindings().GROCERIES_CATALOG)
    ),
    createListKey,
    shoppingLists: new DurableObjectShoppingListService(
      () => bindings().SHOPPING_LISTS
    ),
    writeLimiter: new CloudflareShoppingListWriteLimiter(
      () => bindings().SHOPPING_LIST_WRITES
    ),
  };
}

// biome-ignore lint/performance/noBarrelFile: The Worker must export this Durable Object class from the package's Cloudflare entry point.
export { ShoppingListObject } from "./shopping-list-object";
