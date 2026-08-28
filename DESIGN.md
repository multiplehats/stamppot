# Stamppot — Style Reference

> Cards laid across a green baize table. The design language is the deck itself, not a wrapper around it.

**Theme:** dark

Stamppot uses a card-table aesthetic: a dark green baize canvas, white and pastel card faces scattered at chaotic angles, and a tight three-colour accent system (signal red, royal violet, antique gold) applied as borders and type rather than fills. Typography is uniformly heavy — weight 800 even for 14px body copy — treating the screen like a punchline card rather than a developer dashboard. Buttons are chunky pills with 2px inset borders that read as physical objects sitting on the felt. The card metaphor is visual only: each MCP is drawn as a playing card, the install command sits on a tilted card, and an MCP nobody has built yet is an outlined card. The copy does not carry the metaphor. Headlines and labels are written in plain technical English, so a reader who never notices the card table still understands what the page offers. Density is spacious — 120px between sections — but display sizes running to 80px keep the vertical rhythm from feeling empty.

One system covers the whole site: the landing page, every tool page, and the shared dark shell.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Felt | `#16352b` | `--color-felt` | Page background, button fills on light sections, text on pale card faces. Green baize — the literal colour of a card table, not a neutral dark |
| Card | `#ffffff` | `--color-card` | Card faces, body text on felt, button borders and fills |
| Signal Red | `#fe2f2f` | `--color-signal-red` | Accent one — reason 01, the outlined scatter card, focus rings |
| Royal Violet | `#7333f1` | `--color-royal-violet` | Accent two — the transit card, reason 02 |
| Antique Gold | `#d7b73b` | `--color-antique-gold` | Accent three — the groceries card, reason 03 |
| Lemon | `#fffe5b` | `--color-lemon` | Card face fill — the dealt card, and the bright note in any scatter |
| Lavender | `#ede5ff` | `--color-lavender` | Card face fill — soft purple surface |
| Cobalt | `#1b5bff` | `--color-cobalt` | Card face fill — the one saturated face, carries gold type |
| Sky | `#a0e9ff` | `--color-sky` | Card face fill, reserved for future cards |
| Bubblegum | `#ffa0f0` | `--color-bubblegum` | Card face fill, reserved for future cards |
| Mint | `#b4ff91` | `--color-mint` | Card face fill, reserved for future cards |
| Tangerine | `#ff9559` | `--color-tangerine` | Card face fill, reserved for future cards |

### Greys

Five steps, each tied to the surface it sits on. Never use a grey on the wrong ground — the pairs are what keep contrast honest, and on this palette they genuinely do not survive a swap: ash is 5.0:1 on the baize and 2.7:1 on white.

The two that sit on white are truly neutral. The three that sit on the baize are tinted from it and lightened — a ground at `#16352b` rather than `#000000` costs about a stop of contrast, and pure greys no longer clear AA on it.

| Name | Value | Token | Sits on | Contrast |
|------|-------|-------|---------|----------|
| Charcoal | `#444444` | `--color-charcoal` | Body copy on a white section | 9.7:1 |
| Graphite | `#666666` | `--color-graphite` | Eyebrow and micro labels on white — including note cards and the command card | 5.7:1 |
| Ash | `#8fa39b` | `--color-ash` | Eyebrow labels, breadcrumbs and micro labels on the baize | 5.0:1 |
| Smoke | `#a3b5ae` | `--color-smoke` | Secondary copy and footer links on the baize | 6.2:1 |
| Hairline | `#2c5446` | `--color-hairline` | The 2px rule above the footer, outlined tag pills, and the contribute card — every subtle line on the baize | 1.6:1 (a line, not text) |

## Tokens — Typography

### Inter (display) — `--font-display`
Headlines, card copy, buttons, labels, endpoints — nearly everything. Weight 800 at every size from 11px labels to the 80px hero, which is the anti-hierarchy choice that makes the brand read as shouting a punchline rather than presenting information. Tight tracking (-0.02em) and sub-1.0 leading at display sizes stack words into a block; small labels invert the treatment with +0.06em to +0.08em and uppercase.
- **Substitute:** Helvetica Neue, Helvetica, Arial, system-ui
- **Weights:** 800 (400 exists but is essentially unused)
- **Sizes:** 11, 12, 13, 14, 15, 16, 20, 24, 28, 40, 55, 65, 80
- **Line height:** 0.975–1.5
- **No webfont is loaded.** Readers with Inter get Inter; everyone else gets Helvetica or Arial, which is the face this style is drawn from. Neither has a real 800, so **never set `font-synthesis: none`** — synthesised bold is what carries the design on the fallback.

