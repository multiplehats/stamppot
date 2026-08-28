import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  buildCatalogArtifacts,
  type CatalogArtifactObject,
  type CatalogPublisher,
  publishCatalogArtifacts,
  validateCatalogArtifacts,
} from "@stamppot/mcp-groceries/catalog-build";
import {
  CATALOG_MANIFEST_KEY,
  CHECKJEBON_DATA_URL,
} from "../packages/mcp-groceries/src/catalog-format";

const DEFAULT_BUCKET = "stamppot-groceries-catalog";
const WRANGLER_CONFIG = "apps/edge/wrangler.jsonc";
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const R2_BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

type SyncMode = "build-only" | "local" | "remote";

interface CliOptions {
  readonly bucket: string;
  readonly ifEmpty: boolean;
  readonly jurisdiction: "eu" | undefined;
  readonly mode: SyncMode;
  readonly output: string | undefined;
  readonly source: string;
}

interface CommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

function selectSyncMode(
  local: boolean | undefined,
  remote: boolean | undefined,
  buildOnly: boolean | undefined
): SyncMode {
  const selectedModes = [
    local === true ? "local" : undefined,
    remote === true ? "remote" : undefined,
    buildOnly === true ? "build-only" : undefined,
  ].filter(
    (candidateMode): candidateMode is SyncMode => candidateMode !== undefined
  );
  if (selectedModes.length !== 1) {
    throw new Error("Select exactly one of --local, --remote, or --build-only");
  }
  const [mode] = selectedModes;
  if (mode === undefined) {
    throw new Error("Catalog sync mode is required");
  }
  return mode;
}

function parseCliOptions(): CliOptions {
  const { values } = parseArgs({
    allowPositionals: false,
    options: {
      bucket: { type: "string" },
      "build-only": { type: "boolean" },
      "if-empty": { type: "boolean" },
      jurisdiction: { type: "string" },
      local: { type: "boolean" },
      output: { type: "string" },
      remote: { type: "boolean" },
      source: { type: "string" },
    },
    strict: true,
  });
  const mode = selectSyncMode(
    values.local,
    values.remote,
    values["build-only"]
  );

  const bucket = values.bucket ?? DEFAULT_BUCKET;
  if (!R2_BUCKET_PATTERN.test(bucket)) {
    throw new Error("Bucket must be an explicit valid R2 bucket name");
  }
  if (mode === "remote" && values.bucket === undefined) {
    throw new Error(
      "Remote publication requires --bucket with an explicit name"
    );
  }
  if (mode === "remote" && values.jurisdiction !== "eu") {
    throw new Error("Remote publication requires --jurisdiction eu");
  }
  if (mode !== "remote" && values.jurisdiction !== undefined) {
    throw new Error("--jurisdiction is only accepted with --remote");
  }
  if (values["if-empty"] === true && mode !== "local") {
    throw new Error("--if-empty is only accepted with --local");
  }
  if (mode === "build-only" && values.output === undefined) {
    throw new Error("--build-only requires --output");
  }
  if (mode !== "build-only" && values.output !== undefined) {
    throw new Error("--output is only accepted with --build-only");
  }

  return {
    bucket,
    ifEmpty: values["if-empty"] === true,
    jurisdiction: mode === "remote" ? "eu" : undefined,
    mode,
    output: values.output,
    source: values.source ?? CHECKJEBON_DATA_URL,
  };
}

