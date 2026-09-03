// biome-ignore-all lint/style/useFilenamingConvention: eve resolves the built-in tool to disable by this exact filename.
import { disableTool } from "eve/tools";

// The watcher only needs the Marktplaats connection. Removing this default
// keeps it from reaching the shell, the sandbox filesystem or the open web,
// which is also what stops it from hunting for seller contact details.
export default disableTool();