### Inter (body) — `--font-body`
The same stack under a second name, applied to running prose so the two roles can diverge later without touching markup. Currently identical to `--font-display`.
- **Sizes:** 14, 16, 20
- **Line height:** 1.5–1.75

### Type Scale

Sizes at and above `heading-lg` are fluid; each tops out at its artboard value at 1440px. Line height rides along as a ratio so it survives the clamp.

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| caption | 12px | 1.5 | 0.08em, uppercase (applied per use) | `--text-caption` |
| body-sm | 14px | 1.714 | — | `--text-body-sm` |
| body | 16px | 1.625 | — | `--text-body` |
| subheading | 20px | 1.5 | -0.01em | `--text-subheading` |
| heading-sm | 24px | 1.5 | — | `--text-heading-sm` |
| heading | 28px | 1.286 | -0.01em | `--text-heading` |
| heading-lg | `clamp(28px, 2.8vw, 40px)` | 1.075 | -0.02em | `--text-heading-lg` |
| display-sm | `clamp(32px, 3.8vw, 55px)` | 1.055 | -0.02em | `--text-display-sm` |
| display | `clamp(36px, 4.5vw, 65px)` | 1 | -0.02em | `--text-display` |
| display-lg | `clamp(40px, 5.6vw, 80px)` | 0.975 | -0.02em | `--text-display-lg` |

Line height and tracking ride with the size through Tailwind's `--text-*--line-height` / `--text-*--letter-spacing` modifiers, so `text-display-lg` sets all three at once. Below `caption` sit 11px and 13px micro labels — note-card headers and card badges — always uppercase with positive tracking.

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** spacious

### Spacing Scale

No spacing tokens are defined. Tailwind's default 4px `--spacing` scale already produces the whole system, and redefining `--spacing-1`–`--spacing-5` (which the design's 4/10/20/50/100 scale would want) silently rewrites the built-in `p-1`–`p-5` utilities.

| Value | Utility | Role |
|-------|---------|------|
| 8px | `gap-2` | Bullet dot to text |
| 10px | `gap-[10px]` | Label to value inside a card |
| 12px | `gap-3` | Between pills in a row |
| 20px | `gap-5` | Between deck cards, note-card padding |
| 24px | `mt-6` | Eyebrow to headline |
| 32px | `p-8` | Deck card padding |
| 36px | `gap-9` | Nav and footer link spacing |
| 100px | `gap-[100px]` | Between the two columns of a split section |
| 120px | `px-[120px] py-[120px]` | Section padding, all four sides |

### Border Radius

| Element | Value | Token |
|---------|-------|-------|
| scatter cards, note cards | 13px | `--radius-card` |
| deck cards, command card | 20px | `--radius-card-lg` |
| buttons, badges, pills | 38px | `--radius-pill` |
| oversized pills | 64px | `--radius-pill-lg` |

Nothing on the page is squarer than 13px. Tailwind's own `--radius-lg` / `--radius-xl` are left alone.

### Shadows

**There are none.** Depth is drawn with a 2px inset box-shadow used as a border:

| Use | Value |
|-----|-------|
| Outlined button on felt | `inset 0 0 0 2px var(--color-card)` |
| Outlined button or pill on white | `inset 0 0 0 2px var(--color-felt)` |
| Outlined scatter card | `inset 0 0 0 2px var(--color-signal-red)` |

The inset shadow, not a `border`, is the treatment — it keeps the box model clean when the element is also rotated.

### Layout

- **Page container:** `--container-page`, 1200px, centred inside a full-bleed section
- **Section padding:** 120px, dropping to 64px at 1100px and 24px below 640px
- **Section rhythm:** full-bleed bands alternating felt and card, no rules between them — the colour flip *is* the boundary
- **Breakpoints:** 1440px (inner scatter cards hide), 1100px (two-column card grid, starburst hides), 1024px (scatter hides entirely), 900px (split sections stack), 720px (single-column cards), 640px (`sm`)

