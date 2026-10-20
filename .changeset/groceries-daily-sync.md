---
---

The hosted grocery catalog is now refreshed from Checkjebon every day by a scheduled workflow, and every production deploy checks that `find_grocery_options` answers from a fresh catalog, so stale prices fail CI instead of reaching users.
