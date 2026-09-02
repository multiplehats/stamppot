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

Wrangler reads `apps/edge/.env` itself when it starts the local dev and test Workers, and it does that with the file on disk rather than with anything dotenvx has decrypted. Those Workers therefore see the literal `encrypted:...` ciphertext under `env.<KEY>`, not the real value. Nothing reads these keys yet, so nothing is broken, but do not trust `env.<KEY>` in `pnpm dev` or in a test. Set `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false` to keep the ciphertext out, and pass real values explicitly through the `miniflare.bindings` option in `vitest.config.ts` when a test genuinely needs one.

`pnpm run deploy:production` decrypts `.env.production`, uploads every non-`VITE_` value it declares as a Worker secret, then deploys. `VITE_` values are build-time only and are inlined by Vite instead. Secrets managed outside that file, such as `NS_API_KEY`, are never touched: the upload creates and updates, and deletes nothing.

After changes land on `main`, automation updates a release pull request that applies the pending versions and changelogs. Merging any pull request into `main` also validates and redeploys the Cloudflare Worker.
