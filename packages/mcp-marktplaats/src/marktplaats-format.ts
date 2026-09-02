export const MARKTPLAATS_ORIGIN = "https://www.marktplaats.nl";
export const MARKTPLAATS_SEARCH_URL =
  "https://www.marktplaats.nl/lrp/api/search";
export const PDOK_FREE_URL =
  "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

/**
 * The endpoint is an unofficial website API. It answers without a cookie or a
 * key, but it expects a browser-shaped request, so the language preference and
 * an honest identifying agent travel with every read.
 */
export const REQUEST_HEADERS = {
  "accept-language": "nl-NL,nl;q=0.9",
  "user-agent": "stamppot (+https://stamppot.dev)",
} as const;

export const MARKTPLAATS_SOURCE = {
  licence: "Gebruiksvoorwaarden Marktplaats, alleen persoonlijk gebruik",
  name: "Marktplaats",
  note: "onofficiële bron",
  official: false,
  url: "https://www.marktplaats.nl/",
} as const;

export const PDOK_SOURCE = {
  licence: "open data (PDOK, gratis en open geocodeerservice)",
  name: "PDOK Locatieserver",
  official: true,
  url: "https://www.pdok.nl/",
} as const;

const MAX_URL_CHARACTERS = 500;
const IMAGE_SIZE_PLACEHOLDER = "$_#";
const MARKTPLAATS_IMAGE_HOSTS = new Set([
  "images.marktplaats.com",
  "www.marktplaats.nl",
]);
const AMSTERDAM_TIME_ZONE = "Europe/Amsterdam";
const DUTCH_DATE_PATTERN = /^(\d{1,2}) ([a-z]{3}) (\d{2})$/;
const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;
const CENTURY_OFFSET = 2000;

/** Condition filter values, keyed by the public enum the tools accept. */
export const CONDITIONS = {
  like_new: { attributeValueId: 31, label: "Zo goed als nieuw" },
  new: { attributeValueId: 30, label: "Nieuw" },
  not_working: { attributeValueId: 13_940, label: "Niet werkend" },
  refurbished: { attributeValueId: 14_050, label: "Refurbished" },
  used: { attributeValueId: 32, label: "Gebruikt" },
} as const;

export type MarktplaatsCondition = keyof typeof CONDITIONS;

/** Upstream sort pairs, keyed by the public enum the tools accept. */
export const SORTS = {
  distance: { sortBy: "LOCATION", sortOrder: "INCREASING" },
  newest: { sortBy: "SORT_INDEX", sortOrder: "DECREASING" },
  price_asc: { sortBy: "PRICE", sortOrder: "INCREASING" },
  price_desc: { sortBy: "PRICE", sortOrder: "DECREASING" },
  relevance: { sortBy: "OPTIMIZED", sortOrder: "DECREASING" },
} as const;

export type MarktplaatsSort = keyof typeof SORTS;

const CONDITION_BY_LABEL = new Map<string, MarktplaatsCondition>(
  Object.entries(CONDITIONS).map(([condition, entry]) => [
    entry.label,
    condition as MarktplaatsCondition,
  ])
);

const DELIVERY_BY_LABEL = new Map<string, MarktplaatsDelivery>([
  ["Ophalen", "pickup"],
  ["Ophalen of Verzenden", "pickup_or_shipping"],
  ["Verzenden", "shipping"],
] as const);

const PRICE_TYPE_BY_UPSTREAM = new Map<string, MarktplaatsPriceType>([
  ["EXCHANGE", "exchange"],
  ["FAST_BID", "bidding"],
  ["FIXED", "fixed"],
  ["FREE", "free"],
  ["MIN_BID", "bidding"],
  ["NOTK", "negotiable"],
  ["ON_REQUEST", "on_request"],
  ["RESERVED", "reserved"],
  ["SEE_DESCRIPTION", "see_description"],
] as const);

const DUTCH_MONTHS = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
] as const;

const RELATIVE_DAY_OFFSETS = new Map([
  ["Eergisteren", 2],
  ["Gisteren", 1],
  ["Vandaag", 0],
]);

const amsterdamDayFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: AMSTERDAM_TIME_ZONE,
  year: "numeric",
});

export type MarktplaatsPriceType =
  | "bidding"
  | "exchange"
  | "fixed"
  | "free"
  | "negotiable"
  | "on_request"
  | "reserved"
  | "see_description"
  | "unknown";

export type MarktplaatsDelivery =
  | "pickup"
  | "pickup_or_shipping"
  | "shipping"
  | "unknown";

