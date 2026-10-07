import type { AxisMapping } from "../../../shared/geometry/dimensions";
import type { Correction, PipelineConfig } from "../schemas";
import type { SpatialProductSource } from "../../products/product";
import { applyRootTransform, createGltfIO } from "../../../shared/geometry/gltf";
import { planCanonicalTransform, type CanonicalTransform } from "../analysis/transform";
import { errorMessage } from "../../../shared/utils/errors";
import { displayPath, writeFileAtomic } from "../../../shared/utils/files";
import { xyz } from "../../../shared/utils/maths";
import { StageFailure } from "../errors";
import type { StageContext } from "../types";
import type { InspectedRaw } from "./inspect-raw";

const CORRECTION_METHOD = "root wrapper node (T·R·S); vertex, material and texture data unchanged";

export interface CorrectedAsset {
  plan: CanonicalTransform;
  correction: Correction;
}

/**
 * Corrects orientation, dimensions, pivot and grounding by wrapping the scene in one root node.
 * The extras written onto that node are deterministic (no run id or timestamp), so the same raw
 * input always gives the same bytes.
 */
export function correctAsset(
  { manifest, warn }: StageContext,
  inspected: InspectedRaw,
  source: SpatialProductSource,
  axisMapping: AxisMapping,
  config: PipelineConfig,
  rawSha256: string,
): CorrectedAsset {
  if (inspected.blockers.length > 0) {
    throw new StageFailure("CORRECTION_FAILED", `Asset structure can't be corrected safely: ${inspected.blockers.join("; ")}`, {
      blockers: inspected.blockers,
    });
  }
  const plan = planCanonicalTransform(inspected.bounds, axisMapping, source.dimensions);
  if (![...plan.scale, ...plan.rotation, ...plan.translation].every(Number.isFinite)) {
    throw new StageFailure("CORRECTION_FAILED", "Correction transform is not finite");
  }
  if (plan.depthAxisFlipped) warn("correct", "Axis mapping is an odd permutation: depth axis reversed to avoid mirroring");

  applyRootTransform(inspected.document, plan, {
    dimensionalNormalisation: {
      sourceSha256: rawSha256,
      productId: source.productId,
      targetMm: source.dimensions,
      axisMapping,
      outputUnits: "m",
      scale: plan.scale,
      rotation: plan.rotation,
      translation: plan.translation,
    },
  });

  const isUniform = inspected.analysis.maxAbsProportionalErrorPct <= config.proportionalCheck.uniformTolerancePct;
  const correction: Correction = {
    method: CORRECTION_METHOD,
    type: isUniform ? "uniform" : "non-uniform",
    scaleFactors: xyz(plan.scale),
    rotation: plan.rotation,
    translationM: xyz(plan.translation),
    depthAxisFlipped: plan.depthAxisFlipped,
  };
  manifest.correction = correction;
  return { plan, correction };
}

export const describeCorrection = ({ correction: { type, scaleFactors: s } }: CorrectedAsset) =>
  `${type} scale x=${s.x.toFixed(5)} y=${s.y.toFixed(5)} z=${s.z.toFixed(5)}, grounded and centred`;

/** Serialises the corrected document to a path that is never the final name until validation passes. */
export async function exportCorrected(inspected: InspectedRaw, unvalidatedPath: string): Promise<number> {
  let bytes: Uint8Array;
  try {
    bytes = await createGltfIO().writeBinary(inspected.document);
  } catch (e) {
    throw new StageFailure("EXPORT_FAILED", `Could not serialise corrected GLB: ${errorMessage(e)}`);
  }
  await writeFileAtomic(unvalidatedPath, bytes, { exclusive: true });
  return bytes.byteLength;
}

export const describeExport = (byteLength: number, unvalidatedPath: string) =>
  `${(byteLength / 1e6).toFixed(2)} MB → ${displayPath(unvalidatedPath)}`;
