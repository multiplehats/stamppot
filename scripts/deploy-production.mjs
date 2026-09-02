// Production deploy. Runs under `dotenvx run -f apps/edge/.env.production`, which
// decrypts that file into this process' environment.
//
// Two kinds of value live in .env.production and they leave here by different doors:
//   VITE_*    build-time client values that Vite inlines into the bundle, so they only
//             need to be in the environment while `vite build` runs.
//   DOTENV_*  dotenvx's own public keys. They never leave this process.
//   everything else  Worker runtime secrets, uploaded before `wrangler deploy` so the
//             new code never goes live expecting a secret that is not there yet.
//
// The secret names come from .env.production rather than from process.env, so that the
// ambient CI environment (API tokens, GITHUB_*, PATH, ...) can never be swept into the
// upload. Values still come from process.env, because that is where dotenvx put them.

import { spawnSync } from "node:child_process";
import { runtimeKeys } from "./env-file.mjs";

const ENV_FILE = "apps/edge/.env.production";
const WRANGLER_CONFIG = "dist/stamppot/wrangler.json";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${result.status}`
    );
  }
}

function collectRuntimeSecrets() {
  const secrets = {};
  const missing = [];
  for (const key of runtimeKeys(ENV_FILE)) {
    const value = process.env[key];
    if (value === undefined || value === "") {
      missing.push(key);
    } else {
      secrets[key] = value;
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `${ENV_FILE} declares ${missing.join(", ")} but the value(s) did not reach the environment. Run this through: pnpm run deploy:production`
    );
  }
  return secrets;
}

// Build first: `wrangler secret bulk` targets the same config the deploy uses, so the
// secrets and the code cannot drift onto different Workers.
run("pnpm", ["run", "build"]);

const secrets = collectRuntimeSecrets();
const names = Object.keys(secrets);

if (names.length === 0) {
  process.stdout.write(`No runtime secrets declared in ${ENV_FILE}.\n`);
} else {
  process.stdout.write(`Uploading Worker secret(s): ${names.join(", ")}.\n`);
  // Only the listed keys are sent. `secret bulk` creates and updates; it deletes
  // nothing, so secrets managed outside this file (NS_API_KEY) survive untouched.
  run(
    "pnpm",
    ["exec", "wrangler", "secret", "bulk", "--config", WRANGLER_CONFIG],
    {
      input: JSON.stringify(secrets),
      stdio: ["pipe", "inherit", "inherit"],
    }
  );
}

run("pnpm", ["exec", "wrangler", "deploy", "--config", WRANGLER_CONFIG]);
