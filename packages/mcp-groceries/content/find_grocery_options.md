---
category: groceries
tags:
  - netherlands
  - grocery-prices
  - supermarkets
  - unit-pricing
related:
  - plan_grocery_basket
---
# Find current Dutch grocery options

`find_grocery_options` searches the current Dutch grocery catalog for real sale packages. Use it for questions such as “Where is 500 ml shampoo cheapest?” or “Which option has the best price per litre?” The result keeps checkout price separate from comparable mass, volume, and each-unit value.

## Agent workflow

Send a concrete product query. Optionally restrict the search to unique retailer slugs and choose a result limit. An empty retailer list means all current retailers; a valid but unknown slug deliberately returns no matches rather than widening the search.

```json
{
  "query": "500 ml shampoo",
  "retailerSlugs": ["ah", "jumbo"],
  "limit": 10
}
```

The response identifies the cheapest package at checkout and separately names the best comparable value in each compatible dimension. Unknown package quantities never become unit-value winners, and mass, volume, and item counts are never compared with one another.

## Source, freshness, and errors

Offers come from the [Checkjebon](https://github.com/supermarkt/checkjebon) supermarket dataset under the MIT licence. Results include its current catalog version and observation time. A snapshot older than 48 hours remains usable but is marked stale. Prices are indicative, may vary by location or checkout time, and do not guarantee inventory.

A missing or corrupt catalog returns `catalog_unavailable` with `retryable: true`. A successful search with no match returns `status: "ok"` and an empty offer array. Invalid fields are rejected before the tool runs.

Connect directly at `/mcp/groceries` or use the combined `/mcp` endpoint.
