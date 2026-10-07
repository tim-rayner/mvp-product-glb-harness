import path from "node:path";
import { DEFAULT_OUTPUT_ROOT, MANIFEST_FILENAME, UNVALIDATED_FILENAME } from "./storage/constants";
import { Halt } from "./errors";
import { createInitialManifest } from "./manifest";
import { defaultCodeVersion } from "./provenance";
import { createStageRunner, type StageRunner } from "./stage-runner";
import { createRunDir, timestampRunId, writeManifest } from "./storage/store";
import type { IngestOptions, PipelineRunResult, StageContext } from "./types";
import { acquireRaw, describeAcquiredRaw, recordProviderUsage } from "./stages/acquire-raw";
import { correctAsset, describeCorrection, describeExport, exportCorrected } from "./stages/correct";
import {
  checkProportions,
  describeInspection,
  describeProportionalCheck,
  inspectRaw,
  proportionalFailure,
} from "./stages/inspect-raw";
import { describeLoadedSource, loadSource } from "./stages/load-source";
import { describePersistedRaw, persistRaw } from "./stages/persist-raw";
import { exposeToViewer, publishCorrected, rejectExport } from "./stages/publish";
import { describeValidation, validateExport } from "./stages/validate";

export { defaultCodeVersion };
export type { IngestOptions, PipelineEvent, PipelineRunResult, RawInput } from "./types";

/** The ingestion stages in order. Stops at the first failure; never writes to a raw GLB. */
async function runStages(ctx: StageContext, { stage, stop }: StageRunner, options: IngestOptions) {
  const { source, config, axisMapping } = await stage(
    "load-source",
    () => loadSource(ctx, options.config),
    describeLoadedSource,
  );

  const acquired = await stage("acquire-raw", () => acquireRaw(ctx, options.raw), describeAcquiredRaw);
  recordProviderUsage(ctx, acquired);
  const raw = await stage("persist-raw", () => persistRaw(ctx, acquired), describePersistedRaw);

  const inspected = await stage(
    "inspect-raw",
    () => inspectRaw(ctx, raw.bytes, source, axisMapping, config),
    describeInspection,
  );
  const check = await stage(
    "proportional-check",
    () => checkProportions(ctx, inspected.analysis, axisMapping, config),
    (decision) => describeProportionalCheck(decision, inspected.analysis),
  );
  if (check.status === "FAIL") await stop("proportional-check", proportionalFailure(check));

  const corrected = await stage(
    "correct",
    () => correctAsset(ctx, inspected, source, axisMapping, config, raw.ref.sha256),
    describeCorrection,
  );

  const unvalidatedPath = path.join(ctx.runDir, UNVALIDATED_FILENAME);
  await stage(
    "export",
    () => exportCorrected(inspected, unvalidatedPath),
    (byteLength) => describeExport(byteLength, unvalidatedPath),
  );
  const validated = await stage(
    "validate",
    () => validateExport(ctx, unvalidatedPath, source, config, inspected, corrected, raw),
    describeValidation,
  );
  if (validated.decision.status !== "PASS") {
    await stop("validate", await rejectExport(ctx, unvalidatedPath, validated.decision));
  }

  await stage("persist-provenance", () => publishCorrected(ctx, unvalidatedPath, validated.bytes));
  await stage("expose-viewer", () => exposeToViewer(ctx));
}

/**
 * Runs one ingestion as explicit stages, persisting the manifest after each. A failing run still
 * resolves, with status FAILED and the error recorded in the manifest.
 */
export async function runIngestionPipeline(options: IngestOptions): Promise<PipelineRunResult> {
  const now = options.now ?? (() => new Date());
  const outputRoot = options.outputRoot ?? DEFAULT_OUTPUT_ROOT;
  const { profile } = options;
  const emit = options.onEvent ?? (() => {});
  const startedAt = now();
  const runId = options.runId ?? timestampRunId(startedAt);
  const runDir = await createRunDir(outputRoot, profile.slug, runId);

  const manifest = createInitialManifest(profile, runId, startedAt, options.codeVersion ?? defaultCodeVersion());
  const runner = createStageRunner({
    manifest,
    now,
    emit,
    save: (m) => writeManifest(outputRoot, m, profile.slug),
  });
  const ctx: StageContext = { manifest, profile, outputRoot, runDir, now, emit, warn: runner.warn };

  await runner.persist();
  try {
    await runStages(ctx, runner, options);
    await runner.finish("COMPLETED");
  } catch (e) {
    if (!(e instanceof Halt)) await runner.failUnexpected(e);
  }

  return { manifest, runDir, manifestPath: path.join(runDir, MANIFEST_FILENAME) };
}