## Components

### Deck Card
**Role:** One MCP, presented as a playing card

386px wide in a three-up grid, 580px tall, `--radius-card-lg`, 32px padding, `overflow: clip`, filled with one of the pastel faces. Top-left: a pill badge in the card's accent colour. Below it a 40px weight-800 headline **in the accent colour, not felt** — the face and the type are a matched pair (lemon/red, lavender/violet, cobalt/gold). A white note card is absolutely positioned at 44px from the left, 300px down, rotated -5°, holding an 11px uppercase label and a 15px body. Bottom-right: an accent-coloured action word plus a 26px circled arrow. A card is *dealt* when its MCP is in the registry — badge reads `MCP-GROCERIES` and the note shows real tool output; otherwise the badge reads `NOT DEALT YET` and the note explains what is missing.

### Solid Pill Button (Primary)
**Role:** Main action

Filled — white on felt, felt on white — `--radius-pill`, 56px tall, 36px horizontal padding, 16px weight 800. No border, no shadow. One per section.

### Outlined Pill Button
**Role:** Secondary action

Transparent fill with a 2px inset border in the foreground colour, same 56px geometry as the solid variant. Only the polarity changes between felt and card sections; the geometry never does.

### Pill Badge
**Role:** Card status, and the fact-chips in the open-source section

`--radius-pill`, 36px tall (48px for fact-chips), 18–26px horizontal padding, 13–14px weight 800 with 0.06em tracking. Card badges are *filled* with an accent and carry white or felt text depending on the accent's lightness — gold takes felt, red and violet take white. Fact-chips are *outlined* in felt on white. A badge is one or the other, never both.

### Install Card
**Role:** The install snippet for whichever client the reader uses

One card, two tones. On the landing hero it is white, 680px wide and **rotated -1.5°**; in a tool page's sidebar it is felt and fills the column. Both use `--radius-card-lg` and 24px padding, and both sit inside a `[data-code-block]` wrapper.

A header row carries the eyebrow on the left and the client picker on the right, wrapping to two rows when the column is too narrow for both. The picker is a pill-shaped trigger showing a 32px circular brand chip, the client name at 15px weight 800, and a caret.

Below it sits the **snippet panel**, and the panel is the part that matters: it inverts against its card — felt inside the white hero card, white inside the felt sidebar card — so the code reads as a terminal rather than as text lying loose on the card. Inside, a header strip separated by a 1px rule holds the destination on the left (`TERMINAL`, or the config path such as `~/.cursor/mcp.json`) and the `copy` control on the right, so the button sits with the thing it copies. The snippet is set in `--font-mono` at weight 400, matching how `.tool-prose` renders block code: it is code, and 800-weight code is unreadable. It wraps rather than scrolling, because a horizontally scrolled command hides its own tail.

The dropdown is an ARIA listbox of brand chip, client name and destination, with the current choice filled and ticked. It is absolutely positioned and **must be able to escape its section** — the hero clips its scatter on the scatter layer, not on the section, precisely so this list is not cut off.

Brand icons come from Parsew, keyed by domain. The chip is light in both tones, so both callers ask for the `light` icon variant; the `dark` variant is near-white and would vanish. Any icon that cannot load falls back to the client's initial in the same chip, so a missing logo costs a logo and never leaves a hole.

### Scatter
**Role:** Cards strewn across the felt behind the hero

Seven 190×262 rectangles at `--radius-card`, rotated between -14° and +11°, absolutely positioned and anchored to the **viewport edges** rather than a fixed 1440px frame, so they hug the sides at any width. Four are white, one lemon, one lavender, one outlined in signal red with no fill. The container is `aria-hidden`, `pointer-events-none` and clipped. The three that reach furthest inward hide below 1440px; the whole scatter hides below 1024px, because a white card behind white text is unreadable and no amount of z-index fixes that.

### Starburst
**Role:** The "More to come!" sticker

A 33-point polygon, 140px, filled white, rotated 12°, hung off the top-right corner of the card grid at -58px/-70px so it breaks the grid's edge. Felt text at 16px inside. Decorative and `aria-hidden`; hides below 1100px. One sticker on the page — a second would make it a pattern instead of a joke.

