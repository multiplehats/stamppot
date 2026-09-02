// Which names in an encrypted .env file describe Worker runtime secrets.
//
// DOTENV_* are dotenvx's own public keys, and VITE_* are build-time client values that
// Vite inlines into the bundle. Neither belongs in the Worker's `env`. Keeping the rule
// in one place is what makes the dev Worker, the test Worker and the deployed Worker
// agree on which names exist.

import { readFileSync } from "node:fs";

const NON_RUNTIME_PREFIX = /^(?:DOTENV_|VITE_)/;
const DECLARATION = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

export function runtimeKeys(file) {
  const keys = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const key = DECLARATION.exec(line)?.[1];
    if (key !== undefined && !NON_RUNTIME_PREFIX.test(key)) {
      keys.push(key);
    }
  }
  return keys;
}
