import type { DimensionsMm } from "../../../shared/geometry/dimensions";
import { metresToMm, mmToMetres } from "../../../shared/utils/formatToMm";

/**
 * One Three.js world unit is one metre; product metadata is millimetres. Every conversion between
 * the two goes through mmToWorld / worldToMm.
 */
export const WORLD_UNITS_PER_METRE = 1;

export const mmToWorld = (mm: number) => mmToMetres(mm) * WORLD_UNITS_PER_METRE;
export const worldToMm = (units: number) => metresToMm(units / WORLD_UNITS_PER_METRE);

/** Authoritative dimensions as world-space extents (x = width, y = height, z = depth). */
export function dimensionsToWorldSize(d: DimensionsMm): { x: number; y: number; z: number } {
  return { x: mmToWorld(d.width), y: mmToWorld(d.height), z: mmToWorld(d.depth) };
}

export interface BoundsComparisonRow {
  dimension: "width" | "depth" | "height";
  targetMm: number;
  measuredMm: number;
  deltaMm: number;
}

/** Compares a world-space bounding-box size, measured in the scene, with authoritative mm. */
export function compareSceneBounds(size: { x: number; y: number; z: number }, target: DimensionsMm): BoundsComparisonRow[] {
  const measured = { width: worldToMm(size.x), height: worldToMm(size.y), depth: worldToMm(size.z) };
  return (["width", "depth", "height"] as const).map((dimension) => ({
    dimension,
    targetMm: target[dimension],
    measuredMm: measured[dimension],
    deltaMm: measured[dimension] - target[dimension],
  }));
}
