import { describe, expect, test } from "bun:test";
import { flynCotbed } from "../../products/mocks/flyn-cotbed";
import { compareSceneBounds, dimensionsToWorldSize, mmToWorld, worldToMm } from "./scale";

const flyn = flynCotbed.dimensions;

describe("scene unit boundary", () => {
  test("1,000 mm of product metadata is exactly one Three.js world unit (one metre)", () => {
    expect(mmToWorld(1000)).toBe(1);
    expect(worldToMm(1)).toBe(1000);
    expect(dimensionsToWorldSize({ width: 1000, depth: 1000, height: 1000 })).toEqual({ x: 1, y: 1, z: 1 });
    // x = width, y = height, z = depth in the scene.
    expect(dimensionsToWorldSize(flyn)).toEqual({ x: 1.463, y: 0.953, z: 0.795 });
  });

  test("scene bounds comparison reports mm deltas", () => {
    const rows = compareSceneBounds({ x: 1.4635, y: 0.953, z: 0.795 }, flyn);
    expect(rows.map((r) => r.dimension)).toEqual(["width", "depth", "height"]);
    expect(rows[0]!.deltaMm).toBeCloseTo(0.5, 9);
    expect(rows[1]!.deltaMm).toBeCloseTo(0, 9);
  });
});
