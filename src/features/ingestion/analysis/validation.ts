import { SEMANTIC_DIMENSIONS, type DimensionsMm } from "../../../shared/geometry/dimensions";
import type { DimensionalValidation, DimensionalValidationConfig, GateStatus } from "../schemas";
import { metresToMm } from "../../../shared/utils/formatToMm";
import { AXIS_INDEX, type Bounds } from "../../../shared/geometry/bounds";
import { worstStatus } from "./gate";
import { CANONICAL_AXIS_MAPPING } from "./transform";

/** Both tolerances are inclusive and must hold together. */
export function withinTolerance(errorMm: number, targetMm: number, config: DimensionalValidationConfig): boolean {
  const errorPct = (errorMm / targetMm) * 100;
  return Math.abs(errorMm) <= config.toleranceMm && Math.abs(errorPct) <= config.tolerancePct;
}

const orNull = (v: number) => (Number.isFinite(v) ? v : null);

/** Whether mesh/primitive/vertex/material/texture counts survived export unchanged. */
export interface ContentCheck {
  preserved: boolean;
  differences: string[];
}

/**
 * Pure PASS | FAIL decision for a corrected asset, from bounds re-measured off the exported file
 * (glTF metres, canonical axes). Converts to mm here, at the validation boundary. Only finite
 * metrics are reported: a missing metric means it couldn't be measured.
 */
export function validateCorrectedBounds(
  boundsM: Bounds,
  target: DimensionsMm,
  config: DimensionalValidationConfig,
  content: ContentCheck = { preserved: true, differences: [] },
): DimensionalValidation {
  const findings: Array<{ status: GateStatus; code: string; reason: string }> = [];
  const add = (status: GateStatus, code: string, reason: string) => findings.push({ status, code, reason });

  const values = [...boundsM.min, ...boundsM.max];
  const finite = values.every(Number.isFinite);
  if (!finite) {
    add("FAIL", values.every((v) => Math.abs(v) === Infinity) ? "EMPTY_GEOMETRY" : "NON_FINITE_BOUNDS",
      "Corrected bounds are not finite: the exported file has no measurable geometry");
  }

  const minMm = boundsM.min.map((v) => (Number.isFinite(v) ? metresToMm(v) : Number.NaN));
  const maxMm = boundsM.max.map((v) => (Number.isFinite(v) ? metresToMm(v) : Number.NaN));
  const extentMm = [0, 1, 2].map((i) => maxMm[i]! - minMm[i]!);

  const dimensions = {} as DimensionalValidation["dimensions"];
  for (const d of SEMANTIC_DIMENSIONS) {
    const measuredMm = extentMm[AXIS_INDEX[CANONICAL_AXIS_MAPPING[d]]]!;
    const errorMm = measuredMm - target[d];
    const pass = Number.isFinite(errorMm) && withinTolerance(errorMm, target[d], config);
    const errorPct = (errorMm / target[d]) * 100;
    dimensions[d] = {
      targetMm: target[d],
      measuredMm: orNull(measuredMm),
      errorMm: orNull(errorMm),
      errorPct: orNull(errorPct),
      pass,
    };

    if (finite && !(measuredMm > 0)) {
      add("FAIL", "DEGENERATE_GEOMETRY", `Corrected ${d} is ${measuredMm} mm: geometry collapsed`);
    } else if (finite && measuredMm > config.maxPlausibleDimensionMm) {
      add("FAIL", "IMPLAUSIBLE_BOUNDS", `Corrected ${d} is ${measuredMm.toFixed(1)} mm (limit ${config.maxPlausibleDimensionMm} mm)`);
    }
    if (finite && !pass) {
      add(
        "FAIL",
        `${d.toUpperCase()}_OUT_OF_TOLERANCE`,
        `${d} is ${measuredMm.toFixed(3)} mm vs authoritative ${target[d]} mm (error ${errorMm.toFixed(3)} mm, ` +
          `${errorPct.toFixed(3)}%; tolerance ±${config.toleranceMm} mm and ±${config.tolerancePct}%)`,
      );
    }
  }

  const groundOffsetMm = minMm[1]!;
  if (finite && !(Math.abs(groundOffsetMm) <= config.groundToleranceMm)) {
    add(
      "FAIL",
      "GROUND_CONTACT_OUT_OF_TOLERANCE",
      `Lowest point is ${groundOffsetMm.toFixed(3)} mm from the ground plane (tolerance ±${config.groundToleranceMm} mm)`,
    );
  }

  const footprintCentreOffsetMm = { x: (minMm[0]! + maxMm[0]!) / 2, z: (minMm[2]! + maxMm[2]!) / 2 };
  if (
    finite &&
    !(Math.abs(footprintCentreOffsetMm.x) <= config.pivotToleranceMm && Math.abs(footprintCentreOffsetMm.z) <= config.pivotToleranceMm)
  ) {
    add(
      "FAIL",
      "FOOTPRINT_NOT_CENTRED",
      `Footprint centre is offset (${footprintCentreOffsetMm.x.toFixed(2)}, ${footprintCentreOffsetMm.z.toFixed(2)}) mm ` +
        `from the origin (tolerance ±${config.pivotToleranceMm} mm)`,
    );
  }

  if (!content.preserved) {
    add("FAIL", "VISUAL_DATA_CHANGED", `Export changed visual content: ${content.differences.join("; ")}`);
  }

  const errors = SEMANTIC_DIMENSIONS.map((d) => dimensions[d]);
  const metrics = {
    widthMm: dimensions.width.measuredMm,
    depthMm: dimensions.depth.measuredMm,
    heightMm: dimensions.height.measuredMm,
    widthErrorMm: dimensions.width.errorMm,
    depthErrorMm: dimensions.depth.errorMm,
    heightErrorMm: dimensions.height.errorMm,
    maxAbsErrorMm: Math.max(...errors.map((c) => Math.abs(c.errorMm ?? Number.NaN))),
    maxAbsErrorPct: Math.max(...errors.map((c) => Math.abs(c.errorPct ?? Number.NaN))),
    groundOffsetMm,
  };

  return {
    status: worstStatus(findings.map((f) => f.status)),
    reasonCodes: [...new Set(findings.map((f) => f.code))],
    reasons: findings.map((f) => f.reason),
    metrics: Object.fromEntries(
      Object.entries(metrics).filter((entry): entry is [string, number] => Number.isFinite(entry[1])),
    ),
    dimensions,
    groundOffsetMm: orNull(groundOffsetMm),
    footprintCentreOffsetMm: { x: orNull(footprintCentreOffsetMm.x), z: orNull(footprintCentreOffsetMm.z) },
    tolerances: config,
  };
}