/** Upstream condition label to the public enum; an unlabelled item stays absent. */
export function conditionFromLabel(
  label: unknown
): MarktplaatsCondition | "unknown" | undefined {
  if (typeof label !== "string") {
    return undefined;
  }
  return CONDITION_BY_LABEL.get(label.trim()) ?? "unknown";
}

/** Upstream delivery label to the public enum; an unlabelled item stays absent. */
export function deliveryFromLabel(
  label: unknown
): MarktplaatsDelivery | undefined {
  if (typeof label !== "string") {
    return undefined;
  }
  return DELIVERY_BY_LABEL.get(label.trim()) ?? "unknown";
}

/**
 * Marktplaats publishes more price types than it documents, so an unrecognised
 * one becomes `unknown` rather than being dropped: a caller must still be able
 * to see that a price exists but is not a plain asking price.
 */
export function priceTypeFromUpstream(value: unknown): MarktplaatsPriceType {
  if (typeof value !== "string") {
    return "unknown";
  }
  return PRICE_TYPE_BY_UPSTREAM.get(value.trim()) ?? "unknown";
}

interface CalendarDay {
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

/**
 * The calendar day in Amsterdam, which is the only "today" a Dutch relative
 * date label can mean. The shift happens on the Y-M-D triple through
 * `Date.UTC`, so a daylight-saving transition can never move the answer.
 */
function amsterdamCalendarDay(now: Date): CalendarDay | undefined {
  const match = CALENDAR_DAY_PATTERN.exec(amsterdamDayFormatter.format(now));
  if (match === null) {
    return undefined;
  }
  return {
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
  };
}

function shiftedCalendarDay(day: CalendarDay, daysBack: number): string {
  const shifted = new Date(
    Date.UTC(day.year, day.month - 1, day.day) - daysBack * MILLISECONDS_PER_DAY
  );
  return shifted.toISOString().slice(0, 10);
}

function padded(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Marktplaats publishes a listing date as a Dutch label rather than a date, so
 * the calendar day is derived here and the verbatim label is kept alongside it.
 */
export function postedOnFromLabel(
  label: string,
  now: Date
): string | undefined {
  const trimmed = label.trim();
  const relativeOffset = RELATIVE_DAY_OFFSETS.get(trimmed);
  if (relativeOffset !== undefined) {
    const today = amsterdamCalendarDay(now);
    return today === undefined
      ? undefined
      : shiftedCalendarDay(today, relativeOffset);
  }

  const match = DUTCH_DATE_PATTERN.exec(trimmed.toLowerCase());
  if (match === null) {
    return undefined;
  }
  const dayOfMonth = Number(match[1]);
  const monthIndex = DUTCH_MONTHS.indexOf(
    match[2] as (typeof DUTCH_MONTHS)[number]
  );
  if (monthIndex < 0 || dayOfMonth < 1 || dayOfMonth > 31) {
    return undefined;
  }
  const year = CENTURY_OFFSET + Number(match[3]);
  return `${year}-${padded(monthIndex + 1)}-${padded(dayOfMonth)}`;
}

function boundedUrl(url: URL): string | undefined {
  const value = url.toString();
  return value.length > MAX_URL_CHARACTERS ? undefined : value;
}

/** Resolves a Marktplaats-relative path, refusing anything off that origin. */
export function absoluteMarktplaatsUrl(path: unknown): string | undefined {
  if (typeof path !== "string" || path.trim() === "") {
    return undefined;
  }
  let resolved: URL;
  try {
    resolved = new URL(path, MARKTPLAATS_ORIGIN);
  } catch {
    return undefined;
  }
  if (
    resolved.protocol !== "https:" ||
    resolved.host !== "www.marktplaats.nl"
  ) {
    return undefined;
  }
  return boundedUrl(resolved);
}

/**
 * Image URLs arrive protocol-relative and carry a `$_#` size placeholder that
 * the CDN only serves once it is replaced.
 */
export function imageUrl(
  value: unknown,
  size: "82" | "83"
): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  const candidate = value.startsWith("//") ? `https:${value}` : value;
  let resolved: URL;
  try {
    resolved = new URL(candidate);
  } catch {
    return undefined;
  }
  if (
    resolved.protocol !== "https:" ||
    !MARKTPLAATS_IMAGE_HOSTS.has(resolved.host)
  ) {
    return undefined;
  }
  const sized = resolved
    .toString()
    .replaceAll(IMAGE_SIZE_PLACEHOLDER, `$_${size}`);
  return sized.length > MAX_URL_CHARACTERS ? undefined : sized;
}
