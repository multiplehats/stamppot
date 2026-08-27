---
category: groceries
tags:
  - netherlands
  - grocery-prices
  - basket-planning
  - package-rounding
related:
  - find_grocery_options
  - get_shopping_list
---
# Plan a current Dutch grocery basket

`plan_grocery_basket` prices an ordered set of concrete grocery lines against current Dutch supermarket packages. It is stateless and creates no quote ID. Before calling for an occasion, reason with the user and decompose the request into at most 20 products and target quantities.

## Agent workflow

Send the complete basket. A missing target means one sale package. Mass and volume targets are converted to base units, then package counts round up so the requested amount is covered. Optional lines are priced when found, while a missing optional line does not make the plan incomplete.

```json
{
  "lines": [
    { "query": "cola", "target": { "value": 12, "unit": "l" } },
    { "query": "crisps", "target": { "value": 2, "unit": "kg" } }
  ],
  "budgetCents": 5000,
  "retailerSlugs": ["ah", "jumbo"],
  "maxStores": 3
}
```

The result compares the best single store with the cheapest combination within the store limit. Every priced and unmatched line retains its one-based line number and original query. Totals never treat unmatched items as zero-cost. Budget fields are comparative metadata and never silently remove a line.

For any follow-up, copy the result’s complete `replayInput`, edit the desired field, and resend it. The replay intentionally contains no catalog version, so a later call uses the newest prices and may change.

## Source, freshness, and errors

Prices come from [Checkjebon](https://github.com/supermarkt/checkjebon) under the MIT licence. Every result includes catalog provenance, observation time, and fresh or stale status. Prices are indicative, may differ by location or checkout time, and do not guarantee inventory.

A missing or corrupt catalog returns `catalog_unavailable` with `retryable: true`. Invalid quantities, retailer filters, budgets, or more than 20 lines are rejected before planning.

Connect directly at `/mcp/groceries` or use the combined `/mcp` endpoint.
