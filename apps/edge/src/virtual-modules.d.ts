declare module "virtual:stamppot-mcp-content" {
  const content: readonly import("./landing/content-types").CompiledToolContent[];
  export default content;
}

/**
 * The two OpenPanel client IDs. Both are public project identifiers, so they
 * travel as `VITE_*` and Vite inlines them at build time — the browser bundle
 * needs one, and the Worker cannot read them from `env` because only the
 * matching secrets are uploaded as Worker secrets. Absent at build time (a
 * contributor's `pnpm dev`, or CI) they stay `undefined` and analytics is off.
 */
interface ImportMetaEnv {
  readonly VITE_OPENPANEL_BACKEND_CLIENT_ID?: string;
  readonly VITE_OPENPANEL_CLIENT_ID?: string;
}
