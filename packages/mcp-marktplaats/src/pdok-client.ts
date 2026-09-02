import {
  fetchUpstreamJson,
  globalUpstreamFetch,
  optionalField,
  trimUpstreamText,
  type UpstreamCache,
  type UpstreamFetch,
  UpstreamRateLimitedError,
  UpstreamUnavailableError,
} from "@stamppot/upstream";
import { z } from "zod";
import {
  PDOK_TIMEOUT_MS,
  PLACE_CACHE_TTL_SECONDS,
  UnknownPlaceError,
} from "./contracts";
import { PDOK_FREE_URL, REQUEST_HEADERS } from "./marktplaats-format";
import type {
  LocationResolver,
  MarktplaatsCallContext,
  ResolvedPlace,
} from "./operations";

const MAX_TEXT_CHARACTERS = 300;
const MAX_POSTCODE_CHARACTERS = 40;
/** `centroide_ll` is well-known text: `POINT(<longitude> <latitude>)`. */
const POINT_PATTERN = /^POINT\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/;

/** Present-or-absent passthrough: every upstream field is read defensively. */
const looseValue = z.unknown().optional();

const pdokDocumentSchema = z
  .object({
    centroide_ll: looseValue,
    gemeentenaam: looseValue,
    postcode: looseValue,
    provincienaam: looseValue,
    woonplaatsnaam: looseValue,
  })
  .loose();

/**
 * The `response` wrapper and its `docs` array are required, so a parseable but
 * unusable payload such as `{}` or a PDOK error envelope fails validation and
 * becomes `upstream_unavailable`. A present-but-empty `docs` array is a genuine
 * "no such place" and still resolves to `unknown_place`.
 */
const pdokResponseSchema = z
  .object({
    response: z.object({ docs: z.array(pdokDocumentSchema) }).loose(),
  })
  .loose();

interface ResolvedTown {
  readonly centroid: Centroid;
  readonly municipality?: string;
  readonly place: string;
  readonly province?: string;
}

export interface PdokLocationResolverOptions {
  readonly baseUrl?: string;
  readonly cache: UpstreamCache;
  readonly fetchImplementation?: UpstreamFetch;
}

function text(value: unknown): string | undefined {
  return trimUpstreamText(value, MAX_TEXT_CHARACTERS);
}

interface Centroid {
  readonly latitude: string;
  readonly longitude: string;
}

/**
 * The coordinates never leave this module: they only narrow the second lookup
 * to a postcode near the centre of the place, and the tools publish no
 * coordinates at all.
 */
function centroid(value: unknown): Centroid | undefined {
  const wkt = text(value);
  if (wkt === undefined) {
    return undefined;
  }
  const match = POINT_PATTERN.exec(wkt);
  const longitude = match?.[1];
  const latitude = match?.[2];
  if (longitude === undefined || latitude === undefined) {
    return undefined;
  }
  return { latitude, longitude };
}

export class PdokLocationResolver implements LocationResolver {
  readonly #baseUrl: string;
  readonly #cache: UpstreamCache;
  readonly #fetchImplementation: UpstreamFetch;

  constructor(options: PdokLocationResolverOptions) {
    this.#baseUrl = options.baseUrl ?? PDOK_FREE_URL;
    this.#cache = options.cache;
    this.#fetchImplementation =
      options.fetchImplementation ?? globalUpstreamFetch;
  }

  async resolve(
    place: string,
    context: MarktplaatsCallContext
  ): Promise<ResolvedPlace> {
    const town = await this.#town(place, context);
    const postcode = await this.#postcode(town, context);
    return {
      ...optionalField("municipality", town.municipality),
      place: town.place,
      postcode,
      ...optionalField("province", town.province),
    };
  }

  async #town(
    place: string,
    context: MarktplaatsCallContext
  ): Promise<ResolvedTown> {
    const parameters = new URLSearchParams();
    parameters.append("q", place);
    parameters.append("fq", "type:woonplaats");
    parameters.append("rows", "1");
    parameters.append(
      "fl",
      "woonplaatsnaam,gemeentenaam,provincienaam,centroide_ll"
    );
    const document = await this.#read(parameters, context);
    const name = text(document?.woonplaatsnaam);
    const centre = centroid(document?.centroide_ll);
    if (name === undefined || centre === undefined) {
      throw new UnknownPlaceError();
    }
    return {
      centroid: centre,
      ...optionalField("municipality", text(document?.gemeentenaam)),
      place: name,
      ...optionalField("province", text(document?.provincienaam)),
    };
  }

  async #postcode(
    town: ResolvedTown,
    context: MarktplaatsCallContext
  ): Promise<string> {
    const parameters = new URLSearchParams();
    parameters.append("q", `type:postcode AND woonplaatsnaam:${town.place}`);
    parameters.append("lat", town.centroid.latitude);
    parameters.append("lon", town.centroid.longitude);
    parameters.append("rows", "1");
    parameters.append("fl", "postcode");
    const document = await this.#read(parameters, context);
    const postcode = text(document?.postcode);
    if (postcode === undefined) {
      throw new UnknownPlaceError();
    }
    return postcode.slice(0, MAX_POSTCODE_CHARACTERS);
  }

  async #read(
    parameters: URLSearchParams,
    context: MarktplaatsCallContext
  ): Promise<z.output<typeof pdokDocumentSchema> | undefined> {
    let value: unknown;
    try {
      value = await fetchUpstreamJson({
        cache: this.#cache,
        fetchImplementation: this.#fetchImplementation,
        headers: REQUEST_HEADERS,
        ...optionalField("onBeforeFetch", context.chargeUpstreamRead),
        signal: context.signal,
        timeoutMs: PDOK_TIMEOUT_MS,
        ttlSeconds: PLACE_CACHE_TTL_SECONDS,
        url: `${this.#baseUrl}?${parameters.toString()}`,
      });
    } catch (error) {
      if (context.signal.aborted) {
        throw error;
      }
      if (
        error instanceof UpstreamUnavailableError ||
        error instanceof UpstreamRateLimitedError
      ) {
        throw error;
      }
      // biome-ignore lint/style/useErrorCause: Upstream detail must not reach a public error.
      throw new UpstreamUnavailableError();
    }
    const parsed = pdokResponseSchema.safeParse(value);
    if (!parsed.success) {
      throw new UpstreamUnavailableError();
    }
    return parsed.data.response.docs[0];
  }
}
