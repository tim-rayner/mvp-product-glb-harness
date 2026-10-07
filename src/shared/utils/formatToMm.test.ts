import { describe, expect, test } from "bun:test";
import { fromMm, metresToMm, mmToMetres, toMm } from "./formatToMm";

describe("unit boundaries", () => {
  test("millimetres ↔ metres", () => {
    expect(mmToMetres(1000)).toBe(1);
    expect(mmToMetres(1463)).toBeCloseTo(1.463, 12);
    expect(metresToMm(0.795)).toBeCloseTo(795, 9);
    expect(fromMm(254, "in")).toBeCloseTo(10, 12);
    expect(fromMm(toMm(146.3, "cm"), "cm")).toBeCloseTo(146.3, 12);
    expect(() => mmToMetres(Number.NaN)).toThrow(RangeError);
  });
});
