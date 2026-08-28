# Stamppot — Style Reference

The landing page and the tool pages are built from **HeroUI v3** defaults. There
is no Stamppot design system: no brand palette, no custom type scale, no custom
shapes. If you need to know what something looks like, read HeroUI's docs — they
are the reference this file used to be.

- Components: <https://heroui.com/en/docs/react/components>
- Getting started: <https://heroui.com/en/docs/react/getting-started/quick-start>
- Theme tokens: `@heroui/styles` → `dist/themes/shared/theme.css`

HeroUI v3 requires React 19+ and Tailwind CSS v4. Both are already in the
catalog in `pnpm-workspace.yaml`.

## Where the styling comes from

`apps/edge/src/landing/styles.css` is the whole stylesheet:

```css
@import "tailwindcss";
@import "@heroui/styles";
```

Import order matters — `tailwindcss` first. The only project-owned rules in that
file are vertical rhythm for compiled Markdown, described under
[Tool documentation](#tool-documentation) below.

Colours, spacing, radii and type all come from HeroUI's default light theme. Use
its Tailwind tokens rather than raw values: `bg-background`,
`bg-background-secondary`, `bg-surface`, `text-foreground`, `text-muted`,
`border-border`, `divide-separator`, `bg-default`, `text-accent`.

## Two ways to use HeroUI, and when to use which

This matters more than any visual rule, because picking the wrong one breaks the
build or the render.

### Server components → `*Variants()` from `@heroui/styles`

`@heroui/styles` is pure styling: `tailwind-variants` in, class strings out. No
React, no react-aria. A server component may import it freely, and the page ends
up carrying HeroUI's look with **no client JavaScript at all**.

```tsx
import { cardVariants } from "@heroui/styles";

const card = cardVariants();

<article className={card.base()}>
  <div className={card.header()}>
    <h3 className={card.title()}>…</h3>
  </div>
</article>;
```

HeroUI's CSS styles hover, focus and disabled with ordinary selectors
(`&:hover`, `&:focus-visible`), not only with react-aria's `data-*` attributes.
That is why a plain `<a className={buttonVariants({ variant: "primary" })}>`
looks and behaves like a HeroUI button without shipping one.

`site.tsx` wraps the common cases: `card`, `buttonClass()`, `Section`,
`SectionHeading`.

### Client components → real components from `@heroui/react`

Only when something genuinely needs behaviour. `install-card.tsx` is the single
example: its picker is a HeroUI `Select`, so it owns the listbox, the keyboard
handling and the ARIA wiring.

Such a file must start with `"use client"`. Inside one, the compound API is
available and idiomatic: `Select.Trigger`, `ListBox.Item`, `Card.Header`.

## Two rules the RSC build enforces

Both of these pass a naive review and fail loudly later, so they are worth
stating outright.

1. **Never import `@heroui/react` from a server component.** Its barrel reaches
   `react-aria-components`, which is marked `client-only`, and the `rsc`
   environment refuses to build it:

   > `'client-only' cannot be imported in server build ('rsc' environment)`

   Import it only from a `"use client"` module, whose imports the rsc
   environment never traverses.

2. **Compound dot-access does not cross the RSC boundary.** HeroUI builds
   `Card` with `Object.assign(CardRoot, { Header, Title, … })` in a module that
   is *not* `"use client"`. Across the boundary each export is a client
   reference, so `Card.Header` resolves to `undefined` and React throws
   "Element type is invalid" at render time — after a clean build.

   Inside a client component this is a non-issue. From a server component, use
   the flat exports (`CardRoot`, `CardHeader`, `CardTitle`) or, better, the
   `*Variants()` approach above.

## CSS delivery

`site.tsx` renders `<StyleAssets />`, which calls
`import.meta.viteRsc.loadCss()` and emits a real `<link rel="stylesheet">`
pointing at the hashed build asset.

Do **not** go back to `styles.css?inline` in a `<style>` tag. Because
`entry.browser.tsx` hydrates the whole document, an inlined stylesheet is sent
twice — once as HTML and once inside the RSC Flight payload. With HeroUI's
stylesheet that took the home page to roughly 1 MB per request; the linked
asset is about 40 KB gzipped and is cached across pages.

Worker route tests render outside the RSC graph, where `import.meta.viteRsc`
does not exist, so `vitest.config.ts` aliases `./style-assets` to
`style-assets.testing.tsx`, which renders nothing.

## Tool documentation

A tool page injects build-compiled Markdown with `dangerouslySetInnerHTML`. It
carries two classes:

- `typography-prose` — HeroUI's own prose styling. It covers headings, code,
  links, lists, blockquotes and `pre`.
- `tool-prose` — the only project CSS in the repository. `typography-prose` is
  written for content that already carries margins, so this adds vertical
  rhythm and the rule above each `h2`. The build strips the leading `h1`, so
  the first `h2` opens the column and gets no rule.

## Layout

- One page column: `CONTAINER` in `site.tsx` (`max-w-5xl`, `px-6`).
- Bands alternate between the page background and `bg-background-secondary`
  via `<Section muted>`.
- Cards in a grid take `h-full`, and their footers take `mt-auto`, so calls to
  action line up across a row of uneven cards.
- Use `outline`, not `tertiary`, for a secondary button that must read on both
  bands — `tertiary`'s fill is `--default`, which disappears on
  `bg-background-secondary`.
