import { describe, expect, test } from "bun:test";
import { NormalisationConfigSchema, type AxisMapping } from "../schemas/normalisation";
import { boundsSize, computeResiduals, planCorrection, toSemantic, type Vec3 } from "./dimensions";

const yUp: AxisMapping = { width: "x", height: "y", depth: "z" };
const config = NormalisationConfigSchema.parse({});

describe("boundsSize", () => {
  test("returns per-axis extent", () => {
    expect(boundsSize({ min: [-1, -2, -3], max: [1, 2, 3] })).toEqual([2, 4, 6]);
  });

  test("rejects degenerate or empty bounds", () => {
    expect(() => boundsSize({ min: [0, 0, 0], max: [1, 0, 1] })).toThrow(/Degenerate/);
    expect(() => boundsSize({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] })).toThrow();
  });
});

describe("toSemantic", () => {
  test("follows the axis mapping rather than assuming Y-up", () => {
    expect(toSemantic([1, 2, 3], { width: "x", height: "z", depth: "y" })).toEqual({ width: 1, depth: 2, height: 3 });
  });
});

describe("planCorrection", () => {
  test("a proportionally correct model gets a uniform correction", () => {
    const plan = planCorrection([2, 1, 0.5], { width: 1000, height: 500, depth: 250 }, yUp, config);
    expect(plan.uniform).toBe(true);
    expect(plan.scaleByAxis).toEqual([0.5, 0.5, 0.5]);
    expect(plan.flaggedDimensions).toEqual([]);
  });

  test("scales into glTF metres regardless of raw units", () => {
    // Same shape authored in "centimetres": the scale absorbs the unit difference.
    const plan = planCorrection([200, 100, 50], { width: 1000, height: 500, depth: 250 }, yUp, config);
    expect(plan.scaleByAxis).toEqual([0.005, 0.005, 0.005]);
  });

  test("reproduces the Session 2 Flyn figures from raw measurements", () => {
    const plan = planCorrection([1.899646, 1.267491, 1.135289], { width: 1463, depth: 795, height: 953 }, yUp, config);
    expect(plan.referenceDimension).toBe("width");
    expect(plan.uniform).toBe(false);
    expect(plan.dimensions.width.correctionPct).toBeCloseTo(0, 10);
    expect(plan.dimensions.depth.uniformFromReferenceMm).toBeCloseTo(874.3, 1);
    expect(plan.dimensions.height.uniformFromReferenceMm).toBeCloseTo(976.1, 1);
    expect(plan.dimensions.depth.deviationAfterUniformPct).toBeCloseTo(9.98, 2);
    expect(plan.dimensions.height.deviationAfterUniformPct).toBeCloseTo(2.43, 2);
    expect(plan.flaggedDimensions).toEqual(["depth"]);
  });

  test("places each scale on the mapped axis", () => {
    const zUp: AxisMapping = { width: "x", depth: "y", height: "z" };
    const plan = planCorrection([2, 4, 8], { width: 1000, depth: 1000, height: 1000 }, zUp, config);
    expect(plan.scaleByAxis).toEqual([0.5, 0.25, 0.125]);
  });

  test("review threshold and reference dimension are configurable", () => {
    const target = { width: 1000, depth: 1030, height: 1000 };
    const strict = NormalisationConfigSchema.parse({ reviewThresholdPct: 2, referenceDimension: "height" });
    expect(planCorrection([1, 1, 1], target, yUp, strict).flaggedDimensions).toEqual(["depth"]);
    expect(planCorrection([1, 1, 1], target, yUp, config).flaggedDimensions).toEqual([]);
    expect(planCorrection([1, 1, 1], target, yUp, strict).referenceDimension).toBe("height");
  });
});

describe("computeResiduals", () => {
  test("passes within tolerance and fails outside it", () => {
    const target = { width: 1000, depth: 500, height: 800 };
    const size: Vec3 = [1.0002, 0.8, 0.4994];
    const result = computeResiduals(size, target, yUp, 0.5);
    expect(result.dimensions.width.residualMm).toBeCloseTo(0.2, 6);
    expect(result.dimensions.depth.pass).toBe(false);
    expect(result.pass).toBe(false);
    expect(computeResiduals(size, target, yUp, 1).pass).toBe(true);
  });
});
