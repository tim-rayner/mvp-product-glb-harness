import { chmod, rename } from "node:fs/promises";
import path from "node:path";
import type { DimensionalValidation } from "../schemas";
import { displayPath, READ_ONLY_MODE, sha256 } from "../../../shared/utils/files";
import { CORRECTED_FILENAME, REJECTED_FILENAME } from "../storage/constants";
import { StageFailure } from "../errors";
import { writeLatestPointer } from "../storage/store";
import type { StageContext } from "../types";

/** Keeps a failed export as evidence, under a name that can't be mistaken for a usable asset. */
export async function rejectExport(
  { runDir }: StageContext,
  unvalidatedPath: string,
  decision: DimensionalValidation,
): Promise<StageFailure> {
  const rejectedPath = path.join(runDir, REJECTED_FILENAME);
  await rename(unvalidatedPath, rejectedPath);
  return new StageFailure(
    "DIMENSIONAL_VALIDATION_FAILED",
    `Dimensional validation ${decision.status}: ${decision.reasons.join("; ")}`,
    { reasonCodes: decision.reasonCodes, rejectedAsset: displayPath(rejectedPath) },
  );
}

/** Moves the validated export to its final, read-only name and records it in the manifest. */
export async function publishCorrected({ manifest, runDir }: StageContext, unvalidatedPath: string, bytes: Uint8Array) {
  const correctedPath = path.join(runDir, CORRECTED_FILENAME);
  await rename(unvalidatedPath, correctedPath);
  await chmod(correctedPath, READ_ONLY_MODE);
  manifest.correctedAsset = {
    path: displayPath(correctedPath),
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
  };
}

/** Points the viewer's `latest` at this run. */
export const exposeToViewer = ({ outputRoot, profile, manifest, now }: StageContext) =>
  writeLatestPointer(outputRoot, profile.slug, manifest.runId, now());
