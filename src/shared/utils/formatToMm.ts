export type LengthUnit = "mm" | "cm" | "m" | "in";

const MM_PER_UNIT: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
};

/** Converts a length in mm, cm, m or inches to millimetres, the canonical unit. */
export function toMm(value: number, unit: LengthUnit): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Invalid length value: ${value}`);
  }
  return value * MM_PER_UNIT[unit];
}

/** Converts a canonical millimetre length to another unit, at a processing or rendering boundary. */
export function fromMm(valueMm: number, unit: LengthUnit): number {
  if (!Number.isFinite(valueMm)) {
    throw new RangeError(`Invalid length value: ${valueMm}`);
  }
  return valueMm / MM_PER_UNIT[unit];
}

export const mmToMetres = (valueMm: number) => fromMm(valueMm, "m");
export const metresToMm = (valueM: number) => toMm(valueM, "m");

/** Returns a converter bound to a unit, e.g. `const fromCm = formatToMm("cm")`. */
export function formatToMm(unit: LengthUnit): (value: number) => number {
  return (value) => toMm(value, unit);
}
