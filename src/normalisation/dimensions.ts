import type { DimensionsMm } from "../schemas/product";
import {
  SEMANTIC_DIMENSIONS,
  type AxisMapping,
  type GltfAxis,
  type NormalisationConfig,
  type SemanticDimension,
} from "../schemas/normalisation";

// Pure dimensional maths: no file IO, no glTF types. Everything here is unit-tested directly.

export type Vec3 = [number, number, number];

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** glTF 2.0 mandates metres for linear units, so a normalised asset is written in metres. */
export const MM_PER_GLTF_UNIT = 1000;

export const AXIS_INDEX: Record<GltfAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

export function boundsSize({ min, max }: Bounds): Vec3 {
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]] as Vec3;
  if (!size.every((s) => Number.isFinite(s) && s > 0)) {
    throw new RangeError(`Degenerate bounds (size ${size.join(", ")}): nothing to normalise`);
  }
  return size;
}

/** Reads a per-axis size as semantic dimensions via the axis mapping. */
export function toSemantic(size: Vec3, mapping: AxisMapping): Record<SemanticDimension, number> {
  return {
    width: size[AXIS_INDEX[mapping.width]],
    depth: size[AXIS_INDEX[mapping.depth]],
    height: size[AXIS_INDEX[mapping.height]],
  };
}

export interface DimensionCorrection {
  axis: GltfAxis;
  rawSize: number;
  targetMm: number;
  /** Multiplier applied on this axis: raw units → glTF metres at the target size. */
  scale: number;
  /** Size this dimension would have if the model were scaled uniformly from the reference. */
  uniformFromReferenceMm: number;
  /** How far that uniform-only result misses the target: +9.98 means 9.98% too large. */
  deviationAfterUniformPct: number;
  /** Extra non-uniform correction applied on top of the reference scale: scale/refScale − 1. */
  correctionPct: number;
  requiresReview: boolean;
}

export interface CorrectionPlan {
  referenceDimension: SemanticDimension;
  /** Scale per glTF axis, in [x, y, z] order. */
  scaleByAxis: Vec3;
  dimensions: Record<SemanticDimension, DimensionCorrection>;
  uniform: boolean;
  /** max(scale) / min(scale) − 1, as a percentage. */
  anisotropyPct: number;
  flaggedDimensions: SemanticDimension[];
}

const pct = (ratio: number) => (ratio - 1) * 100;

export function largestDimension(target: DimensionsMm): SemanticDimension {
  return SEMANTIC_DIMENSIONS.reduce((a, b) => (target[b] > target[a] ? b : a));
}

export function planCorrection(
  rawSize: Vec3,
  target: DimensionsMm,
  mapping: AxisMapping,
  config: NormalisationConfig,
): CorrectionPlan {
  const raw = toSemantic(rawSize, mapping);
  const scaleOf = (d: SemanticDimension) => target[d] / MM_PER_GLTF_UNIT / raw[d];

  const referenceDimension = config.referenceDimension ?? largestDimension(target);
  const referenceScale = scaleOf(referenceDimension);

  const scaleByAxis = [1, 1, 1] as Vec3;
  const dimensions = {} as Record<SemanticDimension, DimensionCorrection>;

  for (const d of SEMANTIC_DIMENSIONS) {
    const scale = scaleOf(d);
    const uniformFromReferenceMm = raw[d] * referenceScale * MM_PER_GLTF_UNIT;
    const correctionPct = pct(scale / referenceScale);
    scaleByAxis[AXIS_INDEX[mapping[d]]] = scale;
    dimensions[d] = {
      axis: mapping[d],
      rawSize: raw[d],
      targetMm: target[d],
      scale,
      uniformFromReferenceMm,
      deviationAfterUniformPct: pct(uniformFromReferenceMm / target[d]),
      correctionPct,
      requiresReview: Math.abs(correctionPct) > config.reviewThresholdPct,
    };
  }

  const anisotropyPct = pct(Math.max(...scaleByAxis) / Math.min(...scaleByAxis));

  return {
    referenceDimension,
    scaleByAxis,
    dimensions,
    uniform: anisotropyPct <= config.uniformityTolerancePct,
    anisotropyPct,
    flaggedDimensions: SEMANTIC_DIMENSIONS.filter((d) => dimensions[d].requiresReview),
  };
}

export interface DimensionResidual {
  measuredMm: number;
  targetMm: number;
  residualMm: number;
  residualPct: number;
  pass: boolean;
}

/** Compares a re-measured size (glTF metres) to the target dimensions. */
export function computeResiduals(
  measuredSize: Vec3,
  target: DimensionsMm,
  mapping: AxisMapping,
  toleranceMm: number,
): { dimensions: Record<SemanticDimension, DimensionResidual>; pass: boolean } {
  const measured = toSemantic(measuredSize, mapping);
  const dimensions = {} as Record<SemanticDimension, DimensionResidual>;
  for (const d of SEMANTIC_DIMENSIONS) {
    const measuredMm = measured[d] * MM_PER_GLTF_UNIT;
    const residualMm = measuredMm - target[d];
    dimensions[d] = {
      measuredMm,
      targetMm: target[d],
      residualMm,
      residualPct: (residualMm / target[d]) * 100,
      pass: Math.abs(residualMm) <= toleranceMm,
    };
  }
  return { dimensions, pass: SEMANTIC_DIMENSIONS.every((d) => dimensions[d].pass) };
}
