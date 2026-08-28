---
---

Fix local grocery catalog publishing. `wrangler r2 object put` runs one process
per object against a single miniflare SQLite file, so concurrent writers hit
SQLITE_BUSY; local publication is now serialized. Publish failures also report
the object key and Wrangler's own output instead of a bare message.
