/** Gap between neighbouring bounding boxes, in world units (metres). */
export const LINEUP_GAP = 0.3;

/** World-space min/max X of a bounding box once placed in the row. */
export interface RowSlot {
  minX: number;
  maxX: number;
}

/**
 * Places boxes of the given widths left to right with an equal gap between neighbours, the whole
 * row centred on x = 0. Returns where each box's extent lands; the caller translates its model so
 * the box's own min X sits at `minX`.
 */
export function layoutRow(widths: readonly number[], gap = LINEUP_GAP): RowSlot[] {
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1);
  let cursor = -total / 2;
  return widths.map((w) => {
    const slot = { minX: cursor, maxX: cursor + w };
    cursor += w + gap;
    return slot;
  });
}
