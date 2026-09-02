import {
  CloudflareIpRateLimiter,
  WorkersCacheUpstreamCache,
} from "@stamppot/upstream/cloudflare";
import { MarktplaatsListingClient } from "./listing-client";
import type { MarktplaatsMcpDependencies } from "./operations";
import { PdokLocationResolver } from "./pdok-client";
import { MarktplaatsSearchClient } from "./search-client";

type BindingSupplier<T> = () => T;

export function createCloudflareMarktplaatsDependencies(
  bindings: BindingSupplier<CloudflareBindings>
): MarktplaatsMcpDependencies {
  // One cache for all three upstreams: the URL is the key and the three origins
  // can never collide, while the shared entry bounds how often one Cloudflare
  // location reaches a source that permits only modest personal use.
  const cache = new WorkersCacheUpstreamCache(
    "stamppot-marktplaats-upstream-v1"
  );
  return {
    listingDetail: new MarktplaatsListingClient({ cache }),
    listings: new MarktplaatsSearchClient({ cache }),
    locations: new PdokLocationResolver({ cache }),
    upstreamLimiter: new CloudflareIpRateLimiter(
      () => bindings().MARKTPLAATS_UPSTREAM_READS,
      {
        keyPrefix: "marktplaats",
        namespace: "stamppot:marktplaats:upstream:v1",
      }
    ),
  };
}
