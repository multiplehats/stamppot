# Security

Please report vulnerabilities privately rather than opening a public issue. Until a dedicated security address is published, contact the repository owner through their GitHub profile.

Stamppot's hosted MCPs are intentionally authless and bounded. Catalog search and basket planning are read-only. The only hosted mutation is a capped, whole-document shopping-list save: possession of an unguessable `listKey` authorizes access to exactly one anonymous document, without authenticating an account or global identity. Saves are size-limited, expire after 90 days and pass through an approximate rate-limit abuse brake.

New operations must bound input size, response size, upstream time and query complexity. Never place shopping-list capabilities or other sensitive tool arguments in URLs, logs, analytics or errors. Do not add secrets to source or `wrangler.jsonc`; use Wrangler secrets and `.dev.vars` for local development.
