import { NsClient } from "./ns-client";
import type { OvMcpDependencies, OvUpstreamLimiter } from "./operations";
import { OvApiClient } from "./ovapi-client";
import { StopDirectory, type StopsObjectStore } from "./stops-directory";
import { bytesToBase64Url, MAX_STOPS_OBJECT_BYTES } from "./stops-format";
import type { UpstreamCache } from "./upstream";

const UPSTREAM_LIMIT_NAMESPACE = "stamppot:ov:upstream:v1";
const UPSTREAM_CACHE_NAME = "stamppot-ov-upstream-v1";
const LOCAL_ANONYMOUS_SOURCE = "local-anonymous";
const textEncoder = new TextEncoder();

type BindingSupplier<T> = () => T;

/**
 * `wrangler types` only emits secret keys when a `.dev.vars` file exists, so
 * the Worker's generated bindings interface cannot be relied on for one.
 */
interface OvSecretBindings {
  readonly NS_API_KEY?: string;
}

export class R2StopsObjectStore implements StopsObjectStore {
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
    if (object.size > MAX_STOPS_OBJECT_BYTES) {
      throw new Error("Stops object exceeds the runtime size bound");
    }
    const body = await object.arrayBuffer();
    signal?.throwIfAborted();
    if (body.byteLength > MAX_STOPS_OBJECT_BYTES) {
      throw new Error("Stops object exceeds the runtime size bound");
    }
    return JSON.parse(new TextDecoder().decode(body));
  }
}

/**
 * Short-TTL upstream cache over the Workers Cache API. It bounds how often one
 * Cloudflare location can reach an upstream, which is what protects the NS key
 * quota and keeps OVapi use within its fair-use expectations.
 */
export class WorkersCacheUpstreamCache implements UpstreamCache {
  #cache: Promise<Cache> | undefined;

  async read(url: string, signal: AbortSignal): Promise<string | undefined> {
    signal.throwIfAborted();
    const cache = await this.#open();
    const cached = await cache.match(new Request(url));
    if (cached === undefined) {
      return undefined;
    }
    signal.throwIfAborted();
    return await cached.text();
  }

  async write(url: string, body: string, ttlSeconds: number): Promise<void> {
    const cache = await this.#open();
    await cache.put(
      new Request(url),
      new Response(body, {
        headers: {
          "cache-control": `max-age=${ttlSeconds}`,
          "content-type": "application/json",
        },
      })
    );
  }

  #open(): Promise<Cache> {
    this.#cache ??= caches.open(UPSTREAM_CACHE_NAME);
    return this.#cache;
  }
}

async function limiterHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(value)
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

export class CloudflareOvUpstreamLimiter implements OvUpstreamLimiter {
  readonly #limiter: BindingSupplier<RateLimit>;

  constructor(limiter: BindingSupplier<RateLimit>) {
    this.#limiter = limiter;
  }

  async consume(request: Request, scope: string): Promise<boolean> {
    const source =
      request.headers.get("CF-Connecting-IP") ?? LOCAL_ANONYMOUS_SOURCE;
    const key = await limiterHash(`${UPSTREAM_LIMIT_NAMESPACE}\0${source}`);
    const result = await this.#limiter().limit({ key: `ov-${scope}:${key}` });
    return result.success;
  }
}

export function createCloudflareOvDependencies(
  bindings: BindingSupplier<CloudflareBindings>
): OvMcpDependencies {
  const cache = new WorkersCacheUpstreamCache();
  return {
    stopDepartures: new OvApiClient({ cache }),
    stopDirectory: new StopDirectory(
      new R2StopsObjectStore(() => bindings().OV_STOPS)
    ),
    trains: new NsClient({
      apiKey: () =>
        (bindings() as CloudflareBindings & OvSecretBindings).NS_API_KEY,
      cache,
    }),
    upstreamLimiter: new CloudflareOvUpstreamLimiter(
      () => bindings().OV_UPSTREAM_READS
    ),
  };
}
