import type { Vec3 } from "../utils/maths";
import { SEMANTIC_DIMENSIONS, type AxisMapping, type DimensionsMm, type GltfAxis, type SemanticDimension } from "./dimensions";

export type { Vec3 };

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export const AXIS_INDEX: Record<GltfAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/** Reads a per-axis size as semantic dimensions via the axis mapping. */
export function toSemantic(size: Vec3, mapping: AxisMapping): Record<SemanticDimension, number> {
  return {
    width: size[AXIS_INDEX[mapping.width]],
    depth: size[AXIS_INDEX[mapping.depth]],
    height: size[AXIS_INDEX[mapping.height]],
  };
}

/** The semantic dimension with the largest target size. */
export function largestDimension(target: DimensionsMm): SemanticDimension {
  return SEMANTIC_DIMENSIONS.reduce((a, b) => (target[b] > target[a] ? b : a));
}
