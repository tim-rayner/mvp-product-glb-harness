import type { GenerationRecord, PipelineVersion, ProviderProvenance } from "./schemas";
import type { GenerationProvider, ProviderError, ProviderJob } from "../generation/types";
import { RAW_FILENAME } from "./storage/constants";
import type { IngestionProfile } from "../products/profiles";

/** Package version plus the git commit and dirty state of the working tree, when git is available. */
export function defaultCodeVersion(): PipelineVersion {
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { stderr: "ignore" });
    return result.success ? result.stdout.toString().trim() : null;
  };
  const commit = git("rev-parse", "HEAD");
  const status = commit === null ? null : git("status", "--porcelain");
  return {
    codeVersion: process.env.npm_package_version ?? "unknown",
    gitCommit: commit,
    gitDirty: status === null ? null : status.length > 0,
  };
}

/** Provenance for a new provider request, before the provider has reported anything. */
export function newProviderProvenance(
  provider: GenerationProvider,
  attempt: number,
  sourceImages: string[],
): ProviderProvenance {
  return {
    name: provider.name,
    endpoint: provider.endpoint,
    model: provider.model,
    options: provider.options,
    jobId: null,
    attempt,
    submittedAt: null,
    completedAt: null,
    latencyMs: null,
    credits: null,
    sourceImages,
    reused: false,
  };
}

/** Provenance for a run that reuses an earlier provider attempt, read from its generation record. */
export function reusedProviderProvenance(record: GenerationRecord): ProviderProvenance {
  return {
    name: record.provider,
    endpoint: record.endpoint,
    model: record.model,
    options: record.settings,
    jobId: record.taskId,
    attempt: record.attempt,
    submittedAt: record.submittedAt,
    completedAt: record.completedAt ?? null,
    latencyMs: record.latencyMs,
    credits: record.creditsConsumed,
    sourceImages: record.sourceImages,
    reused: true,
  };
}

export type GenerationOutcome =
  | { status: "succeeded"; rawSha256: string }
  | { status: "failed"; error: ProviderError };

/** The `generation.json` record written beside a provider attempt. */
export function buildGenerationRecord(
  profile: IngestionProfile,
  provider: GenerationProvider,
  attempt: number,
  job: ProviderJob,
  outcome: GenerationOutcome,
): GenerationRecord {
  const error = outcome.status === "failed" ? outcome.error : null;
  return {
    product: { id: profile.source.productId, title: profile.source.title, sku: profile.source.sku },
    provider: provider.name,
    endpoint: provider.endpoint,
    model: provider.model,
    taskId: job.jobId,
    submittedAt: job.submittedAt,
    completedAt: job.completedAt,
    sourceImages: profile.benchmarkImages,
    settings: provider.options,
    latencyMs: job.latencyMs,
    providerTimings: job.providerTimings,
    creditsConsumed: job.credits,
    attempt,
    outputFile: outcome.status === "succeeded" ? RAW_FILENAME : null,
    status: outcome.status,
    error: error?.message ?? null,
    errorCode: error?.code ?? null,
    rawSha256: outcome.status === "succeeded" ? outcome.rawSha256 : null,
  };
}
