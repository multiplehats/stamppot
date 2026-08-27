---
category: shopping-lists
tags:
  - groceries
  - shopping-list
  - bearer-capability
  - whole-document
related:
  - get_shopping_list
  - plan_grocery_basket
---
# Save a complete capability-held shopping list

`save_shopping_list` creates or replaces one small anonymous grocery-list document. Omit `listKey` only when creating. Creation is not idempotent: if the response is lost, retrying without its returned key may create a second unreachable list.

```json
{
  "document": {
    "title": "Weekend",
    "lines": [
      { "query": "milk", "checked": false },
      { "query": "eggs", "target": { "value": 12, "unit": "each" } }
    ]
  }
}
```

To change an existing list, first call `get_shopping_list`, preserve every line the user still wants, edit the returned complete document, and resend that document with its `listKey`. There are no partial mutations, persisted line IDs, revisions, or merge rules. Concurrent replacements are last-write-wins.

Successful saves return the complete canonical document and extend expiry to 90 days. The document is limited to 20 lines and 16 KiB of UTF-8 JSON. Saved products are not quotes; use `plan_grocery_basket` separately whenever the user wants current Checkjebon prices.

## Capability and errors

Retain the returned bearer key outside disposable conversation context. It is not recoverable and is not an account identity. Stamppot never places it in a URL, R2, logs, analytics, or an error result, although third-party clients may retain tool arguments and results under their own policies.

An unknown or expired supplied key returns `unknown_list`. The approximate save abuse brake can return `rate_limited` with a 60-second retry hint; it is not authorization or accounting and may group users behind a proxy.

Connect directly at `/mcp/groceries` or use the combined `/mcp` endpoint.
