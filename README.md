<p align="center">
  <img src="apps/edge/public/stamppot-bowl.png" alt="Stamppot" width="120" height="120">
</p>

<h1 align="center">Stamppot</h1>

<p align="center">Free, authless and open-source MCP servers for Dutch data.</p>

Stamppot combines small domain MCPs behind one Cloudflare Worker while keeping each MCP independently connectable.

The first is `mcp-groceries`, which searches the current Dutch grocery catalog, prices a basket across retailers, and keeps optional anonymous shopping lists. The second is `mcp-ov`, which plans train journeys, reads departure boards and rail disruptions, and returns real-time bus, tram and metro departures.

## What is included

- A combined MCP endpoint at `/mcp` and domain endpoints at `/mcp/groceries` and `/mcp/ov`
- Plain JSON discovery and invocation routes under `/v1`
- A server-rendered landing page compiled with Tailwind CSS 4
- An install picker covering eight MCP clients, on the landing page and every tool page
- Validated Markdown content and an indexable page for every tool
- A Vite-based Cloudflare Worker build and local development server
- Worker-runtime integration tests with Vitest
- Shared versions managed through the pnpm workspace catalog

There is deliberately no authentication. The immutable operation registry is created once per Worker isolate, and most tools are pure reads over a snapshot in R2. Stateful infrastructure is added only when a tool has a real persistence requirement: saved shopping lists use a Durable Object keyed by an anonymous bearer `listKey`, which is tied to no account and no MCP session.

Where a tool must reach a live upstream, the credential stays on the server. The public transport tools read the NS Reisinformatie API with a Worker secret that callers never see, bounded by short-TTL upstream caching and a per-IP rate limit; every result carries its source and says whether that source is official.

The pages are React Server Components. Only the install picker ships to the browser as a client component; everything else, including the Parsew SDK that resolves its brand icons, stays on the server. Those icons are the one third-party request the site makes, and a missing one falls back to a monogram.

## Quick start

Requirements: Node.js 22 or newer and pnpm 9.10.

```bash
pnpm install
pnpm dev
```

Vite serves the Worker and landing page at `http://localhost:5173`.

```bash
pnpm check       # lint, typecheck, test and build
pnpm build       # production Worker and static assets
pnpm deploy      # build and deploy with Wrangler
```

`pnpm deploy` changes Cloudflare state. It is not run by tests or pull request CI.

## Releases and deployment

Pull requests carry a Changesets entry. Merges to `main` update the automated release pull request and, after the full check passes, deploy the Worker to the Cloudflare Personal account. The GitHub repository needs one Actions secret:

- `CLOUDFLARE_API_TOKEN`: a token scoped to the Personal account with Workers Scripts edit access

GitHub Actions must also be allowed to create pull requests so Changesets can maintain the release pull request.

## Connect locally

```bash
claude mcp add --transport http stamppot http://localhost:5173/mcp
codex mcp add stamppot --url http://localhost:5173/mcp
```

Cursor, VS Code, Gemini CLI, Windsurf, OpenClaw and Hermes Agent are covered too. Rather than repeat them here, where they would drift, the install picker on the landing page writes the line for whichever client you pick. The same list in plain text:

```bash
curl -H 'accept: text/markdown' http://localhost:5173/
```

Both are generated from `apps/edge/src/landing/install-targets.ts`, so adding a client there updates the page, the Markdown and this workflow at once.

For a domain-only connection, use `http://localhost:5173/mcp/groceries` or `http://localhost:5173/mcp/ov`. Each tool page carries the same picker, already pointed at its own MCP.

## HTTP routes

| Route | Purpose |
| --- | --- |
| `POST /mcp` | Combined MCP transport |
| `POST /mcp/groceries` | Groceries-only MCP transport |
| `POST /mcp/ov` | Public-transport-only MCP transport |
| `GET /v1/mcps` | Discover MCPs and their operations |
| `GET /v1/tools` | Discover all operations |
| `POST /v1/tools/:name` | Invoke an operation with a JSON body |
| `GET /tools/:name` | Rich HTML or agent-readable Markdown tool documentation |
| `GET /sitemap.xml` | Index of public landing and tool pages |
| `GET /health` | Health and version response |

The HTTP adapter and MCP adapter invoke the same validated operation definitions, so schemas and behavior do not drift between transports.

## Workspace

```text
apps/edge/               Cloudflare Worker, routing and landing page
packages/core/           Operation definition and registry
packages/http-adapter/   Plain JSON transport
packages/mcp-adapter/    MCP SDK transport
packages/mcp-groceries/  Independently connectable Dutch groceries MCP
packages/mcp-ov/         Independently connectable Dutch public transport MCP
scripts/                 MCP content validation and build compiler
test/                    Unit and Worker-runtime integration tests
```

Independently connectable domain packages use `packages/mcp-<domain>`, for example `mcp-ov` and `mcp-postcode`. Infrastructure packages use descriptive names without that prefix. This keeps the `packages` directory readable as the collection grows.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the package contract and steps for adding an MCP.

## License

Apache-2.0