### Numbered Reason Row
**Role:** The three-point argument on the white section

A 52px accent-coloured number in its own fixed lane, 28px gap, then a 28px headline and a 16px charcoal body. Rows two and three carry a **2px felt top border**; the first has none. The fixed number lane is what keeps the headlines in a vertical line when the numbers change width.

### Guarantee Row
**Role:** The bulleted list on the safety section

An 8px white dot in a fixed lane with an 11px top margin to sit on the first line's baseline, 24px gap, then a 20px white title and a 14px smoke body. No borders — the dots carry the rhythm.

### Top Navigation Bar
**Role:** Site header

88px tall, felt, no border, 120px gutters with the 1200px column inside. Wordmark `Stamppot` at 24px weight 800, tracking -0.02em, left. Three 14px weight-800 white links at 36px spacing, right, hovering to signal red. No dropdowns, no icons, no background on scroll.

### Site Footer
**Role:** Closing bar

Felt with a **2px `--color-hairline` top border** — the baize-tinted rule that makes a divider visible on the felt at all. 56px vertical padding. Wordmark left, four smoke links right hovering to white.

### Eyebrow Label
**Role:** The small uppercase line above every section headline

12px weight 800, uppercase, 0.08em tracking. Ash on felt, graphite on white. Always paired with a display headline, never used alone.

## Do's and Don'ts

### Do
- Use weight 800 for everything, body copy included — the uniform heaviness is the brand's voice
- Apply the 2px inset box-shadow as the border treatment on buttons, chips and outlined cards
- Use pill radii (38px) for every button and badge, and 13–20px for anything card-shaped
- Match a card's accent type to its face: lemon takes red, lavender takes violet, cobalt takes gold
- Rotate cards. The command card, the note cards and the scatter all tilt; a card that sits square reads as a `<div>`
- Flip polarity at section boundaries — felt to card and back — instead of introducing a third ground
- Anchor decorative scatter to the viewport edges and hide it before it can collide with text
- Keep display leading at or below 1.075 and tracking at -0.02em so headlines stack as a block
- Pair each grey with its ground: charcoal and graphite on white, ash and smoke on felt
- Write copy in plain technical English: short sentences, no adverbs, no em dashes, and the specific fact instead of a claim about it

### Don't
- Don't use weight 400 outside the two places that earn it: `.tool-prose` running text, and the install card's mono snippet. Everywhere else, if it looks too heavy the size is wrong, not the weight
- Don't add drop shadows for elevation; the inset border is the only depth treatment
- Don't fill large areas with signal red, violet or gold — they are type and borders, and the pastel faces are the only large colour
- Don't set `font-synthesis: none` — the fallback faces have no true 800 and would flatten to regular
- Don't use border-radius below 13px on cards or below 38px on buttons
- Don't add gradients; every surface is one flat colour
- Don't use letter-spacing tricks beyond the two in the system: -0.02em on display, +0.06–0.08em on uppercase labels
- Don't define `--spacing-1`–`--spacing-5`; it silently rewrites Tailwind's own `p-1`–`p-5`
- Don't build a Tailwind class by interpolation (`bg-${accent}`) — Tailwind cannot see it and emits nothing
- Don't put the card metaphor into copy. No "deal", "deck", "card", "shuffle" or "face up" in a headline, label or button. The metaphor is drawn, not written

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Felt | `#16352b` | The baize table. Hero, deck and safety sections |
| 1 | Card | `#ffffff` | Card faces, note cards, and the two white full-bleed sections |
| 2 | Pastel Face | `#fffe5b` / `#ede5ff` / `#1b5bff` | Deck card faces — one per MCP, chosen with its accent |

## Elevation

- **Outlined button on felt:** `inset 0 0 0 2px var(--color-card)`
- **Outlined button on white:** `inset 0 0 0 2px var(--color-felt)`
- **Outlined scatter card:** `inset 0 0 0 2px var(--color-signal-red)`
- **Everything else:** flat. Rotation and overlap carry depth, not shadow.

## Imagery

