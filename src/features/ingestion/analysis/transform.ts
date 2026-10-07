import {
  SEMANTIC_DIMENSIONS,
  type AxisMapping,
  type DimensionsMm,
  type SemanticDimension,
} from "../../../shared/geometry/dimensions";
import { AXIS_INDEX, type Bounds, type Vec3 } from "../../../shared/geometry/bounds";
import { checkedExtents, scaleFactorsFor } from "./proportions";

/** Canonical glTF orientation for a corrected product: +Y up, width along X, depth along Z. */
export const CANONICAL_AXIS_MAPPING: AxisMapping = { width: "x", height: "y", depth: "z" };

const CANONICAL_INDEX: Record<SemanticDimension, 0 | 1 | 2> = { width: 0, height: 1, depth: 2 };

export type Matrix3 = [Vec3, Vec3, Vec3];
export type Quaternion = [number, number, number, number];

const det3 = (m: Matrix3) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

/**
 * Signed permutation taking each mapped raw axis onto its canonical axis (row = canonical axis,
 * column = raw axis). When the mapping is an odd permutation the matrix would mirror the model,
 * so the depth axis is reversed to keep it a proper rotation: front and back swap, nothing mirrors.
 */
export function rotationForMapping(mapping: AxisMapping): { matrix: Matrix3; depthAxisFlipped: boolean } {
  const matrix: Matrix3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const d of SEMANTIC_DIMENSIONS) matrix[CANONICAL_INDEX[d]][AXIS_INDEX[mapping[d]]] = 1;
  const depthAxisFlipped = det3(matrix) < 0;
  if (depthAxisFlipped) matrix[2] = matrix[2].map((v) => -v) as Vec3;
  return { matrix, depthAxisFlipped };
}

/**
 * Unit quaternion [x, y, z, w] for a proper rotation matrix (row-major, m[row][col]). The sign is
 * canonicalised (w ≥ 0) so identical inputs always produce byte-identical output.
 */
export function quaternionFromMatrix(m: Matrix3): Quaternion {
  const trace = m[0][0] + m[1][1] + m[2][2];
  let q: Quaternion;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = [(m[2][1] - m[1][2]) * s, (m[0][2] - m[2][0]) * s, (m[1][0] - m[0][1]) * s, 0.25 / s];
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]);
    q = [0.25 * s, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s];
  } else if (m[1][1] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]);
    q = [(m[0][1] + m[1][0]) / s, 0.25 * s, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]);
    q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, 0.25 * s, (m[1][0] - m[0][1]) / s];
  }
  return (q[3] < 0 ? q.map((v) => -v) : q) as Quaternion;
}

/**
 * The correction as glTF node TRS (applied T · R · S). `scale` is per raw axis (raw units → metres);
 * `translation` and `expectedBounds` are in metres on canonical axes. Validation re-measures the
 * exported file independently of `expectedBounds`.
 */
export interface CanonicalTransform {
  scale: Vec3;
  rotation: Quaternion;
  translation: Vec3;
  depthAxisFlipped: boolean;
  expectedBounds: Bounds;
}

/** World-space bounds after applying `matrix · diag(scale)` to `bounds`. Exact for a signed permutation. */
function transformBounds(bounds: Bounds, matrix: Matrix3, scale: Vec3): Bounds {
  const min: Vec3 = [0, 0, 0];
  const max: Vec3 = [0, 0, 0];
  for (let row = 0; row < 3; row++) {
    const col = matrix[row].findIndex((v) => v !== 0);
    const k = matrix[row][col]! * scale[col]!;
    const a = bounds.min[col]! * k;
    const b = bounds.max[col]! * k;
    min[row] = Math.min(a, b);
    max[row] = Math.max(a, b);
  }
  return { min, max };
}

/**
 * Plans the deterministic correction: raw axes → canonical orientation, per-axis scale to the
 * authoritative size (metres), footprint centred on the origin, lowest point on y = 0. Translations
 * of -0 are written as 0 so output files are byte-stable.
 */
export function planCanonicalTransform(rawBounds: Bounds, mapping: AxisMapping, target: DimensionsMm): CanonicalTransform {
  const extents = checkedExtents(rawBounds);
  const scale = scaleFactorsFor(extents, target, mapping);
  const { matrix, depthAxisFlipped } = rotationForMapping(mapping);
  const rotated = transformBounds(rawBounds, matrix, scale);

  const translation: Vec3 = [
    -(rotated.min[0] + rotated.max[0]) / 2,
    -rotated.min[1],
    -(rotated.min[2] + rotated.max[2]) / 2,
  ];
  for (let i = 0; i < 3; i++) if (Object.is(translation[i], -0)) translation[i] = 0;

  return {
    scale,
    rotation: quaternionFromMatrix(matrix),
    translation,
    depthAxisFlipped,
    expectedBounds: {
      min: rotated.min.map((v, i) => v + translation[i]!) as Vec3,
      max: rotated.max.map((v, i) => v + translation[i]!) as Vec3,
    },
  };
}
