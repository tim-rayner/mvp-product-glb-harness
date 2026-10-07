import { describe, expect, test } from "bun:test";
import { DimensionalValidationConfigSchema, ProportionalCheckConfigSchema } from "../schemas";
import type { AxisMapping } from "../../../shared/geometry/dimensions";
import { flynCotbed } from "../../products/mocks/flyn-cotbed";
import type { Bounds, Vec3 } from "../../../shared/geometry/bounds";
import { proportionalCheck, withinLimit, worstStatus } from "./gate";
import { allAxisMappings, analyseProportions, checkedExtents, InvalidGeometryError, measureAsset, ratiosOf, scaleFactorsFor, scaleSpreadPct } from "./proportions";
import { planCanonicalTransform, quaternionFromMatrix, rotationForMapping, type Quaternion } from "./transform";
import { validateCorrectedBounds, withinTolerance } from "./validation";

const yUp: AxisMapping = { width: "x", height: "y", depth: "z" };
const checkConfig = ProportionalCheckConfigSchema.parse({});
const validationConfig = DimensionalValidationConfigSchema.parse({});
const flyn = flynCotbed.dimensions; // 1463 × 795 × 953 mm (W × D × H)

describe("raw measurement", () => {
  test("rejects empty, non-finite and zero-sized bounds explicitly", () => {
    const kind = (b: Bounds) => {
      try {
        checkedExtents(b);
      } catch (e) {
        return e instanceof InvalidGeometryError ? e.kind : "other";
      }
      return "ok";
    };
    expect(kind({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] })).toBe("EMPTY_GEOMETRY");
    expect(kind({ min: [0, Number.NaN, 0], max: [1, 1, 1] })).toBe("NON_FINITE_BOUNDS");
    expect(kind({ min: [0, 0, 0], max: [1, 0, 1] })).toBe("DEGENERATE_BOUNDS");
    expect(kind({ min: [0, 0, 0], max: [1, 1, 1] })).toBe("ok");
  });

  test("measures extents, canonical dimensions, ratios and ground offset via the mapping", () => {
    const zUp: AxisMapping = { width: "x", depth: "y", height: "z" };
    const m = measureAsset({ min: [-1, -0.5, -0.2], max: [1, 0.5, 1.3] }, zUp, "raw", "width");
    expect(m.axisExtents).toEqual({ x: 2, y: 1, z: 1.5 });
    expect(m.canonicalDimensions).toEqual({ width: 2, depth: 1, height: 1.5 });
    expect(m.ratios).toEqual({ width: 1, depth: 0.5, height: 0.75 });
    expect(m.groundOffset).toBe(-0.2); // min along the height axis (z), not y
  });
});

describe("proportions", () => {
  test("ratios are relative to the reference dimension", () => {
    expect(ratiosOf(flyn, "width")).toEqual({ width: 1, depth: 795 / 1463, height: 953 / 1463 });
  });

  test("scale factors take raw units to metres per mapped axis, and spread is max/min − 1", () => {
    const factors = scaleFactorsFor([2, 1, 0.5], { width: 1000, height: 500, depth: 250 }, yUp);
    expect(factors).toEqual([0.5, 0.5, 0.5]);
    expect(scaleSpreadPct(factors)).toBe(0);
    expect(scaleSpreadPct([1, 1.1, 1.05])).toBeCloseTo(10, 9);
  });

  test("a proportionally faithful model has zero error at any raw scale", () => {
    const a = analyseProportions([1.463 * 7, 0.953 * 7, 0.795 * 7], flyn, yUp);
    expect(a.referenceDimension).toBe("width");
    expect(a.maxAbsProportionalErrorPct).toBeCloseTo(0, 9);
    expect(a.scaleSpreadPct).toBeCloseTo(0, 9);
    expect(a.bestAxisMapping).toEqual(yUp);
  });

  test("reproduces the Flyn Meshy attempt-1 raw proportions", () => {
    const a = analyseProportions([1.899646, 1.267491, 1.135289], flyn, yUp);
    expect(a.proportionalErrorPct.width).toBe(0);
    expect(a.proportionalErrorPct.depth).toBeCloseTo(9.98, 2);
    expect(a.proportionalErrorPct.height).toBeCloseTo(2.43, 2);
    expect(a.maxAbsProportionalErrorPct).toBeCloseTo(9.98, 2);
    expect(a.scaleSpreadPct).toBeCloseTo(9.98, 2);
    expect(a.scaleFactors.x).toBeCloseTo(0.770143, 5);
  });

  test("finds the axis mapping that best explains the shape", () => {
    expect(allAxisMappings()).toHaveLength(6);
    // Z-up export of a Flyn-shaped model: height is on z, depth on y.
    const a = analyseProportions([1.463, 0.795, 0.953], flyn, yUp);
    expect(a.bestAxisMapping).toEqual({ width: "x", depth: "y", height: "z" });
    expect(a.bestAxisMappingScaleSpreadPct).toBeCloseTo(0, 9);
  });
});