One raster image on the entire site: a stamppot bowl with a circuit-trace motif, 96×97 at the top of the hero, served from `/stamppot-bowl.png`. Everything else is drawn in CSS and inline SVG — the scatter, the starburst, the circled arrows, the status dots. The card *is* the imagery: an MCP is not illustrated, it is dealt. There are no photographs, no icon set and no illustrations beyond the bowl. When something new needs a picture, the first question is whether it can be a card instead.

## Layout

Full-bleed sections alternate felt and card with no rules between them, each padded 120px on all four sides with the 1200px column centred inside. The hero opens on felt with the bowl, an 80px centred headline, two pill buttons and the tilted command card, over a scatter anchored to the viewport edges. The argument section flips to white and splits `420px / 1fr` — headline left, numbered rows right. The deck returns to felt: centred eyebrow and 65px headline over a three-up card grid with the starburst breaking the top-right corner. The open-source section flips to white and centres everything. The safety section returns to felt and splits `460px / 1fr`, with a small stack of three overlapping cards under the headline. Split sections stack at 900px, the card grid drops to two columns at 1100px and one at 720px, and gutters tighten from 120px to 64px to 24px.

## Agent Prompt Guide

**Quick Color Reference**
- text on felt: `#ffffff` · secondary on felt: `#a3b5ae` · labels on felt: `#8fa39b`
- text on white: `#16352b` · body on white: `#444444` · labels on white: `#666666`
- backgrounds: `#16352b` (green baize felt) and `#ffffff` (card) — these two only, alternating
- accents (pick one per element, as type or border, never a large fill): `#fe2f2f`, `#7333f1`, `#d7b73b`
- card faces: `#fffe5b`, `#ede5ff`, `#1b5bff`
- footer divider: `#2c5446`, 2px

**Example Component Prompts**

1. Hero on `#16352b`. Scattered 190×262 white cards at 13px radius, rotated -14° to +11°, anchored to the left and right viewport edges, one filled `#fffe5b`, one `#ede5ff`, one outlined with `inset 0 0 0 2px #fe2f2f`. Centred: a 96px image, then a headline at `clamp(40px, 5.6vw, 80px)` weight 800, `#ffffff`, line-height 0.975, tracking -0.02em, max-width 1000px; sub-copy at 20px weight 800.

2. Deck card: 386×580, 20px radius, `#fffe5b` fill, 32px padding, overflow clipped. Pill badge top-left, `#fe2f2f` fill, 36px tall, 18px padding, 13px weight 800 `#ffffff`, 0.06em tracking. Headline below at 40px weight 800 **in `#fe2f2f`**, line-height 1.075. A white note card absolutely at left 44px / top 300px, 250px wide, 13px radius, rotated -5°, 20px padding. Bottom-right: "Read" at 20px weight 800 `#fe2f2f` beside a 26px circled arrow.

3. Outlined pill button: transparent fill, `inset 0 0 0 2px #ffffff`, 38px radius, 56px tall, 36px horizontal padding, 16px weight 800 `#ffffff`.

4. Install card: 680px wide, 20px radius, `#ffffff`, 24px padding, **rotated -1.5°**. Eyebrow top-left at 12px weight 800 uppercase `#666666`, 0.08em tracking; a pill picker top-right with a 32px round brand chip and a caret. Below, a `#16352b` panel at 13px radius: a header strip with an 11px uppercase `#8fa39b` destination label and an outlined `copy` button, a 1px `#2c5446` rule, then the snippet at 13.5px `--font-mono` weight 400 `#ffffff`, wrapping.

5. Split section on `#ffffff`: 120px padding, 1200px column, `420px / 1fr` with a 100px gap. Left: eyebrow plus a `clamp(32px, 3.8vw, 55px)` weight-800 headline. Right: rows of a 52px accent number in a fixed lane, then a 28px headline and 16px `#444444` body, each row after the first separated by a 2px `#16352b` top border.

## Similar Brands

- **Cards Against Humanity** — the direct ancestor: dark ground, scattered card faces, uniformly heavy Helvetica, accents as outlines rather than fills. Stamppot swaps its black for baize
- **Exploding Kittens** — product-as-imagery, where the game's own cards scattered across a dark ground *are* the site's visual system
- **Vercel and Linear marketing pages** — the same dark ground with oversized tight-tracked display type and flat, shadowless surfaces, minus the playfulness and the colour

