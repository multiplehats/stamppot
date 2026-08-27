---
"@stamppot/edge": minor
---

Render the hosted landing and tool pages as React Server Components on the existing Cloudflare Worker. HTML now streams through a dedicated SSR graph with an embedded Flight payload, and copy controls use a hydrated `"use client"` component.
