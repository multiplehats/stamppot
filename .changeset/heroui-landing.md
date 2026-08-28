---
"@stamppot/edge": minor
---

Rebuild the landing and tool pages on HeroUI v3.

The bespoke "deck" design system is gone: no project palette, type scale or
shapes, and no per-MCP colour identity. `styles.css` is now just Tailwind plus
`@heroui/styles`, and the pages are assembled from HeroUI's own component
classes. The install picker's hand-rolled listbox is replaced by HeroUI's
`Select`, which brings its own keyboard handling and ARIA wiring.

The stylesheet is now served as a linked, cached asset instead of being inlined
into every document, which takes the home page from roughly 1 MB to 110 KB.
