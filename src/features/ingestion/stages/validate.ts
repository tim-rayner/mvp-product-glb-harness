import type { DimensionalValidation, PipelineConfig, RunManifest } from "../schemas";
import type { SpatialProductSource } from "../../products/product";
import type { Bounds, Vec3 } from "../../../shared/geometry/bounds";
import { contentSummary, measureBounds, readGlb } from "../../../shared/geometry/gltf";
import { measureAsset } from "../analysis/proportions";
import { CANONICAL_AXIS_MAPPING } from "../analysis/transform";
import { validateCorrectedBounds } from "../analysis/validation";
import { errorMessage } from "../../../shared/utils/errors";
import { sha256File } from "../../../shared/utils/files";
import { formatMm } from "../../../shared/utils/format";
import { metresToMm } from "../../../shared/utils/formatToMm";
import { StageFailure } from "../errors";
import type { StageContext } from "../types";
import type { CorrectedAsset } from "./correct";
import type { InspectedRaw } from "./inspect-raw";
import type { PersistedRaw } from "./persist-raw";

/** Re-measured bounds may differ from the plan by float noise only: anything above this (metres) is reported. */
const BOUNDS_DRIFT_WARNING_M = 1e-6;

export interface ValidatedExport {
  decision: DimensionalValidation;
  bytes: Uint8Array;
}

const toMmBounds = (b: Bounds): Bounds => ({ min: b.min.map(metresToMm) as Vec3, max: b.max.map(metresToMm) as Vec3 });

/** Largest per-axis difference between two bounding boxes. */
function maxBoundsDrift(a: Bounds, b: Bounds): number {
  return Math.max(
    ...[0, 1, 2].flatMap((i) => [Math.abs(a.min[i]! - b.min[i]!), Math.abs(a.max[i]! - b.max[i]!)]),
  );
}

/** Human-readable list of content counts or extensions that changed between the raw and the corrected file. */
function diffContent(
  content: NonNullable<RunManifest["content"]>,
  corrected: Record<string, number>,
  correctedExtensions: string[],
): string[] {
  const differences = Object.keys(content.raw)
    .filter((k) => content.raw[k] !== corrected[k])
    .map((k) => `${k} ${content.raw[k]} → ${corrected[k]}`);
  const lostExtensions = content.extensionsUsed.filter((e) => !correctedExtensions.includes(e));
  if (lostExtensions.length > 0) differences.push(`extensions lost: ${lostExtensions.join(", ")}`);
  return differences;
}

/**
 * Re-opens the exported GLB from disk and validates it independently of the in-memory document:
 * dimensions, grounding, pivot and preserved content. Also confirms the raw GLB was not changed
 * during the run.
 */
export async function validateExport(
  { manifest, warn }: StageContext,
  unvalidatedPath: string,
  source: SpatialProductSource,
  config: PipelineConfig,
  inspected: InspectedRaw,
  corrected: CorrectedAsset,
  raw: PersistedRaw,
): Promise<ValidatedExport> {
  const bytes = await Bun.file(unvalidatedPath).bytes();
  let reopened: Awaited<ReturnType<typeof readGlb>>;
  try {
    reopened = await readGlb(bytes);
  } catch (e) {
    throw new StageFailure("CORRECTED_PARSE_FAILED", `Exported GLB could not be re-opened: ${errorMessage(e)}`);
  }

  const boundsM = measureBounds(reopened.document);
  const correctedContent = contentSummary(reopened.document);
  const differences = diffContent(manifest.content!, correctedContent, reopened.extensions.extensionsUsed);
  manifest.content!.corrected = correctedContent;

  const decision = validateCorrectedBounds(boundsM, source.dimensions, config.dimensionalValidation, {
    preserved: differences.length === 0,
    differences,
  });
  manifest.dimensionalValidation = decision;
  try {
    manifest.correctedMeasurements = measureAsset(
      toMmBounds(boundsM),
      CANONICAL_AXIS_MAPPING,
      "mm",
      inspected.analysis.referenceDimension,
    );
  } catch {
    manifest.correctedMeasurements = null;
  }

  const drift = maxBoundsDrift(boundsM, corrected.plan.expectedBounds);
  if (drift > BOUNDS_DRIFT_WARNING_M) {
    warn("validate", `Re-measured bounds differ from the planned bounds by ${metresToMm(drift).toFixed(4)} mm`);
  }

  if ((await sha256File(raw.absolutePath)) !== raw.ref.sha256) {
    throw new StageFailure("RAW_ASSET_MUTATED", `Raw GLB ${raw.ref.path} changed during the run`);
  }
  return { decision, bytes };
}

export const describeValidation = ({ decision: d }: ValidatedExport) =>
  `${d.status} (W ${formatMm(d.dimensions.width.measuredMm)}, D ${formatMm(d.dimensions.depth.measuredMm)}, ` +
  `H ${formatMm(d.dimensions.height.measuredMm)}, ground ${formatMm(d.groundOffsetMm)})`;
