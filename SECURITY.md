# Security

Please report vulnerabilities privately rather than opening a public issue. Until a dedicated security address is published, contact the repository owner through their GitHub profile.

Stamppot's hosted MCPs are intentionally unauthenticated and read-only. New operations must bound input size, response size, upstream time and query complexity. Do not add secrets to source or `wrangler.jsonc`; use Wrangler secrets and `.dev.vars` for local development.
