import type { UpstreamCache, UpstreamLimiter } from "./index";

const LOCAL_ANONYMOUS_SOURCE = "local-anonymous";
const BASE64_PADDING_PATTERN = /[=]+$/u;
const textEncoder = new TextEncoder();

type BindingSupplier<T> = () => T;

/**
 * Short-TTL upstream cache over the Workers Cache API. It bounds how often one
 * Cloudflare location can reach an upstream, which is what protects a
 * credentialed upstream's quota and keeps a keyless upstream's use within its
 * fair-use expectations.
 */
export class WorkersCacheUpstreamCache implements UpstreamCache {
  readonly #cacheName: string;
  #cache: Promise<Cache> | undefined;

  constructor(cacheName: string) {
    this.#cacheName = cacheName;
  }

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
    this.#cache ??= caches.open(this.#cacheName);
    return this.#cache;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_PADDING_PATTERN, "");
}

async function limiterHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(value)
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

export interface CloudflareIpRateLimiterOptions {
  readonly keyPrefix: string;
  readonly namespace: string;
}

/** Rate-limits by a one-way digest of the caller's `CF-Connecting-IP`. */
export class CloudflareIpRateLimiter implements UpstreamLimiter {
  readonly #keyPrefix: string;
  readonly #limiter: BindingSupplier<RateLimit>;
  readonly #namespace: string;

  constructor(
    limiter: BindingSupplier<RateLimit>,
    options: CloudflareIpRateLimiterOptions
  ) {
    this.#limiter = limiter;
    this.#keyPrefix = options.keyPrefix;
    this.#namespace = options.namespace;
  }

  async consume(request: Request, scope: string): Promise<boolean> {
    const source =
      request.headers.get("CF-Connecting-IP") ?? LOCAL_ANONYMOUS_SOURCE;
    const hash = await limiterHash(`${this.#namespace}\0${source}`);
    const result = await this.#limiter().limit({
      key: `${this.#keyPrefix}-${scope}:${hash}`,
    });
    return result.success;
  }
}
