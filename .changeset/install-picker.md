---
"@stamppot/edge": minor
---

Add an install picker to the landing hero and to every tool page.

One card now covers eight clients — Claude Code, Codex, Cursor, VS Code, Gemini CLI, Windsurf, OpenClaw and Hermes Agent — instead of showing the Claude Code line and leaving everyone else to translate it. Each snippet is transcribed from that client's own documentation, because the flag shapes genuinely disagree: Claude Code and Gemini take the URL as a trailing positional, Codex and OpenClaw take `--url`, and Windsurf is the only one that spells the field `serverUrl`. Clients whose config is a file rather than a command say which file, and the copy button hands over the JSON.

The behaviour lives in a headless `useInstallPicker` hook, so the hero's white card and a tool page's felt sidebar card share one implementation and one set of ARIA listbox wiring: arrow keys, Home/End, Escape, click-outside, and focus returned to the trigger on close. `InstallCard` is presentation only.

The Markdown rendering of the landing page is generated from the same registry, so the two can no longer drift.

Brand icons are served by Parsew, keyed by domain and resolved on the server. Any icon that cannot load falls back to the client's initial, and no key configured means no request at all.
