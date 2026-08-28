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
  buildStopsArtifacts,
  publishStopsArtifacts,
  type StopsArtifactObject,
  type StopsPublisher,
  validateStopsArtifacts,
} from "@stamppot/mcp-ov/stops-build";
import {
  NS_STATIONS_URL,
  OVAPI_STOP_AREAS_URL,
  STOPS_MANIFEST_KEY,
} from "../packages/mcp-ov/src/stops-format";

const DEFAULT_BUCKET = "stamppot-ov-stops";
const WRANGLER_CONFIG = "apps/edge/wrangler.jsonc";
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const R2_BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const NS_API_KEY_HEADER = "Ocp-Apim-Subscription-Key";

type SyncMode = "build-only" | "local" | "remote";

interface CliOptions {
  readonly bucket: string;
  readonly ifEmpty: boolean;
  readonly jurisdiction: "eu" | undefined;
  readonly mode: SyncMode;
  readonly nsSource: string;
  readonly output: string | undefined;
  readonly ovApiSource: string;
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
    throw new Error("Stops sync mode is required");
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
      "ns-source": { type: "string" },
      output: { type: "string" },
      "ovapi-source": { type: "string" },
      remote: { type: "boolean" },
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
    nsSource: values["ns-source"] ?? NS_STATIONS_URL,
    output: values.output,
    ovApiSource: values["ovapi-source"] ?? OVAPI_STOP_AREAS_URL,
  };
}

async function readResponseBytes(response: Response): Promise<Uint8Array> {
  if (!response.ok) {
    throw new Error(`Stops source returned HTTP ${response.status}`);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) {
    throw new Error("Stops source exceeds the 64 MiB input bound");
  }
  if (response.body === null) {
    throw new Error("Stops source returned an empty body");
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
      throw new Error("Stops source exceeds the 64 MiB input bound");
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

/** The NS key is only ever needed here, never by the sync's OVapi read. */
function nsRequestHeaders(source: string): Record<string, string> {
  if (source !== NS_STATIONS_URL) {
    return { accept: "application/json" };
  }
  const apiKey = process.env.NS_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    throw new Error(
      "Reading live NS stations requires NS_API_KEY in the environment"
    );
  }
  return { accept: "application/json", [NS_API_KEY_HEADER]: apiKey };
}

async function loadSource(
  source: string,
  headers: Record<string, string>
): Promise<unknown> {
  let bytes: Uint8Array;
  if (source.startsWith("https://") || source.startsWith("http://")) {
    bytes = await readResponseBytes(await fetch(source, { headers }));
  } else {
    const file = await readFile(resolve(source));
    if (file.byteLength > MAX_SOURCE_BYTES) {
      throw new Error("Stops source exceeds the 64 MiB input bound");
    }
    bytes = new Uint8Array(file);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function writeArtifacts(
  root: string,
  objects: readonly StopsArtifactObject[]
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
    `${options.bucket}/${STOPS_MANIFEST_KEY}`,
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
  throw new Error("Wrangler could not inspect the local stops manifest");
}

function createWranglerPublisher(
  options: CliOptions,
  paths: ReadonlyMap<string, string>
): StopsPublisher {
  return {
    async put(object) {
      const filePath = paths.get(object.key);
      if (filePath === undefined) {
        throw new Error("Stops publisher received an unknown artifact");
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
          `Wrangler failed to publish a stops artifact (${object.key}): ${result.stderr.trim() || result.stdout.trim()}`
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
  await cp(join(temporaryRoot, "stops"), join(output, "stops"), {
    errorOnExist: true,
    force: false,
    recursive: true,
  });
}

async function main(): Promise<void> {
  const options = parseCliOptions();
  if (options.ifEmpty && (await localManifestExists(options))) {
    process.stdout.write("Local stops snapshot already exists; skipped.\n");
    return;
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "stamppot-ov-"));
  try {
    const [nsStations, ovApiStopAreas] = await Promise.all([
      loadSource(options.nsSource, nsRequestHeaders(options.nsSource)),
      loadSource(options.ovApiSource, { accept: "application/json" }),
    ]);
    const artifacts = await buildStopsArtifacts({
      nsStations,
      observedAt: new Date(),
      ovApiStopAreas,
    });
    await validateStopsArtifacts(artifacts);
    const paths = await writeArtifacts(temporaryRoot, artifacts.objects);

    if (options.mode === "build-only") {
      await copyBuildOutput(temporaryRoot, options.output ?? "");
    } else {
      await publishStopsArtifacts(
        artifacts,
        createWranglerPublisher(options, paths)
      );
    }

    process.stdout.write(
      `version=${artifacts.version} stops=${artifacts.stopCount} stations=${artifacts.stationCount} stopAreas=${artifacts.stopAreaCount} manifestSha256=${artifacts.manifestHash}\n`
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Stops synchronization failed"}\n`
  );
  process.exitCode = 1;
}