## Tool pages

Tool pages (`/tools/:name`) run the same system, in three bands: a felt hero carrying the breadcrumb, title, description, outlined tag pills and the tool card; a white documentation band holding the compiled Markdown beside a sticky connect card; and a felt closing band for related tools.

The compiled Markdown is styled by `.tool-prose` in `styles.css`. It is one of two places the deck drops to weight 400, the other being the install card's snippet — a full reference page set in 800 cannot be read, and the type scale caps heavy body copy at 16px in any case. Headings, labels, links and code stay heavy. Inline code sits on a lemon chip, so it reads as a piece torn off a card face; block code is a felt card with white monospace.

`--font-mono` is the only survivor of the older light system. The deck has one face, but schema keys, ISO timestamps and install commands need columns that line up.

## MCP suits

Every MCP is a playing card, and every card needs a face. `apps/edge/src/landing/deck.ts` derives a **suit** — a face fill, an accent used as ink, a badge pill and a 2px outline — from the MCP id alone, so the landing page and that MCP's tool pages reach the same colour without a shared lookup table that could drift.

The id is hashed with djb2 into one of six suits. Order is load-bearing, because it is what decides which MCP gets which accent:

| Suit | Face | Accent | Lands on |
|------|------|--------|----------|
| 0 | Cobalt | Antique Gold | `groceries` |
| 1 | Lemon | Signal Red | `calendar` (unregistered) |
| 2 | Lavender | Royal Violet | `transit` |
| 3 | Sky | Signal Red badge, felt ink | — |
| 4 | Mint | Royal Violet badge, felt ink | — |
| 5 | Bubblegum | Antique Gold badge, felt ink | — |

The `groceries` row is a fact. The `calendar` and `transit` rows are predictions: neither MCP is registered, and the hash keys on the id, so naming one `boodschappen` instead of `groceries` deals it a different suit. Re-derive rather than trust the table.

The last three suits are headroom. They carry felt ink so a future face stays legible without re-checking contrast.

An accent is **never** set as text on the felt or on a white section — only as ink on its own face, as a badge fill, or as an outline. Antique gold on white and royal violet on the baize both fall below the contrast floor, and the suit type deliberately offers no class that would let either happen.

## Quick Start