async function readResponseBytes(response: Response): Promise<Uint8Array> {
  if (!response.ok) {
    throw new Error(`Catalog source returned HTTP ${response.status}`);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) {
    throw new Error("Catalog source exceeds the 64 MiB input bound");
  }
  if (response.body === null) {
    throw new Error("Catalog source returned an empty body");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let readResult = await reader.read();
  while (!readResult.done) {
    const { value } = readResult;
    byteLength += value.byteLength;
    if (byteLength > MAX_SOURCE_BYTES) {
      // biome-ignore lint/performance/noAwaitInLoops: The reader must be canceled before throwing so the oversized response does not keep streaming.
      await reader.cancel();
      throw new Error("Catalog source exceeds the 64 MiB input bound");
    }
    chunks.push(value);
    readResult = await reader.read();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function loadSource(source: string): Promise<unknown> {
  let bytes: Uint8Array;
  if (source.startsWith("https://") || source.startsWith("http://")) {
    bytes = await readResponseBytes(
      await fetch(source, { headers: { accept: "application/json" } })
    );
  } else {
    const file = await readFile(resolve(source));
    if (file.byteLength > MAX_SOURCE_BYTES) {
      throw new Error("Catalog source exceeds the 64 MiB input bound");
    }
    bytes = new Uint8Array(file);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function writeArtifacts(
  root: string,
  objects: readonly CatalogArtifactObject[]
): Promise<ReadonlyMap<string, string>> {
  const pathEntries = await Promise.all(
    objects.map(async (object) => {
      const filePath = join(root, object.key);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, object.body);
      return [object.key, filePath] as const;
    })
  );
  return new Map(pathEntries);
}

function runCommand(
  command: string,
  args: readonly string[]
): Promise<CommandResult> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: Uint8Array[] = [];
    child.stdout.on("data", (chunk: Uint8Array) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Uint8Array) => stderrChunks.push(chunk));
    child.on("error", rejectCommand);
    child.on("close", (exitCode) => {
      resolveCommand({
        exitCode: exitCode ?? 1,
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
      });
    });
  });
}

function wranglerStorageArguments(options: CliOptions): string[] {
  const argumentsList = [
    "--config",
    WRANGLER_CONFIG,
    options.mode === "local" ? "--local" : "--remote",
  ];
  if (options.jurisdiction !== undefined) {
    argumentsList.push("--jurisdiction", options.jurisdiction);
  }
  return argumentsList;
}

async function localManifestExists(options: CliOptions): Promise<boolean> {
  const result = await runCommand("wrangler", [
    "r2",
    "object",
    "get",
    `${options.bucket}/${CATALOG_MANIFEST_KEY}`,
    "--pipe",
    ...wranglerStorageArguments(options),
  ]);
  if (result.exitCode === 0) {
    return true;
  }
  const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (output.includes("not found") || output.includes("does not exist")) {
    return false;
  }
  throw new Error("Wrangler could not inspect the local catalog manifest");
}

function createWranglerPublisher(
  options: CliOptions,
  paths: ReadonlyMap<string, string>
): CatalogPublisher {
  return {
    async put(object) {
      const filePath = paths.get(object.key);
      if (filePath === undefined) {
        throw new Error("Catalog publisher received an unknown artifact");
      }
      const result = await runCommand("wrangler", [
        "r2",
        "object",
        "put",
        `${options.bucket}/${object.key}`,
        "--file",
        filePath,
        "--content-type",
        "application/json",
        "--force",
        ...wranglerStorageArguments(options),
      ]);
      if (result.exitCode !== 0) {
        throw new Error(
          `Wrangler failed to publish a catalog artifact (${object.key}): ${result.stderr.trim() || result.stdout.trim()}`
        );
      }
    },
  };
}

async function copyBuildOutput(
  temporaryRoot: string,
  outputDirectory: string
): Promise<void> {
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length > 0) {
    throw new Error("Build output directory must be empty");
  }
  await cp(join(temporaryRoot, "catalog"), join(output, "catalog"), {
    errorOnExist: true,
    force: false,
    recursive: true,
  });
}

async function main(): Promise<void> {
  const options = parseCliOptions();
  if (options.ifEmpty && (await localManifestExists(options))) {
    process.stdout.write("Local grocery catalog already exists; skipped.\n");
    return;
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "stamppot-groceries-"));
  try {
    const source = await loadSource(options.source);
    const artifacts = await buildCatalogArtifacts({
      observedAt: new Date(),
      source,
    });
    await validateCatalogArtifacts(artifacts);
    const paths = await writeArtifacts(temporaryRoot, artifacts.objects);

    if (options.mode === "build-only") {
      await copyBuildOutput(temporaryRoot, options.output ?? "");
    } else {
      await publishCatalogArtifacts(
        artifacts,
        createWranglerPublisher(options, paths),
        // Local publication runs one `wrangler r2 object put` process per object
        // against a single miniflare SQLite persistence file; concurrent writers
        // collide with SQLITE_BUSY, so serialize them. Remote puts are independent
        // HTTPS requests and keep the default concurrency.
        options.mode === "local" ? 1 : undefined
      );
    }

    process.stdout.write(
      `version=${artifacts.version} objects=${artifacts.objects.length} offers=${artifacts.offerCount} manifestSha256=${artifacts.manifestHash}\n`
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Catalog synchronization failed"}\n`
  );
  process.exitCode = 1;
}
