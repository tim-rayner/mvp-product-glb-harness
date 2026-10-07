import path from "node:path";
import type { RawAssetRef } from "../schemas";
import { ProviderError, type GenerationProvider, type ProviderJob } from "../../generation/types";
import { displayPath, exists, sha256, writeJsonAtomic } from "../../../shared/utils/files";
import { GENERATION_RECORD_FILENAME } from "../storage/constants";
import { StageFailure } from "../errors";
import { buildGenerationRecord, newProviderProvenance, reusedProviderProvenance } from "../provenance";
import { findLatestSucceededAttempt, readGenerationRecord, reserveAttemptDir } from "../storage/store";
import type { RawInput, StageContext } from "../types";

/** Raw bytes in memory, not yet persisted. A generated asset still needs its generation record written. */
export type AcquiredRaw =
  | { kind: "generated"; bytes: Uint8Array; dir: string; attempt: number; provider: GenerationProvider; job: ProviderJob }
  | { kind: "existing"; bytes: Uint8Array; file: string; origin: RawAssetRef["origin"]; attempt: number | null };

/** Makes a new provider request in a freshly reserved attempt directory. A failed request still leaves its generation record. */
async function generateRaw(ctx: StageContext, provider: GenerationProvider): Promise<AcquiredRaw> {
  const { manifest, profile, outputRoot, emit } = ctx;
  const { attempt, dir } = await reserveAttemptDir(outputRoot, profile.slug, provider.name);
  manifest.attempt = attempt;
  const provenance = newProviderProvenance(provider, attempt, profile.benchmarkImages);
  manifest.provenance.provider = provenance;

  try {
    const result = await provider.generate(
      { productId: profile.source.productId, imageUrls: profile.benchmarkImages, attempt },
      (message) => emit({ type: "progress", stage: "acquire-raw", message }),
    );
    Object.assign(provenance, {
      jobId: result.job.jobId,
      submittedAt: result.job.submittedAt,
      completedAt: result.job.completedAt,
      latencyMs: result.job.latencyMs,
      credits: result.job.credits,
    });
    return { kind: "generated", bytes: result.glb, dir, attempt, provider, job: result.job };
  } catch (e) {
    if (e instanceof ProviderError) {
      Object.assign(provenance, { jobId: e.job.jobId, submittedAt: e.job.submittedAt, credits: e.job.credits });
      manifest.cost.credits = e.job.credits;
      const record = buildGenerationRecord(profile, provider, attempt, e.job, { status: "failed", error: e });
      await writeJsonAtomic(path.join(dir, GENERATION_RECORD_FILENAME), record);
    }
    throw e;
  }
}

async function resolveExistingFile(ctx: StageContext, raw: Exclude<RawInput, { kind: "generate" }>) {
  if (raw.kind === "existing-file") {
    if (!(await exists(raw.path))) throw new StageFailure("RAW_ASSET_UNAVAILABLE", `Raw GLB not found: ${raw.path}`);
    return { file: raw.path, origin: "existing-file" as const, attempt: null };
  }
  const latest = await findLatestSucceededAttempt(ctx.outputRoot, ctx.profile.slug);
  if (!latest) {
    throw new StageFailure(
      "RAW_ASSET_UNAVAILABLE",
      `No succeeded provider attempt under ${displayPath(path.join(ctx.outputRoot, ctx.profile.slug))}: ` +
        "run with --generate (new paid Meshy request) or --raw <file.glb>",
    );
  }
  return { file: latest.rawPath, origin: "existing-provider-attempt" as const, attempt: latest.attempt };
}

/**
 * Reads a GLB already on disk. When it is a provider attempt with a succeeded generation record,
 * the provider provenance is picked up from that record and the bytes are checked against the
 * sha256 recorded at download time.
 */
async function loadExistingRaw(ctx: StageContext, raw: Exclude<RawInput, { kind: "generate" }>): Promise<AcquiredRaw> {
  const { manifest } = ctx;
  let { file, origin, attempt } = await resolveExistingFile(ctx, raw);

  const record = await readGenerationRecord(path.dirname(file));
  const isRecordedOutput = record?.outputFile === path.basename(file);
  if (record && record.status === "succeeded" && isRecordedOutput) {
    origin = "existing-provider-attempt";
    attempt = record.attempt;
    manifest.provenance.provider = reusedProviderProvenance(record);
  }
  manifest.attempt = attempt;

  const bytes = await Bun.file(file).bytes();
  if (record?.rawSha256 && isRecordedOutput && record.rawSha256 !== sha256(bytes)) {
    throw new StageFailure("RAW_ASSET_MUTATED", `${file} no longer matches the sha256 recorded when it was downloaded`);
  }
  return { kind: "existing", bytes, file, origin, attempt };
}

export function acquireRaw(ctx: StageContext, raw: RawInput): Promise<AcquiredRaw> {
  return raw.kind === "generate" ? generateRaw(ctx, raw.provider) : loadExistingRaw(ctx, raw);
}

/** Copies provider latency and cost onto the manifest; a reused attempt costs nothing and is flagged. */
export function recordProviderUsage({ manifest, warn }: StageContext, acquired: AcquiredRaw) {
  const provider = manifest.provenance.provider;
  if (!provider) return;
  manifest.timings.generationLatencyMs = provider.reused ? null : provider.latencyMs;
  manifest.cost.credits = provider.reused ? 0 : provider.credits;
  manifest.cost.unit = `${provider.name} credits`;
  if (acquired.kind === "existing" && provider.reused) {
    warn("acquire-raw", `Reused ${provider.name} attempt ${manifest.attempt}: no new provider request was made`);
  }
}

export const describeAcquiredRaw = (acquired: AcquiredRaw) =>
  acquired.kind === "generated"
    ? `generated attempt ${acquired.attempt}`
    : `using existing ${displayPath(acquired.file)} (no provider request)`;
