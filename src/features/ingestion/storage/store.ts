import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { GenerationRecordSchema, RunManifestSchema, type GenerationRecord, type RunManifest } from "../schemas";
import { isAlreadyExistsError } from "../../../shared/utils/errors";
import { exists, writeJsonAtomic } from "../../../shared/utils/files";
import {
  ATTEMPT_DIR_PATTERN,
  GENERATION_RECORD_FILENAME,
  LATEST_POINTER_FILENAME,
  MANIFEST_FILENAME,
  RUN_ID_PATTERN,
  RUNS_DIRNAME,
} from "./constants";

export const productDir = (outputRoot: string, slug: string) => path.join(outputRoot, slug);
export const runsDir = (outputRoot: string, slug: string) => path.join(productDir(outputRoot, slug), RUNS_DIRNAME);
export const runDir = (outputRoot: string, slug: string, runId: string) => path.join(runsDir(outputRoot, slug), runId);
export const manifestPath = (outputRoot: string, slug: string, runId: string) =>
  path.join(runDir(outputRoot, slug, runId), MANIFEST_FILENAME);
export const latestPointerPath = (outputRoot: string, slug: string) =>
  path.join(runsDir(outputRoot, slug), LATEST_POINTER_FILENAME);

export const isValidRunId = (runId: string) => RUN_ID_PATTERN.test(runId) && !runId.includes("..");

/** Run identifier from the clock: sortable, filesystem-safe, millisecond resolution. */
export const timestampRunId = (now: Date) => now.toISOString().replace(/[:.]/g, "-");

export class RunIdCollisionError extends Error {}

/** Creates the run directory, failing loudly if that run already exists (no silent collisions). */
export async function createRunDir(outputRoot: string, slug: string, runId: string): Promise<string> {
  if (!isValidRunId(runId)) throw new Error(`Invalid run id "${runId}": use letters, digits, ".", "_" or "-"`);
  await mkdir(runsDir(outputRoot, slug), { recursive: true });
  const dir = runDir(outputRoot, slug, runId);
  try {
    await mkdir(dir);
  } catch (e) {
    if (isAlreadyExistsError(e)) {
      throw new RunIdCollisionError(`Run ${runId} already exists at ${dir}: pick another --run-id`);
    }
    throw e;
  }
  return dir;
}

export async function readManifest(outputRoot: string, slug: string, runId: string): Promise<RunManifest> {
  if (!isValidRunId(runId)) throw new Error(`Invalid run id "${runId}"`);
  const file = manifestPath(outputRoot, slug, runId);
  if (!(await exists(file))) throw new Error(`No manifest for run ${runId} (${file})`);
  return RunManifestSchema.parse(await Bun.file(file).json());
}

export const writeManifest = (outputRoot: string, manifest: RunManifest, slug: string) =>
  writeJsonAtomic(manifestPath(outputRoot, slug, manifest.runId), manifest);

const LatestPointerSchema = z.object({ runId: z.string(), updatedAt: z.string() });

export async function readLatestRunId(outputRoot: string, slug: string): Promise<string | null> {
  const file = latestPointerPath(outputRoot, slug);
  if (!(await exists(file))) return null;
  return LatestPointerSchema.parse(await Bun.file(file).json()).runId;
}

export const writeLatestPointer = (outputRoot: string, slug: string, runId: string, now: Date) =>
  writeJsonAtomic(latestPointerPath(outputRoot, slug), { runId, updatedAt: now.toISOString() });

/** Run ids for a product, newest first (timestamp ids sort chronologically). */
export async function listRunIds(outputRoot: string, slug: string): Promise<string[]> {
  const entries = await readdir(runsDir(outputRoot, slug), { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isDirectory() && isValidRunId(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
}

/** The attempt number in an `attempt-<n>` directory name, or null for any other name. */
export function parseAttemptNumber(dirname: string): number | null {
  const attempt = Number(ATTEMPT_DIR_PATTERN.exec(dirname)?.[1]);
  return Number.isInteger(attempt) && attempt >= 1 ? attempt : null;
}

export const attemptDir = (outputRoot: string, slug: string, provider: string, attempt: number) =>
  path.join(productDir(outputRoot, slug), provider, `attempt-${attempt}`);

/** Reserves the next attempt directory atomically, so concurrent generations never share one. */
export async function reserveAttemptDir(
  outputRoot: string,
  slug: string,
  provider: string,
): Promise<{ attempt: number; dir: string }> {
  const providerDir = path.join(productDir(outputRoot, slug), provider);
  await mkdir(providerDir, { recursive: true });
  const entries = await readdir(providerDir).catch(() => []);
  let attempt = Math.max(0, ...entries.map((name) => parseAttemptNumber(name) ?? 0)) + 1;
  while (true) {
    const dir = attemptDir(outputRoot, slug, provider, attempt);
    try {
      await mkdir(dir);
      return { attempt, dir };
    } catch (e) {
      if (!isAlreadyExistsError(e)) throw e;
      attempt++;
    }
  }
}

export interface ProviderAttempt {
  provider: string;
  attempt: number;
  dir: string;
  rawPath: string;
  record: GenerationRecord;
}

export async function readGenerationRecord(dir: string): Promise<GenerationRecord | null> {
  const file = path.join(dir, GENERATION_RECORD_FILENAME);
  if (!(await exists(file))) return null;
  const parsed = GenerationRecordSchema.safeParse(await Bun.file(file).json());
  return parsed.success ? parsed.data : null;
}

/** The highest-numbered succeeded provider attempt whose raw GLB is still present. */
export async function findLatestSucceededAttempt(outputRoot: string, slug: string): Promise<ProviderAttempt | null> {
  const root = productDir(outputRoot, slug);
  const providers = (await readdir(root, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory() && e.name !== RUNS_DIRNAME)
    .map((e) => e.name);

  const candidates: ProviderAttempt[] = [];
  for (const provider of providers) {
    for (const name of await readdir(path.join(root, provider)).catch(() => [])) {
      const attempt = parseAttemptNumber(name);
      if (attempt === null) continue;
      const dir = path.join(root, provider, name);
      const record = await readGenerationRecord(dir);
      if (!record || record.status !== "succeeded" || !record.outputFile) continue;
      const rawPath = path.join(dir, record.outputFile);
      if (await exists(rawPath)) candidates.push({ provider, attempt, dir, rawPath, record });
    }
  }
  candidates.sort((a, b) => b.record.submittedAt.localeCompare(a.record.submittedAt) || b.attempt - a.attempt);
  return candidates[0] ?? null;
}
