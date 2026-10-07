import { chmod } from "node:fs/promises";
import path from "node:path";
import type { RawAssetRef } from "../schemas";
import { displayPath, isInside, READ_ONLY_MODE, sha256, sha256File, writeFileAtomic, writeJsonAtomic } from "../../../shared/utils/files";
import { GENERATION_RECORD_FILENAME, RAW_FILENAME } from "../storage/constants";
import { StageFailure } from "../errors";
import { buildGenerationRecord } from "../provenance";
import type { StageContext } from "../types";
import type { AcquiredRaw } from "./acquire-raw";

export interface PersistedRaw {
  ref: RawAssetRef;
  bytes: Uint8Array;
  absolutePath: string;
}

/** Writes a generated GLB byte-for-byte as downloaded, read-only and never replaced, beside its generation record. */
async function persistGenerated(ctx: StageContext, acquired: Extract<AcquiredRaw, { kind: "generated" }>, digest: string) {
  const absolutePath = path.resolve(acquired.dir, RAW_FILENAME);
  await writeFileAtomic(absolutePath, acquired.bytes, { exclusive: true, mode: READ_ONLY_MODE });
  const record = buildGenerationRecord(ctx.profile, acquired.provider, acquired.attempt, acquired.job, {
    status: "succeeded",
    rawSha256: digest,
  });
  await writeJsonAtomic(path.join(acquired.dir, GENERATION_RECORD_FILENAME), record);
  return absolutePath;
}

/** Protects existing provider attempts we own; never touches files outside the output tree. */
async function protectExisting(ctx: StageContext, acquired: Extract<AcquiredRaw, { kind: "existing" }>) {
  const absolutePath = path.resolve(acquired.file);
  if (isInside(absolutePath, ctx.outputRoot)) await chmod(absolutePath, READ_ONLY_MODE);
  return absolutePath;
}

/** Persists the immutable raw asset and confirms what is on disk matches the acquired bytes. */
export async function persistRaw(ctx: StageContext, acquired: AcquiredRaw): Promise<PersistedRaw> {
  const digest = sha256(acquired.bytes);
  const absolutePath =
    acquired.kind === "generated" ? await persistGenerated(ctx, acquired, digest) : await protectExisting(ctx, acquired);
  if ((await sha256File(absolutePath)) !== digest) {
    throw new StageFailure("RAW_ASSET_MUTATED", "Persisted raw GLB does not match the acquired bytes");
  }
  const ref: RawAssetRef = {
    path: displayPath(absolutePath),
    sha256: digest,
    bytes: acquired.bytes.byteLength,
    origin: acquired.kind === "generated" ? "provider-generated" : acquired.origin,
    attempt: ctx.manifest.attempt,
  };
  ctx.manifest.rawAsset = ref;
  return { ref, bytes: acquired.bytes, absolutePath };
}

export const describePersistedRaw = ({ ref }: PersistedRaw) => `${ref.path} sha256 ${ref.sha256.slice(0, 12)}…`;