describe("proportional check", () => {
  const check = (extents: Vec3, mapping: AxisMapping = yUp, config = checkConfig) =>
    proportionalCheck(analyseProportions(extents, flyn, mapping), mapping, config);

  test("limits are inclusive; non-finite values fail", () => {
    expect(withinLimit(15, 15)).toBe(true);
    expect(withinLimit(15.0001, 15)).toBe(false);
    expect(withinLimit(Number.NaN, 15)).toBe(false);
    expect(worstStatus(["PASS", "FAIL", "PASS"])).toBe("FAIL");
    expect(worstStatus([])).toBe("PASS");
  });

  test("faithful proportions PASS with nothing to report", () => {
    const { decision, warnings } = check([1.463, 0.953, 0.795]);
    expect(decision.status).toBe("PASS");
    expect(decision.reasonCodes).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test("the Flyn Meshy shape PASSes: its ~10% depth error is corrected automatically, and reported", () => {
    const { decision, warnings } = check([1.899646, 1.267491, 1.135289]);
    expect(decision.status).toBe("PASS");
    expect(decision.metrics.depthProportionalErrorPct).toBeCloseTo(9.98, 2);
    expect(decision.metrics.scaleSpreadPct).toBeCloseTo(9.98, 2);
    expect(warnings[0]).toContain("depth is +9.98% out of proportion relative to width");
    expect(warnings[0]).toContain("corrected automatically");
  });

  test("far-off proportions still PASS: corrected automatically, and reported", () => {
    const { decision, warnings } = check([1.9, 1.24, 0.45]);
    expect(decision.status).toBe("PASS");
    expect(decision.metrics.scaleSpreadPct).toBeGreaterThan(15);
    expect(warnings.some((w) => w.startsWith("depth is") && w.includes("corrected automatically"))).toBe(true);
  });

  test("FAIL for absurd geometry", () => {
    expect(check([1000, 1, 0.001]).decision.reasonCodes).toContain("ABSURD_ASPECT_RATIO");
  });

  test("warns, without failing, when the declared axis mapping is probably wrong", () => {
    const { decision, warnings } = check([1.463, 0.795, 0.953]);
    expect(warnings.some((w) => w.includes("may be oriented differently"))).toBe(true);
    expect(decision.reasonCodes).not.toContain("AXIS_MAPPING_SUSPECT");
  });

  test("the aspect-ratio limit is configurable", () => {
    const strict = ProportionalCheckConfigSchema.parse({ maxRawAspectRatio: 1.5 });
    expect(check([1.899646, 1.267491, 1.135289], yUp, strict).decision.reasonCodes).toEqual(["ABSURD_ASPECT_RATIO"]);
  });
});

/** Rotates v by unit quaternion q = [x, y, z, w]. */
function rotate([x, y, z, w]: Quaternion, v: Vec3): Vec3 {
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [
    v[0] + w * t[0]! + (y * t[2]! - z * t[1]!),
    v[1] + w * t[1]! + (z * t[0]! - x * t[2]!),
    v[2] + w * t[2]! + (x * t[1]! - y * t[0]!),
  ];
}

describe("canonical transform", () => {
  test("identity mapping needs no rotation", () => {
    const { matrix, depthAxisFlipped } = rotationForMapping(yUp);
    expect(depthAxisFlipped).toBe(false);
    expect(quaternionFromMatrix(matrix)).toEqual([0, 0, 0, 1]);
  });

  test("Z-up mapping rotates height onto +Y without mirroring", () => {
    const zUp: AxisMapping = { width: "x", depth: "y", height: "z" };
    const { matrix, depthAxisFlipped } = rotationForMapping(zUp);
    expect(depthAxisFlipped).toBe(true); // odd permutation: depth reversed instead of mirroring
    const q = quaternionFromMatrix(matrix);
    expect(Math.hypot(...q)).toBeCloseTo(1, 12);
    const up = rotate(q, [0, 0, 1]);
    expect(up[1]).toBeCloseTo(1, 12); // raw +Z (height) → canonical +Y
    const across = rotate(q, [1, 0, 0]);
    expect(across[0]).toBeCloseTo(1, 12); // width stays on X
  });

  test("every mapping yields a proper rotation taking each dimension to its canonical axis", () => {
    for (const mapping of allAxisMappings()) {
      const q = quaternionFromMatrix(rotationForMapping(mapping).matrix);
      const axis = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } as const;
      expect(Math.abs(rotate(q, [...axis[mapping.width]])[0])).toBeCloseTo(1, 12);
      expect(Math.abs(rotate(q, [...axis[mapping.height]])[1])).toBeCloseTo(1, 12);
      expect(Math.abs(rotate(q, [...axis[mapping.depth]])[2])).toBeCloseTo(1, 12);
    }
  });

  test("plans scale, centring and grounding to the authoritative size", () => {
    const plan = planCanonicalTransform({ min: [-0.95, -0.4, -0.5], max: [0.95, 0.87, 0.64] }, yUp, flyn);
    const { min, max } = plan.expectedBounds;
    expect(max[0] - min[0]).toBeCloseTo(1.463, 12);
    expect(max[1] - min[1]).toBeCloseTo(0.953, 12);
    expect(max[2] - min[2]).toBeCloseTo(0.795, 12);
    expect(min[1]).toBeCloseTo(0, 12); // grounded
    expect(min[0] + max[0]).toBeCloseTo(0, 12); // centred
    expect(min[2] + max[2]).toBeCloseTo(0, 12);
  });
});

describe("dimensional validation", () => {
  const box = (w: number, h: number, d: number, ground = 0): Bounds => ({ min: [-w / 2, ground, -d / 2], max: [w / 2, ground + h, d / 2] });
  const flynBox = (dw = 0, ground = 0) => box((1463 + dw) / 1000, 0.953, 0.795, ground);

  test("absolute and percentage tolerances must both hold, inclusive", () => {
    expect(withinTolerance(0.5, 1463, validationConfig)).toBe(true);
    expect(withinTolerance(-0.5, 1463, validationConfig)).toBe(true);
    expect(withinTolerance(0.5001, 1463, validationConfig)).toBe(false);
    // 0.4 mm on a 300 mm part is 0.133%: inside the absolute tolerance, outside the percentage one.
    expect(withinTolerance(0.4, 300, validationConfig)).toBe(false);
    expect(withinTolerance(0.3, 300, validationConfig)).toBe(true);
  });

  test("PASS for an exact, grounded, centred result", () => {
    const v = validateCorrectedBounds(flynBox(), flyn, validationConfig);
    expect(v.status).toBe("PASS");
    expect(v.dimensions.width.errorMm).toBeCloseTo(0, 9);
    expect(v.groundOffsetMm).toBeCloseTo(0, 9);
  });

  test("dimension tolerance boundary", () => {
    expect(validateCorrectedBounds(flynBox(0.49), flyn, validationConfig).status).toBe("PASS");
    const v = validateCorrectedBounds(flynBox(0.6), flyn, validationConfig);
    expect(v.status).toBe("FAIL");
    expect(v.reasonCodes).toEqual(["WIDTH_OUT_OF_TOLERANCE"]);
  });

  test("ground-plane tolerance boundary", () => {
    expect(validateCorrectedBounds(flynBox(0, 0.0005), flyn, validationConfig).status).toBe("PASS");
    expect(validateCorrectedBounds(flynBox(0, -0.0005), flyn, validationConfig).status).toBe("PASS");
    const floating = validateCorrectedBounds(flynBox(0, 0.0006), flyn, validationConfig);
    expect(floating.status).toBe("FAIL");
    expect(floating.reasonCodes).toEqual(["GROUND_CONTACT_OUT_OF_TOLERANCE"]);
  });

  test("off-centre footprint FAILs", () => {
    const b = flynBox();
    const shifted: Bounds = { min: [b.min[0] + 0.002, b.min[1], b.min[2]], max: [b.max[0] + 0.002, b.max[1], b.max[2]] };
    const v = validateCorrectedBounds(shifted, flyn, validationConfig);
    expect(v.status).toBe("FAIL");
    expect(v.reasonCodes).toEqual(["FOOTPRINT_NOT_CENTRED"]);
  });

  test("empty, non-finite, degenerate and absurd bounds FAIL", () => {
    const empty = validateCorrectedBounds({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }, flyn, validationConfig);
    expect(empty.status).toBe("FAIL");
    expect(empty.reasonCodes).toContain("EMPTY_GEOMETRY");
    expect(empty.dimensions.width.measuredMm).toBeNull();
    expect(Object.values(empty.metrics).every(Number.isFinite)).toBe(true);
    expect(validateCorrectedBounds({ min: [0, Number.NaN, 0], max: [1, 1, 1] }, flyn, validationConfig).reasonCodes).toContain("NON_FINITE_BOUNDS");
    expect(validateCorrectedBounds(box(1.463, 0, 0.795), flyn, validationConfig).reasonCodes).toContain("DEGENERATE_GEOMETRY");
    expect(validateCorrectedBounds(box(14.63, 0.953, 0.795), flyn, validationConfig).reasonCodes).toContain("IMPLAUSIBLE_BOUNDS");
  });

  test("lost visual content FAILs even when the numbers are right", () => {
    const v = validateCorrectedBounds(flynBox(), flyn, validationConfig, { preserved: false, differences: ["textures 1 → 0"] });
    expect(v.status).toBe("FAIL");
    expect(v.reasonCodes).toEqual(["VISUAL_DATA_CHANGED"]);
  });
});
