import {
  GltfAxisSchema,
  SEMANTIC_DIMENSIONS,
  type AxisMapping,
  type DimensionsMm,
  type GltfAxis,
  type SemanticDimension,
} from "../../../shared/geometry/dimensions";
import type { AssetMeasurements, ProportionAnalysis } from "../schemas";
import { mmToMetres } from "../../../shared/utils/formatToMm";
import { ratioToPct, xyz, type Vec3 } from "../../../shared/utils/maths";
import { AXIS_INDEX, largestDimension, toSemantic, type Bounds } from "../../../shared/geometry/bounds";

export type InvalidGeometryKind = "EMPTY_GEOMETRY" | "NON_FINITE_BOUNDS" | "DEGENERATE_BOUNDS";

/** Bounds that can't be measured meaningfully. The pipeline maps this to INVALID_GEOMETRY. */
export class InvalidGeometryError extends Error {
  constructor(
    readonly kind: InvalidGeometryKind,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Validates bounds and returns the per-axis extent, or throws InvalidGeometryError. An inverted
 * infinite box means no mesh contributed a vertex (that is what gltf-transform's getBounds returns).
 */
export function checkedExtents({ min, max }: Bounds): Vec3 {
  if (min.every((v) => v === Infinity) && max.every((v) => v === -Infinity)) {
    throw new InvalidGeometryError("EMPTY_GEOMETRY", "Scene has no measurable vertices");
  }
  if (![...min, ...max].every(Number.isFinite)) {
    throw new InvalidGeometryError("NON_FINITE_BOUNDS", `Bounds contain non-finite values (min ${min}, max ${max})`);
  }
  const extents: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const flat = (["x", "y", "z"] as const).filter((_, i) => !(extents[i] > 0));
  if (flat.length > 0) {
    throw new InvalidGeometryError("DEGENERATE_BOUNDS", `Zero-sized bounds on axis ${flat.join(", ")}`);
  }
  return extents;
}

export function ratiosOf(dims: Record<SemanticDimension, number>, reference: SemanticDimension) {
  return {
    width: dims.width / dims[reference],
    depth: dims.depth / dims[reference],
    height: dims.height / dims[reference],
  };
}

/**
 * Structured measurements of an asset's world-space bounds under an axis mapping.
 * `units` describes the bounds' unit: raw generator units, or mm (bounds already converted).
 */
export function measureAsset(
  bounds: Bounds,
  mapping: AxisMapping,
  units: AssetMeasurements["units"],
  reference: SemanticDimension,
): AssetMeasurements {
  const extents = checkedExtents(bounds);
  const canonicalDimensions = toSemantic(extents, mapping);
  return {
    units,
    min: xyz(bounds.min),
    max: xyz(bounds.max),
    axisExtents: xyz(extents),
    axisMapping: mapping,
    canonicalDimensions,
    ratios: ratiosOf(canonicalDimensions, reference),
    groundOffset: bounds.min[AXIS_INDEX[mapping.height]],
  };
}

/** Per raw axis multiplier taking raw units to metres at the authoritative size. */
export function scaleFactorsFor(extents: Vec3, target: DimensionsMm, mapping: AxisMapping): Vec3 {
  const factors: Vec3 = [Number.NaN, Number.NaN, Number.NaN];
  for (const d of SEMANTIC_DIMENSIONS) {
    const i = AXIS_INDEX[mapping[d]];
    factors[i] = mmToMetres(target[d]) / extents[i];
  }
  return factors;
}

/** max/min − 1 of the scale factors, in percent. 0 means the shape only needs a uniform rescale. */
export function scaleSpreadPct(factors: Vec3): number {
  return ratioToPct(Math.max(...factors) / Math.min(...factors));
}

const AXES: readonly GltfAxis[] = GltfAxisSchema.options;

/** All six assignments of width/depth/height to distinct axes. */
export function allAxisMappings(): AxisMapping[] {
  const mappings: AxisMapping[] = [];
  for (const width of AXES) {
    for (const depth of AXES) {
      for (const height of AXES) {
        if (new Set([width, depth, height]).size === 3) mappings.push({ width, depth, height });
      }
    }
  }
  return mappings;
}

export const sameMapping = (a: AxisMapping, b: AxisMapping) =>
  a.width === b.width && a.depth === b.depth && a.height === b.height;

/**
 * Compares the raw asset's shape with the authoritative dimensions. Says how far the generated
 * proportions are from the real product, which the final bounds alone can never show (any shape
 * can be stretched to fit a box).
 */
export function analyseProportions(
  extents: Vec3,
  target: DimensionsMm,
  mapping: AxisMapping,
  referenceDimension: SemanticDimension = largestDimension(target),
): ProportionAnalysis {
  const raw = toSemantic(extents, mapping);
  const rawRatios = ratiosOf(raw, referenceDimension);
  const authoritativeRatios = ratiosOf(target, referenceDimension);
  const proportionalErrorPct = {
    width: ratioToPct(rawRatios.width / authoritativeRatios.width),
    depth: ratioToPct(rawRatios.depth / authoritativeRatios.depth),
    height: ratioToPct(rawRatios.height / authoritativeRatios.height),
  };
  const factors = scaleFactorsFor(extents, target, mapping);

  let bestAxisMapping = mapping;
  let bestSpread = scaleSpreadPct(factors);
  for (const candidate of allAxisMappings()) {
    const spread = scaleSpreadPct(scaleFactorsFor(extents, target, candidate));
    if (spread < bestSpread) {
      bestAxisMapping = candidate;
      bestSpread = spread;
    }
  }

  return {
    referenceDimension,
    rawRatios,
    authoritativeRatios,
    proportionalErrorPct,
    maxAbsProportionalErrorPct: Math.max(...SEMANTIC_DIMENSIONS.map((d) => Math.abs(proportionalErrorPct[d]))),
    scaleFactors: xyz(factors),
    scaleSpreadPct: scaleSpreadPct(factors),
    rawAspectRatio: Math.max(...extents) / Math.min(...extents),
    bestAxisMapping,
    bestAxisMappingScaleSpreadPct: bestSpread,
  };
}
