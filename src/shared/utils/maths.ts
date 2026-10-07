export type Vec3 = [number, number, number];

/** Tuple → `{ x, y, z }`, the shape persisted in manifests. */
export const xyz = (v: Vec3) => ({ x: v[0], y: v[1], z: v[2] });

/** A ratio as a percentage difference from 1: 1.05 → 5. */
export const ratioToPct = (ratio: number) => (ratio - 1) * 100;
