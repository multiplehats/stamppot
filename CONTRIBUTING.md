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

After changes land on `main`, automation updates a release pull request that applies the pending versions and changelogs. Merging any pull request into `main` also validates and redeploys the Cloudflare Worker.
