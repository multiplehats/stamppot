# `@stamppot/agent`

An [eve](https://eve.dev) agent that watches Dutch second-hand listings through Stamppot's Marktplaats MCP. It is the reference consumer for `/mcp/marktplaats`: the agent directory under `agent/` holds its instructions, the MCP connection and the disabled built-in tools, and `evals/` holds English end-to-end scenarios that run against the live MCP.

## Environment

The vision-capable agent (`deepseek/deepseek-v4-flash-vision-exp`) and its separate eval judge both route through the Vercel AI Gateway. Their credentials live in the committed dotenvx ciphertext files: `.env` for development, `.env.ci` for evals, and `.env.production` for deployment. Set:

- `AI_GATEWAY_API_KEY`: a Vercel AI Gateway key.
- `STAMPPOT_MCP_URL`: where the Marktplaats MCP lives. It defaults to `https://stamppot.dev/mcp/marktplaats`; point it at `http://localhost:5173/mcp/marktplaats` while `pnpm dev` runs at the repository root.

Use `dotenvx set AI_GATEWAY_API_KEY <value> -f <file>` to change a credential; never edit a decrypted value into a tracked file. The package scripts decrypt the appropriate file before starting eve. Decryption requires the matching private key through dotenvx Armor or the corresponding `DOTENV_PRIVATE_KEY*` environment variable.

## Run it

```bash
pnpm agent:dev                                  # from the repository root: eve's dev server and REPL
pnpm --filter @stamppot/agent dev --no-ui       # server only
```

The agent can use the two Marktplaats MCP tools, discovered through eve's `connection_search` and called as `marktplaats__find_marktplaats_listings` and `marktplaats__get_marktplaats_listing`, plus `inspect-marktplaats-images`. The image tool accepts only HTTPS URLs from the Marktplaats image hosts, downloads at most four supported images of at most 2 MiB each, and passes their pixels to the vision model. The default shell, file, web and delegation tools are removed under `agent/tools/`, so it cannot browse elsewhere or hunt for seller contact details.

## Evals

```bash
pnpm agent:eval                       # every scenario, against a local dev server it boots itself
pnpm agent:eval --tag fast         # only the scenarios that need no upstream
pnpm agent:eval --strict --junit .eve/junit.xml
pnpm agent:eval --list
```

The scenarios under `evals/mcp-marktplaats/` are the product spec in executable form: a plain wish for a used PS5 near Enschede becomes one filtered search; a category refinement copies both ids from `categorySuggestions`; condition is judged from the full listing, not the snippet; listing photos are inspected before making visual damage claims; an unknown place is relayed instead of widened to the whole country; a budget becomes `maxPriceEuro` and prices are reported with their price type; a follow-up check carries `observedAt` forward as `postedSince`; a supplied postcode passes through untouched; a request for a seller's phone number is declined; a greeting uses no tools.

Deterministic assertions (which tools were called, with which arguments, and what the reply contains) are gates. The LLM-judge assertions use the model in `evals/evals.config.ts` and are soft thresholds; without a gateway key they are reported as skipped. The `live` tag marks scenarios that read the real Marktplaats source, so keep concurrency modest: `--max-concurrency 2` stays well inside the MCP's per-IP rate limit.
