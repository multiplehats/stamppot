# `@stamppot/agent`

An [eve](https://eve.dev) agent that watches Dutch second-hand listings through Stamppot's Marktplaats MCP. It is the reference consumer for `/mcp/marktplaats`: the agent directory under `agent/` holds its instructions, the MCP connection and the disabled built-in tools, and `evals/` holds English end-to-end scenarios that run against the live MCP.

## Environment

The model and the eval judge both route through the Vercel AI Gateway. Copy `.env.example` to `.env.local` and set:

- `AI_GATEWAY_API_KEY`: a Vercel AI Gateway key. Running `pnpm exec eve link` from this directory pulls a `VERCEL_OIDC_TOKEN` instead.
- `STAMPPOT_MCP_URL`: where the Marktplaats MCP lives. It defaults to `https://stamppot.dev/mcp/marktplaats`; point it at `http://localhost:5173/mcp/marktplaats` while `pnpm dev` runs at the repository root.

`eve dev` loads and hot-reloads `.env.local`. The file is git-ignored.

## Run it

```bash
pnpm agent:dev            # from the repository root: eve's dev server and REPL
pnpm --filter @stamppot/agent exec eve dev --no-ui   # server only
```

The agent has exactly one capability surface: the two Marktplaats tools, discovered through eve's `connection_search` and called as `marktplaats__find_marktplaats_listings` and `marktplaats__get_marktplaats_listing`. The default shell, file, web and delegation tools are removed under `agent/tools/`, so the agent cannot reach anything but the MCP.

## Evals

```bash
pnpm agent:eval                       # every scenario, against a local dev server it boots itself
pnpm agent:eval -- --tag fast         # only the scenarios that need no upstream
pnpm agent:eval -- --strict --junit .eve/junit.xml
pnpm agent:eval -- --list
```

The scenarios under `evals/marktplaats/` are the product spec in executable form: a plain wish for a used PS5 near Enschede becomes one filtered search; a category refinement copies both ids from `categorySuggestions`; condition is judged from the full listing, not the snippet; an unknown place is relayed instead of widened to the whole country; a budget becomes `maxPriceEuro` and prices are reported with their price type; a follow-up check carries `observedAt` forward as `postedSince`; a supplied postcode passes through untouched; a request for a seller's phone number is declined; a greeting uses no tools.

Deterministic assertions (which tools were called, with which arguments, and what the reply contains) are gates. The LLM-judge assertions use the model in `evals/evals.config.ts` and are soft thresholds; without a gateway key they are reported as skipped. The `live` tag marks scenarios that read the real Marktplaats source, so keep concurrency modest: `--max-concurrency 2` stays well inside the MCP's per-IP rate limit.
