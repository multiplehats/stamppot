const MAX_UPSTREAM_BODY_BYTES = 8 * 1024 * 1024;
const WHITESPACE_PATTERN = /\s+/g;
const COLONLESS_OFFSET_PATTERN = /^(.*T[\d:.]+)([+-])(\d{2})(\d{2})$/;
const CANONICAL_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DEFAULT_JSON_ACCEPT = "application/json";
const DEFAULT_TEXT_ACCEPT = "text/html";

export type UpstreamFetch = (
  input: string,
  init: RequestInit
) => Promise<Response>;

/** Late-bound so a test that replaces the global `fetch` is honoured. */
export const globalUpstreamFetch: UpstreamFetch = (input, init) =>
  fetch(input, init);

export interface UpstreamCache {
  readonly read: (
    url: string,
    signal: AbortSignal
  ) => Promise<string | undefined>;
  readonly write: (
    url: string,
    body: string,
    ttlSeconds: number
  ) => Promise<void>;
}

/** A cache that never remembers anything and never fails a write. */
export const noUpstreamCache: UpstreamCache = {
  read: () => Promise.resolve(undefined),
  write: () => Promise.resolve(),
};

/** Rate-limits an upstream-reaching request within a named scope. */
export interface UpstreamLimiter {
  readonly consume: (request: Request, scope: string) => Promise<boolean>;
}

/** The upstream answered too slowly, unreachably, or with an unusable body. */
export class UpstreamUnavailableError extends Error {
  constructor() {
    super("Upstream is unavailable");
    this.name = "UpstreamUnavailableError";
  }
}

/** Non-2xx upstream answer. It never escapes the client that raised it. */
export class UpstreamStatusError extends Error {
  readonly location: string | undefined;
  readonly status: number;

  constructor(status: number, location?: string) {
    super(`Upstream answered with HTTP ${status}`);
    this.name = "UpstreamStatusError";
    this.location = location;
    this.status = status;
  }
}

export class MemoryUpstreamCache implements UpstreamCache {
  readonly reads: string[] = [];
  readonly writes: string[] = [];
  readonly #entries = new Map<string, { body: string; expiresAtMs: number }>();
  readonly #now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.#now = now;
  }

  read(url: string, signal: AbortSignal): Promise<string | undefined> {
    signal.throwIfAborted();
    this.reads.push(url);
    const entry = this.#entries.get(url);
    if (entry === undefined) {
      return Promise.resolve(undefined);
    }
    if (entry.expiresAtMs <= this.#now()) {
      this.#entries.delete(url);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(entry.body);
  }

  write(url: string, body: string, ttlSeconds: number): Promise<void> {
    this.writes.push(url);
    this.#entries.set(url, {
      body,
      expiresAtMs: this.#now() + ttlSeconds * 1000,
    });
    return Promise.resolve();
  }
}

export interface UpstreamRequest {
  readonly accept?: string;
  readonly cache: UpstreamCache;
  readonly fetchImplementation?: UpstreamFetch;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  readonly ttlSeconds: number;
  readonly url: string;
}

async function readBoundedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_UPSTREAM_BODY_BYTES
  ) {
    throw new UpstreamUnavailableError();
  }
  const body = await response.text();
  if (body.length > MAX_UPSTREAM_BODY_BYTES) {
    throw new UpstreamUnavailableError();
  }
  return body;
}

/**
 * The answer is already in hand by this point, so a cache that refuses the write
 * must not turn a successful read into an availability failure. Losing the entry
 * costs a later caller one extra upstream read and nothing else.
 */
async function writeUpstreamCache(
  request: UpstreamRequest,
  body: string
): Promise<void> {
  try {
    await request.cache.write(request.url, body, request.ttlSeconds);
  } catch (error) {
    if (request.signal.aborted) {
      throw error;
    }
  }
}

/**
 * GET-only, cache-before-fetch upstream read. Credentials travel in headers so
 * the cache key, which is the URL, never carries one.
 */
async function fetchUpstream<T>(
  request: UpstreamRequest,
  parse: (body: string) => T
): Promise<T> {
  request.signal.throwIfAborted();
  const cached = await request.cache.read(request.url, request.signal);
  if (cached !== undefined) {
    return parse(cached);
  }

  const fetchImplementation =
    request.fetchImplementation ?? globalUpstreamFetch;
  let response: Response;
  try {
    response = await fetchImplementation(request.url, {
      headers: {
        ...optionalField("accept", request.accept),
        ...request.headers,
      },
      method: "GET",
      // workerd rejects `redirect: "error"`. A 3xx therefore arrives here as a
      // non-ok response and is reported as unavailable, so a redirect can never
      // carry a credential to another host.
      redirect: "manual",
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(request.timeoutMs),
      ]),
    });
  } catch (error) {
    if (request.signal.aborted) {
      throw error;
    }
    // biome-ignore lint/style/useErrorCause: Upstream detail must not reach a public error.
    throw new UpstreamUnavailableError();
  }

  if (!response.ok) {
    throw new UpstreamStatusError(
      response.status,
      response.headers.get("location") ?? undefined
    );
  }

  let body: string;
  try {
    body = await readBoundedText(response);
  } catch (error) {
    if (request.signal.aborted) {
      throw error;
    }
    // biome-ignore lint/style/useErrorCause: Upstream detail must not reach a public error.
    throw new UpstreamUnavailableError();
  }

  const value = parse(body);
  await writeUpstreamCache(request, body);
  return value;
}

function parseUpstreamJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    // biome-ignore lint/style/useErrorCause: Upstream body detail must not reach a public error.
    throw new UpstreamUnavailableError();
  }
}

function identity(body: string): string {
  return body;
}

/** GET-only, cache-before-fetch JSON read. A bad body is never cached. */
export function fetchUpstreamJson(request: UpstreamRequest): Promise<unknown> {
  return fetchUpstream(
    { ...request, accept: request.accept ?? DEFAULT_JSON_ACCEPT },
    parseUpstreamJson
  );
}

/** GET-only, cache-before-fetch text read. The body is returned verbatim. */
export function fetchUpstreamText(request: UpstreamRequest): Promise<string> {
  return fetchUpstream(
    { ...request, accept: request.accept ?? DEFAULT_TEXT_ACCEPT },
    identity
  );
}

/** Collapses whitespace and bounds length, dropping anything empty. */
export function trimUpstreamText(
  value: unknown,
  maxCharacters: number
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const collapsed = value.replace(WHITESPACE_PATTERN, " ").trim();
  if (collapsed === "") {
    return undefined;
  }
  return collapsed.slice(0, maxCharacters);
}

/**
 * NS and OVapi both emit colon-less UTC offsets such as `+0200`, which is not
 * the ISO 8601 profile the public contracts accept.
 */
export function normalizeUpstreamInstant(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  const colonless = COLONLESS_OFFSET_PATTERN.exec(trimmed);
  const candidate =
    colonless === null
      ? trimmed
      : `${colonless[1]}${colonless[2]}${colonless[3]}:${colonless[4]}`;
  if (!CANONICAL_INSTANT_PATTERN.test(candidate)) {
    return undefined;
  }
  return Number.isFinite(Date.parse(candidate)) ? candidate : undefined;
}

export function boundedList<T>(values: readonly T[], maximum: number): T[] {
  return values.slice(0, maximum);
}

/**
 * Builds an absent-or-present property, which is what
 * `exactOptionalPropertyTypes` requires of every optional output field.
 */
export function optionalField<const K extends string, T>(
  key: K,
  value: T | undefined
): { [P in K]?: T } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: T };
}
