import type { PipelineStage, RunManifest } from "./schemas";
import { errorMessage } from "../../shared/utils/errors";
import { DEFAULT_ERROR_CODE, Halt, toStageFailure, type StageFailure } from "./errors";
import type { PipelineEvent } from "./types";

export interface StageRunnerOptions {
  manifest: RunManifest;
  now: () => Date;
  emit: (event: PipelineEvent) => void;
  save: (manifest: RunManifest) => Promise<void>;
}

export type StageRunner = ReturnType<typeof createStageRunner>;

/**
 * Runs pipeline stages against one manifest. Each stage records its timing, persists the manifest
 * and either completes or stops the run with a typed error.
 */
export function createStageRunner({ manifest, now, emit, save }: StageRunnerOptions) {
  const clock = () => performance.now();
  const startedAt = clock();

  async function persist() {
    manifest.updatedAt = now().toISOString();
    await save(manifest);
  }

  function warn(stage: PipelineStage, message: string) {
    manifest.warnings.push(message);
    emit({ type: "warning", stage, message });
  }

  async function finish(status: RunManifest["status"]) {
    manifest.status = status;
    manifest.finishedAt = now().toISOString();
    manifest.timings.totalMs = clock() - startedAt;
    const generationMs = manifest.timings.stagesMs["acquire-raw"] ?? 0;
    manifest.timings.processingMs = manifest.timings.totalMs - generationMs;
    await persist();
  }

  /** Records a failure, finishes the run as FAILED and halts it. */
  async function stop(stage: PipelineStage, failure: StageFailure): Promise<never> {
    manifest.errors.push({
      code: failure.code,
      stage,
      message: failure.message,
      ...(failure.details ? { details: failure.details } : {}),
    });
    emit({ type: "stage-failed", stage, code: failure.code, message: failure.message });
    await finish("FAILED");
    throw new Halt();
  }

  /** Records an unexpected error outside any stage, so the run still leaves an inspectable failure state. */
  async function failUnexpected(e: unknown) {
    const stage = manifest.currentStage ?? "load-source";
    manifest.errors.push({ code: DEFAULT_ERROR_CODE[stage], stage, message: errorMessage(e) });
    await finish("FAILED");
  }

  async function stage<T>(name: PipelineStage, fn: () => T | Promise<T>, summary?: (result: T) => string): Promise<T> {
    manifest.currentStage = name;
    emit({ type: "stage-start", stage: name });
    const start = clock();
    let result: T;
    try {
      result = await fn();
    } catch (e) {
      manifest.timings.stagesMs[name] = clock() - start;
      if (e instanceof Halt) throw e;
      return stop(name, toStageFailure(name, e));
    }
    const durationMs = clock() - start;
    manifest.timings.stagesMs[name] = durationMs;
    manifest.completedStages.push(name);
    emit({ type: "stage-complete", stage: name, durationMs, summary: summary?.(result) });
    await persist();
    return result;
  }

  return { stage, stop, warn, finish, persist, failUnexpected };
}
