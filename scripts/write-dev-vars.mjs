// Regenerate apps/edge/.dev.vars from the decrypted apps/edge/.env.
//
// Wrangler builds the local dev and test Worker `env` by reading files off disk, so it
// never sees what dotenvx decrypted into process.env. Left alone it reads the encrypted
// .env and hands the Worker the literal "encrypted:..." string: a non-empty value that
// passes every truthiness check and only fails later, upstream. .dev.vars takes
// precedence over .env in wrangler's lookup, so writing the real values here is what
// makes env.<KEY> mean the same thing locally as it does in production.
//
// Deliberately runs without --strict: a contributor without a private key still gets a
// working `pnpm dev`, minus the values they cannot decrypt.

import { rmSync, writeFileSync } from "node:fs";
import { runtimeKeys } from "./env-file.mjs";

const ENV_FILE = "apps/edge/.env";
const DEV_VARS_FILE = "apps/edge/.dev.vars";
const CIPHERTEXT_PREFIX = "encrypted:";

const lines = [];
const undecrypted = [];

for (const key of runtimeKeys(ENV_FILE)) {
  const value = process.env[key];
  if (value === undefined || value === "") {
    continue;
  }
  if (value.startsWith(CIPHERTEXT_PREFIX)) {
    undecrypted.push(key);
    continue;
  }
  // .dev.vars is dotenv syntax, and its double-quoted escapes line up with JSON's.
  lines.push(`${key}=${JSON.stringify(value)}`);
}

if (undecrypted.length > 0) {
  process.stderr.write(
    `Could not decrypt ${undecrypted.join(", ")} from ${ENV_FILE}. The local Worker will start without them.\n`
  );
}

if (lines.length === 0) {
  // Leave no stale file behind: an absent binding fails loudly at the use site, which
  // is the behavior we want when there is nothing real to supply.
  rmSync(DEV_VARS_FILE, { force: true });
  process.stdout.write(`No decrypted values to write to ${DEV_VARS_FILE}.\n`);
} else {
  writeFileSync(
    DEV_VARS_FILE,
    `# Generated from ${ENV_FILE} by scripts/write-dev-vars.mjs. Do not edit or commit.\n${lines.join("\n")}\n`
  );
  process.stdout.write(
    `Wrote ${lines.length} value(s) to ${DEV_VARS_FILE}: ${lines.map((l) => l.split("=")[0]).join(", ")}.\n`
  );
}
