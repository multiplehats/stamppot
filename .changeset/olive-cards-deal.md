---
"@stamppot/edge": minor
---

Redesign tool pages onto the deck system and drive the landing page from the registry.

Tool pages now use the same card-table design as the landing page: a felt hero with the tool's card, a white documentation band beside a sticky connect card, and a closing band for related tools. The older light "kitchen" system is gone; `--font-mono` is the only token kept from it.

Each MCP is assigned a deterministic suit — a card face, accent, badge and outline — derived from its id, so an MCP looks the same on the landing page and on every one of its tool pages. `calendar` deals lemon and signal red.

The landing page deck is now built from the operation registry and the compiled content rather than a hand-written list, so a new MCP appears on the page without editing it.
