import { disableTool } from "eve/tools";

// The watcher only needs the Marktplaats connection. Removing this default
// keeps it from reaching the shell, the sandbox filesystem or the open web,
// which is also what stops it from hunting for seller contact details.
export default disableTool();
