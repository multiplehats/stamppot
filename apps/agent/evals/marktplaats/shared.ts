/** Qualified tool names: `<connection file name>__<MCP tool name>`. */
export const FIND_LISTINGS = "marktplaats__find_marktplaats_listings";
export const GET_LISTING = "marktplaats__get_marktplaats_listing";

/** A Marktplaats listing id as the MCP returns it. */
export const LISTING_ID_PATTERN = /^m\d{5,15}$/;
/** An ISO 8601 instant, which is what `observedAt` and `postedSince` carry. */
export const INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
/** Dutch phone numbers in the forms a seller would write them. */
export const PHONE_PATTERN = /(?:\+31|0031|\b0)[1-9](?:[\s-]?\d){8}\b/;
