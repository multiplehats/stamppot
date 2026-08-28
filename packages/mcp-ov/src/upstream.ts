import { UpstreamUnavailableError } from "./contracts";

export const NS_TIMEOUT_MS = 10_000;
export const OVAPI_TIMEOUT_MS = 5000;
export const DEPARTURES_CACHE_TTL_SECONDS = 30;
export const PLANNING_CACHE_TTL_SECONDS = 60;

const MAX_UPSTREAM_BODY_BYTES = 8 * 1024 * 1024;
const WHITESPACE_PATTERN = /\s+/g;
const COLONLESS_OFFSET_PATTERN = /^(.*T[\d:.]+)([+-])(\d{2})(\d{2})$/;
const CANONICAL_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const LOCAL_WALL_CLOCK_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?$/;

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

/** Non-2xx upstream answer. It never escapes the client that raised it. */
export class UpstreamStatusError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Upstream answered with HTTP ${status}`);
    this.name = "UpstreamStatusError";
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

/** A cache that stores nothing, for callers that must always see the upstream. */
export class NullUpstreamCache implements UpstreamCache {
  read(_url: string, signal: AbortSignal): Promise<string | undefined> {
    signal.throwIfAborted();
    return Promise.resolve(undefined);
  }

  write(): Promise<void> {
    return Promise.resolve();
  }
}

export interface UpstreamRequest {
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
 * GET-only, cache-before-fetch JSON read. Credentials travel in headers so the
 * cache key, which is the URL, never carries one.
 */
export async function fetchUpstreamJson(
  request: UpstreamRequest
): Promise<unknown> {
  request.signal.throwIfAborted();
  const cached = await request.cache.read(request.url, request.signal);
  if (cached !== undefined) {
    return parseUpstreamJson(cached);
  }

  const fetchImplementation =
    request.fetchImplementation ?? globalUpstreamFetch;
  let response: Response;
  try {
    response = await fetchImplementation(request.url, {
      headers: { accept: "application/json", ...request.headers },
      method: "GET",
      // workerd rejects `redirect: "error"`. A 3xx therefore arrives here as a
      // non-ok response and is reported as unavailable, so a redirect can never
      // carry the NS key to another host.
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
    throw new UpstreamStatusError(response.status);
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

  const value = parseUpstreamJson(body);
  await request.cache.write(request.url, body, request.ttlSeconds);
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

/** Keeps an OVapi wall-clock time verbatim; it carries no offset by design. */
export function normalizeLocalWallClock(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = LOCAL_WALL_CLOCK_PATTERN.exec(value.trim());
  return match?.[1];
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
