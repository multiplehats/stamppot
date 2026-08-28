---
category: shopping-lists
tags:
  - groceries
  - shopping-list
  - bearer-capability
  - durable-objects
related:
  - save_shopping_list
  - plan_grocery_basket
---
# Get a capability-held shopping list

`get_shopping_list` reads one anonymous saved grocery list. It requires the exact bearer `listKey` returned when the list was created. The key is not tied to an MCP session, conversation, account, Claude profile, Hermes profile, or OpenClaw installation, and it cannot be recovered after it is lost.

```json
{
  "listKey": "lst_0123456789abcdefghijkl"
}
```

On success the tool returns the complete canonical document, its save time, and its expiry. Reading does not extend the 90-day expiry. The operation touches only the list’s Durable Object and never reads the grocery catalog or silently reprices saved lines.

When the user asks for current prices, choose the desired unchecked or complete lines from the returned document and pass those lines to `plan_grocery_basket`. Keep saved state and current catalog calculations as separate steps.

## Capability and errors

Treat `listKey` as a secret bearer capability. Third-party clients may retain tool arguments and results under their own policies. Stamppot does not put it in URLs, catalog R2 objects, logs, analytics, or error results.

A syntactically valid but missing or expired capability returns `unknown_list` with `retryable: false` and does not echo the key. Invalid capability syntax is rejected before the Durable Object is accessed.

Connect directly at `/mcp/groceries` or use the combined `/mcp` endpoint.
