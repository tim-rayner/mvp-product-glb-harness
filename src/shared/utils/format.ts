/** Fixed-point number, or `fallback` when there is no value. */
export const formatNumber = (v: number | null | undefined, digits: number, fallback = "n/a") =>
  v === null || v === undefined ? fallback : v.toFixed(digits);

export const formatMm = (v: number | null) => (v === null ? "n/a" : `${v.toFixed(2)} mm`);

export const formatRatios = (r: { width: number; depth: number; height: number }) =>
  `${r.width.toFixed(3)}:${r.depth.toFixed(3)}:${r.height.toFixed(3)}`;

export const formatScale = (s: { x: number; y: number; z: number }) =>
  `x ${s.x.toFixed(5)} · y ${s.y.toFixed(5)} · z ${s.z.toFixed(5)}`;
