import { describe, expect, test } from "bun:test";
import { layoutRow } from "./lineup";

describe("layoutRow", () => {
  test("places boxes left to right with equal gaps, centred on x = 0", () => {
    const slots = layoutRow([1.2, 0.8, 0.5], 0.3);
    // total = 2.5 + 2 × 0.3 = 3.1
    expect(slots[0]!.minX).toBeCloseTo(-1.55);
    expect(slots[0]!.maxX).toBeCloseTo(-0.35);
    expect(slots[1]!.minX - slots[0]!.maxX).toBeCloseTo(0.3);
    expect(slots[2]!.minX - slots[1]!.maxX).toBeCloseTo(0.3);
    expect(slots[2]!.maxX).toBeCloseTo(1.55);
  });

  test("a single box is centred", () => {
    const [slot] = layoutRow([0.9], 0.3);
    expect(slot!.minX).toBeCloseTo(-0.45);
    expect(slot!.maxX).toBeCloseTo(0.45);
  });

  test("an empty list yields no slots", () => {
    expect(layoutRow([])).toEqual([]);
  });
});
