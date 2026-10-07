import { parseArgs } from "node:util";
import { env } from "../../../shared/env";
import { fail } from "../../../shared/cli/fail";
import { formatPipelineEvent, formatRunSummary } from "./pipeline-log";
import { createMeshyProvider } from "../../generation/meshy";
import { DEFAULT_OUTPUT_ROOT } from "../storage/constants";
import { ingestionProfiles, type IngestionProfile } from "../../products/profiles";
import { runIngestionPipeline, type RawInput } from "../run";
import { RunIdCollisionError } from "../storage/store";
import { errorMessage } from "../../../shared/utils/errors";
import { startViewerServer, viewerUrl } from "../../viewer/server";

/**
 * `pnpm ingest:product <slug> [--generate | --raw <file.glb>] [--run-id <id>] [--output <dir>] [--json] [--no-viewer]`
 *
 * Without `--generate` or `--raw`, reuses the newest succeeded Meshy attempt (no paid request). On
 * success the inspection viewer is served on $PORT until the process is stopped. With `--json`,
 * stdout carries only the manifest and progress goes to stderr. Exits 0 on completion, 1 on failure.
 */
const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  allowNegative: true,
  options: {
    generate: { type: "boolean", default: false },
    raw: { type: "string" },
    "run-id": { type: "string" },
    output: { type: "string", default: DEFAULT_OUTPUT_ROOT },
    json: { type: "boolean", default: false },
    viewer: { type: "boolean", default: true },
  },
});

const log = (line: string) => (args.json ? console.error(line) : console.log(line));
const exitWith = (message: string): never => fail(`[ingest] ${message}`);

function resolveRawInput(profile: IngestionProfile): RawInput {
  if (args.generate && args.raw) exitWith("Use either --generate or --raw, not both");
  if (args.raw) return { kind: "existing-file", path: args.raw };
  if (!args.generate) return { kind: "latest-provider-attempt" };
  try {
    return { kind: "generate", provider: createMeshyProvider(env.MESHY_API_KEY, profile.meshy) };
  } catch (e) {
    return exitWith(errorMessage(e));
  }
}

const knownProducts = Object.keys(ingestionProfiles).join(", ");
const slug = positionals[0] ?? exitWith(`Product required. Known: ${knownProducts}`);
const profile = ingestionProfiles[slug] ?? exitWith(`Unknown product "${slug}". Known: ${knownProducts}`);
const raw = resolveRawInput(profile);

let result;
try {
  result = await runIngestionPipeline({
    profile,
    raw,
    outputRoot: args.output,
    runId: args["run-id"],
    onEvent: (event) => log(formatPipelineEvent(event)),
  });
} catch (e) {
  if (e instanceof RunIdCollisionError) exitWith(e.message);
  throw e;
}

const { manifest } = result;
if (args.json) console.log(JSON.stringify(manifest, null, 2));
log(formatRunSummary(manifest, result.manifestPath));

if (manifest.status !== "COMPLETED") process.exit(1);
if (!args.viewer) process.exit(0);

try {
  const server = startViewerServer({ outputRoot: args.output, port: env.PORT, development: env.NODE_ENV !== "production" });
  log(`\nViewer: ${viewerUrl(server.port ?? env.PORT, slug, manifest.runId)}   (Ctrl+C to stop)`);
} catch (e) {
  log(`\nViewer not started (${errorMessage(e)}): set PORT or run \`pnpm viewer\` separately.`);
  process.exit(0);
}
