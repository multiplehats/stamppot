import {
  fetchUpstreamJson,
  fetchUpstreamText,
  MemoryUpstreamCache,
  noUpstreamCache,
  type UpstreamFetch,
  UpstreamStatusError,
  UpstreamUnavailableError,
} from "@stamppot/upstream";
import { CloudflareIpRateLimiter } from "@stamppot/upstream/cloudflare";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-08-28T14:00:00.000Z");
const KEY_PATTERN = /^ov-trains:[A-Za-z0-9_-]{43}$/;

interface RecordedRequest {
  readonly headers: Record<string, string>;
  readonly method: string;
  readonly url: string;
}

function recordingFetch(
  responder: (url: string) => Response | Promise<Response>
): { calls: RecordedRequest[]; fetchImplementation: UpstreamFetch } {
  const calls: RecordedRequest[] = [];
  const fetchImplementation: UpstreamFetch = async (url, init) => {
    calls.push({
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      method: init.method ?? "GET",
      url,
    });
    return await responder(url);
  };
  return { calls, fetchImplementation };
}

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("fetchUpstreamJson", () => {
  it("serves a cached body without fetching", async () => {
    const cache = new MemoryUpstreamCache(() => NOW.getTime());
    await cache.write("https://upstream.test/a", '{"ok":true}', 30);
    const { calls, fetchImplementation } = recordingFetch(() =>
      jsonResponse('{"ok":false}')
    );

    const value = await fetchUpstreamJson({
      cache,
      fetchImplementation,
      signal: new AbortController().signal,
      timeoutMs: 1000,
      ttlSeconds: 30,
      url: "https://upstream.test/a",
    });

    expect(value).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });

  it("never caches a body that fails to parse", async () => {
    const cache = new MemoryUpstreamCache(() => NOW.getTime());
    const { fetchImplementation } = recordingFetch(() =>
      jsonResponse("not json at all")
    );

    await expect(
      fetchUpstreamJson({
        cache,
        fetchImplementation,
        signal: new AbortController().signal,
        timeoutMs: 1000,
        ttlSeconds: 30,
        url: "https://upstream.test/b",
      })
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(cache.writes).toEqual([]);
  });

  it("surfaces a redirect status with its location", async () => {
    const cache = new MemoryUpstreamCache(() => NOW.getTime());
    const { fetchImplementation } = recordingFetch(() =>
      Response.redirect("https://upstream.test/moved", 301)
    );

    const error = await fetchUpstreamJson({
      cache,
      fetchImplementation,
      signal: new AbortController().signal,
      timeoutMs: 1000,
      ttlSeconds: 30,
      url: "https://upstream.test/c",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UpstreamStatusError);
    expect((error as UpstreamStatusError).status).toBe(301);
    expect((error as UpstreamStatusError).location).toBe(
      "https://upstream.test/moved"
    );
  });

  it("rejects a body whose declared length exceeds the bound", async () => {
    const cache = new MemoryUpstreamCache(() => NOW.getTime());
    const { fetchImplementation } = recordingFetch(
      () =>
        new Response("tiny", {
          headers: { "content-length": String(8 * 1024 * 1024 + 1) },
          status: 200,
        })
    );

    await expect(
      fetchUpstreamJson({
        cache,
        fetchImplementation,
        signal: new AbortController().signal,
        timeoutMs: 1000,
        ttlSeconds: 30,
        url: "https://upstream.test/d",
      })
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(cache.writes).toEqual([]);
  });

  it("treats a timeout as an availability failure", async () => {
    const cache = new MemoryUpstreamCache(() => NOW.getTime());
    const { fetchImplementation } = recordingFetch(() => {
      throw new DOMException("The operation was aborted", "TimeoutError");
    });

    await expect(
      fetchUpstreamJson({
        cache,
        fetchImplementation,
        signal: new AbortController().signal,
        timeoutMs: 1000,
        ttlSeconds: 30,
        url: "https://upstream.test/e",
      })
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

describe("fetchUpstreamText", () => {
  it("returns the raw body and sends text/html by default", async () => {
    const cache = new MemoryUpstreamCache(() => NOW.getTime());
    const { calls, fetchImplementation } = recordingFetch(
      () => new Response("<p>hello</p>", { status: 200 })
    );

    const value = await fetchUpstreamText({
      cache,
      fetchImplementation,
      signal: new AbortController().signal,
      timeoutMs: 1000,
      ttlSeconds: 30,
      url: "https://upstream.test/f",
    });

    expect(value).toBe("<p>hello</p>");
    expect(new Headers(calls[0]?.headers ?? {}).get("accept")).toBe(
      "text/html"
    );
  });
});

describe("noUpstreamCache", () => {
  it("never writes and always misses", async () => {
    const { signal } = new AbortController();
    await expect(
      noUpstreamCache.read("https://upstream.test/g", signal)
    ).resolves.toBeUndefined();
    await expect(
      noUpstreamCache.write("https://upstream.test/g", "body", 30)
    ).resolves.toBeUndefined();

    const { calls, fetchImplementation } = recordingFetch(() =>
      jsonResponse('{"ok":true}')
    );
    const request = {
      cache: noUpstreamCache,
      fetchImplementation,
      signal,
      timeoutMs: 1000,
      ttlSeconds: 30,
      url: "https://upstream.test/g",
    };

    await fetchUpstreamJson(request);
    await fetchUpstreamJson(request);

    expect(calls).toHaveLength(2);
  });
});

function fakeRateLimitBinding(): { calls: string[]; limiter: () => RateLimit } {
  const calls: string[] = [];
  const binding: RateLimit = {
    limit(options) {
      calls.push(options.key);
      return Promise.resolve({ success: true });
    },
  };
  return { calls, limiter: () => binding };
}

function requestFromIp(ip: string): Request {
  return new Request("https://stamppot.test/v1/tools/probe", {
    headers: { "CF-Connecting-IP": ip },
  });
}

describe("CloudflareIpRateLimiter", () => {
  it("hashes the caller IP into a byte-identical key format", async () => {
    const { calls, limiter } = fakeRateLimitBinding();
    const rateLimiter = new CloudflareIpRateLimiter(limiter, {
      keyPrefix: "ov",
      namespace: "stamppot:ov:upstream:v1",
    });

    await rateLimiter.consume(requestFromIp("203.0.113.5"), "trains");

    expect(calls[0]).toMatch(KEY_PATTERN);
  });

  it("gives different IPs different keys and the same IP the same key", async () => {
    const { calls, limiter } = fakeRateLimitBinding();
    const rateLimiter = new CloudflareIpRateLimiter(limiter, {
      keyPrefix: "ov",
      namespace: "stamppot:ov:upstream:v1",
    });

    await rateLimiter.consume(requestFromIp("203.0.113.5"), "trains");
    await rateLimiter.consume(requestFromIp("203.0.113.5"), "trains");
    await rateLimiter.consume(requestFromIp("198.51.100.9"), "trains");

    expect(calls[0]).toBe(calls[1]);
    expect(calls[0]).not.toBe(calls[2]);
  });
});
