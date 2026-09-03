import {
  CloudflareIpRateLimiter,
  WorkersCacheUpstreamCache,
} from "@stamppot/upstream/cloudflare";
import { NsClient } from "./ns-client";
import type { OvMcpDependencies } from "./operations";
import { OvApiClient } from "./ovapi-client";
import { StopDirectory, type StopsObjectStore } from "./stops-directory";
import { MAX_STOPS_OBJECT_BYTES } from "./stops-format";

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

export function createCloudflareOvDependencies(
  bindings: BindingSupplier<CloudflareBindings>
): OvMcpDependencies {
  const cache = new WorkersCacheUpstreamCache("stamppot-ov-upstream-v1");
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
    upstreamLimiter: new CloudflareIpRateLimiter(
      () => bindings().OV_UPSTREAM_READS,
      { keyPrefix: "ov", namespace: "stamppot:ov:upstream:v1" }
    ),
  };
}