Everything below is live in `apps/edge/src/landing/styles.css`. Names and values must stay identical in both places; a token change edits both files in the same commit.

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-felt: #16352b;
  --color-card: #ffffff;
  --color-signal-red: #fe2f2f;
  --color-royal-violet: #7333f1;
  --color-antique-gold: #d7b73b;
  --color-lemon: #fffe5b;
  --color-lavender: #ede5ff;
  --color-cobalt: #1b5bff;
  --color-sky: #a0e9ff;
  --color-bubblegum: #ffa0f0;
  --color-mint: #b4ff91;
  --color-tangerine: #ff9559;

  /* Greys — neutral on white, tinted from the baize on felt */
  --color-charcoal: #444444;
  --color-graphite: #666666;
  --color-ash: #8fa39b;
  --color-smoke: #a3b5ae;
  --color-hairline: #2c5446;

  /* Typography */
  --font-display: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-body: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  --font-weight-heavy: 800;

  /* Typography — Scale */
  --text-caption: 12px;
  --leading-caption: 1.5;
  --text-body-sm: 14px;
  --leading-body-sm: 1.714;
  --text-body: 16px;
  --leading-body: 1.625;
  --text-subheading: 20px;
  --leading-subheading: 1.5;
  --tracking-subheading: -0.01em;
  --text-heading-sm: 24px;
  --leading-heading-sm: 1.5;
  --text-heading: 28px;
  --leading-heading: 1.286;
  --tracking-heading: -0.01em;
  --text-heading-lg: clamp(28px, 2.8vw, 40px);
  --leading-heading-lg: 1.075;
  --tracking-heading-lg: -0.02em;
  --text-display-sm: clamp(32px, 3.8vw, 55px);
  --leading-display-sm: 1.055;
  --tracking-display-sm: -0.02em;
  --text-display: clamp(36px, 4.5vw, 65px);
  --leading-display: 1;
  --tracking-display: -0.02em;
  --text-display-lg: clamp(40px, 5.6vw, 80px);
  --leading-display-lg: 0.975;
  --tracking-display-lg: -0.02em;
  --tracking-label: 0.08em;
  --tracking-badge: 0.06em;

  /* Layout */
  --container-page: 1200px;
  --section-padding: 120px;

  /* Border Radius */
  --radius-card: 13px;
  --radius-card-lg: 20px;
  --radius-pill: 38px;
  --radius-pill-lg: 64px;

  /* Borders — inset shadows, not shadows */
  --border-on-felt: inset 0 0 0 2px var(--color-card);
  --border-on-card: inset 0 0 0 2px var(--color-felt);
  --border-accent: inset 0 0 0 2px var(--color-signal-red);

  /* Surfaces */
  --surface-felt: #16352b;
  --surface-card: #ffffff;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-felt: #16352b;
  --color-card: #ffffff;
  --color-signal-red: #fe2f2f;
  --color-royal-violet: #7333f1;
  --color-antique-gold: #d7b73b;
  --color-lemon: #fffe5b;
  --color-lavender: #ede5ff;
  --color-cobalt: #1b5bff;
  --color-sky: #a0e9ff;
  --color-bubblegum: #ffa0f0;
  --color-mint: #b4ff91;
  --color-tangerine: #ff9559;

  /* Greys — five steps, each tied to the surface it sits on. The two on white
     stay neutral; the three on the baize are tinted from it and lightened,
     because a lifted ground costs the contrast pure greys relied on. */
  --color-charcoal: #444444;
  --color-graphite: #666666;
  --color-ash: #8fa39b;
  --color-smoke: #a3b5ae;
  --color-hairline: #2c5446;

  /* Typography. No webfont is loaded: Inter when the reader has it, Helvetica
     or Arial otherwise, which is the face the style is drawn from. Never set
     font-synthesis: none — the design is uniformly weight 800 and the
     fallbacks have no real 800, so synthesis is what carries it. */
  --font-display: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-body: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;

  /* Type scale. Sizes are fluid and top out at the artboard value at 1440px;
     line height rides along as a ratio so it survives the clamp. */
  --text-caption: 12px;
  --text-caption--line-height: 1.5;
  --text-body-sm: 14px;
  --text-body-sm--line-height: 1.714;
  --text-body: 16px;
  --text-body--line-height: 1.625;
  --text-subheading: 20px;
  --text-subheading--line-height: 1.5;
  --text-subheading--letter-spacing: -0.01em;
  --text-heading-sm: 24px;
  --text-heading-sm--line-height: 1.5;
  --text-heading: 28px;
  --text-heading--line-height: 1.286;
  --text-heading--letter-spacing: -0.01em;
  --text-heading-lg: clamp(28px, 2.8vw, 40px);
  --text-heading-lg--line-height: 1.075;
  --text-heading-lg--letter-spacing: -0.02em;
  --text-display-sm: clamp(32px, 3.8vw, 55px);
  --text-display-sm--line-height: 1.055;
  --text-display-sm--letter-spacing: -0.02em;
  --text-display: clamp(36px, 4.5vw, 65px);
  --text-display--line-height: 1;
  --text-display--letter-spacing: -0.02em;
  --text-display-lg: clamp(40px, 5.6vw, 80px);
  --text-display-lg--line-height: 0.975;
  --text-display-lg--letter-spacing: -0.02em;

  /* Shapes. --radius-lg / --radius-xl are Tailwind's own; left alone. */
  --radius-card: 13px;
  --radius-card-lg: 20px;
  --radius-pill: 38px;
  --radius-pill-lg: 64px;
  --container-page: 1200px;

  /* Spacing — no tokens.
     Tailwind's default 4px --spacing scale already produces the whole system.
     Defining --spacing-1..5 as 4/10/20/50/100 would silently rewrite the
     built-in p-1..p-5 utilities. 120px stays an arbitrary value: py-[120px]. */

  /* Shadows — none. Depth is an inset border:
     shadow-[inset_0_0_0_2px_var(--color-card)] on felt,
     shadow-[inset_0_0_0_2px_var(--color-felt)] on white. */
}
```
