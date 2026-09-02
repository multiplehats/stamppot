# Contributing to Stamppot

Stamppot is a collection of small, dependable MCP servers for Dutch data. Contributions should keep the public interface small, the data provenance explicit, and hosted use safe without an account.

## Workspace naming

- Use `packages/mcp-<domain>` for an independently connectable MCP, such as `mcp-transit` or `mcp-groceries`.
- Use an unprefixed noun for shared modules, such as `core`, `mcp-adapter`, or `testkit`.
- Keep source-specific adapters inside their owning MCP until at least two MCPs genuinely share them.

## Adding an MCP

1. Create `packages/mcp-<domain>` and export one `McpDefinition`.
2. Define each operation once with `defineOperation`.
3. Add `content/<operation-name>.md` for every `defineOperation` call. Start the file with YAML frontmatter containing one category, two to eight tags, and a `related` tool-name list. Follow it with one descriptive level-one heading and useful, tool-specific Markdown. Raw HTML is not allowed.
4. Include source, licence, freshness and error behavior in the operation description or package documentation.
5. Register the MCP in `apps/edge/src/worker.ts`.
6. Add deterministic tests using fixtures. Do not make the normal test suite depend on a live upstream.

The `pnpm check:mcp-content` repository rule parses `defineOperation` calls and fails when a domain MCP has missing, extra, malformed or invalidly related content. Vite uses the same parser to compile the Markdown into the landing page and `/tools/<operation-name>` pages.

## Development

```bash
pnpm install
pnpm cf-typegen
pnpm dev
```

Before opening a pull request:

```bash
pnpm check
pnpm changeset
```

Every pull request must add a changeset. Select each affected package and its semantic version bump. Use `pnpm changeset --empty` when the pull request changes only documentation, tests, CI, or other non-release files.

## Environment files

Secrets live in `apps/edge/.env*`, encrypted with [dotenvx](https://dotenvx.com/encryption) and committed that way: each file carries a plaintext `DOTENV_PUBLIC_KEY*` that anyone can encrypt with, while the matching private key stays out of the repository. Ciphertext in a public repository is the intended design, so commit these files rather than gitignoring them.

- `.env` is local development, `.env.ci` is the CI check run, `.env.production` is the deployed Worker.
- Add or change a value with `dotenvx set KEY value -f apps/edge/.env.production`, never by hand.
- Read one back with `dotenvx get KEY -f apps/edge/.env.production`, and run any command against a file with `dotenvx run -f apps/edge/.env.ci -- <command>`.
- A pre-commit hook (`dotenvx ext precommit`) refuses any staged `.env` file that still holds plaintext.

Decrypting requires the private key. Maintainers hold it through dotenvx Armor; CI reads `DOTENV_PRIVATE_KEY_CI` and `DOTENV_PRIVATE_KEY_PRODUCTION` from repository secrets. Pull requests from forks cannot read those secrets, so CI falls back to running `pnpm check` without the decrypted values. Contributors do not need a key.

Wrangler builds the local dev and test Worker `env` by reading files off disk, so it never sees what dotenvx decrypted. Pointed at the encrypted `.env` it would bind `env.<KEY>` to the literal `encrypted:...` string, which passes every truthiness check and only fails later against the upstream API. Two things prevent that:

- `vite.config.ts` and `vitest.config.ts` set `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`, so the encrypted files are never injected. A name with nothing behind it is absent, which fails loudly at the use site.
- `pnpm dev` regenerates `apps/edge/.dev.vars` first (`pnpm run dev:vars`), which wrangler prefers over `.env`. It holds the decrypted runtime values, is gitignored, and excludes `DOTENV_*` and `VITE_*` so the dev Worker sees exactly the names the deployed Worker sees.

Without a private key that step writes nothing and `pnpm dev` still runs, just without those values. Run `pnpm run dev:vars` by hand after changing `.env`.

`pnpm run deploy:production` decrypts `.env.production`, uploads every non-`VITE_` value it declares as a Worker secret, then deploys. `VITE_` values are build-time only and are inlined by Vite instead. The upload only creates and updates, so a secret set straight on the Worker and absent from `.env.production` is left alone rather than deleted. The flip side is that adding a name to `.env.production` puts it under dotenvx from then on, and the next deploy overwrites whatever the Worker currently holds for it.

After changes land on `main`, automation updates a release pull request that applies the pending versions and changelogs. Merging any pull request into `main` also validates and redeploys the Cloudflare Worker.
