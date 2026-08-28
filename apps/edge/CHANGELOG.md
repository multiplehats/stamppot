# @stamppot/edge

## 0.2.0

### Minor Changes

- 4afd9cf: Render the hosted landing and tool pages as React Server Components on the existing Cloudflare Worker. HTML now streams through a dedicated SSR graph with an embedded Flight payload, and copy controls use a hydrated `"use client"` component.
- 4afd9cf: Add an install picker to the landing hero and to every tool page.
  
  One card now covers eight clients — Claude Code, Codex, Cursor, VS Code, Gemini CLI, Windsurf, OpenClaw and Hermes Agent — instead of showing the Claude Code line and leaving everyone else to translate it. Each snippet is transcribed from that client's own documentation, because the flag shapes genuinely disagree: Claude Code and Gemini take the URL as a trailing positional, Codex and OpenClaw take `--url`, and Windsurf is the only one that spells the field `serverUrl`. Clients whose config is a file rather than a command say which file, and the copy button hands over the JSON.
  
  The behaviour lives in a headless `useInstallPicker` hook, so the hero's white card and a tool page's felt sidebar card share one implementation and one set of ARIA listbox wiring: arrow keys, Home/End, Escape, click-outside, and focus returned to the trigger on close. `InstallCard` is presentation only.
  
  The Markdown rendering of the landing page is generated from the same registry, so the two can no longer drift.
  
  Brand icons are served by Parsew, keyed by domain and resolved on the server. Any icon that cannot load falls back to the client's initial, and no key configured means no request at all.
- 4afd9cf: Redesign tool pages onto the deck system and drive the landing page from the registry.
  
  Tool pages now use the same card-table design as the landing page: a felt hero with the tool's card, a white documentation band beside a sticky connect card, and a closing band for related tools. The older light "kitchen" system is gone; `--font-mono` is the only token kept from it.
  
  Each MCP is assigned a deterministic suit — a card face, accent, badge and outline — derived from its id, so an MCP looks the same on the landing page and on every one of its tool pages. `calendar` deals lemon and signal red.
  
  The landing page deck is now built from the operation registry and the compiled content rather than a hand-written list, so a new MCP appears on the page without editing it.

### Patch Changes

- 4afd9cf: Change the deck's ground from pure black to green baize (`#16352b`).
  
  `--color-felt` is now the colour a card table actually is, so the token name reads as a description rather than a metaphor. The lighter ground costs about a stop of contrast, so the three greys that sit on it — `--color-ash`, `--color-smoke` and `--color-hairline` — are tinted from the baize and lightened to keep every pairing above AA. The two greys that sit on white are unchanged.
  
  Micro labels are now picked by their ground rather than shared across both: note-card and command-card labels sit on white and use graphite, while eyebrows and breadcrumbs on the baize use ash. Previously both used ash, which was already below AA on white and would have got worse.
- 4afd9cf: Rewrite the landing page and tool page copy in plain technical English. The card-table metaphor now lives in the visuals only: headlines, eyebrows, badges and buttons say what a thing does instead of dealing, printing or cooking it. Wording is unchanged in the compiled tool documentation and in every route, anchor and command.
- adfe17e: Soften the landing page positioning. The "Why" section leads with what Stamppot is instead of what it does not ask for, and the open source section drops its row of implementation-detail chips.
