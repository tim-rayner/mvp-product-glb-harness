import { SEMANTIC_DIMENSIONS } from "../../../shared/geometry/dimensions";
import type { GateStatus, ProportionAnalysis, ProportionalCheckConfig, ValidationDecision } from "../schemas";
import { sameMapping } from "./proportions";

export const worstStatus = (statuses: GateStatus[]): GateStatus => (statuses.includes("FAIL") ? "FAIL" : "PASS");

/** Inclusive: value ≤ limit → PASS. Non-finite values FAIL. */
export const withinLimit = (value: number, limit: number): boolean => Number.isFinite(value) && value <= limit;

const fmt = (n: number) => n.toFixed(2);
const signed = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}`;
const mappingLabel = (m: ProportionAnalysis["bestAxisMapping"]) => `width=${m.width}, depth=${m.depth}, height=${m.height}`;

/** `warnings` are non-blocking findings: how much correction was needed, suspicious orientation. */
export interface ProportionalCheckResult {
  decision: ValidationDecision;
  warnings: string[];
}

/**
 * Pure PASS | FAIL check of raw proportions, run before correction. Proportional error of any size
 * is corrected automatically and reported as a warning; only geometry that is not plausibly a
 * product (absurd aspect ratio) stops the run. Nothing here asks a human.
 */
export function proportionalCheck(
  analysis: ProportionAnalysis,
  configuredMapping: ProportionAnalysis["bestAxisMapping"],
  config: ProportionalCheckConfig,
): ProportionalCheckResult {
  const failures: Array<{ code: string; reason: string }> = [];
  const warnings: string[] = [];

  if (!withinLimit(analysis.rawAspectRatio, config.maxRawAspectRatio)) {
    failures.push({
      code: "ABSURD_ASPECT_RATIO",
      reason:
        `Raw longest/shortest axis ratio is ${fmt(analysis.rawAspectRatio)} (limit ${config.maxRawAspectRatio}): ` +
        "the geometry is not plausibly this product",
    });
  }

  for (const d of SEMANTIC_DIMENSIONS) {
    if (d === analysis.referenceDimension) continue;
    const error = analysis.proportionalErrorPct[d];
    const description =
      `${d} is ${signed(error)}% out of proportion relative to ${analysis.referenceDimension} ` +
      `(raw ${d}:${analysis.referenceDimension} ${fmt(analysis.rawRatios[d])} vs authoritative ${fmt(analysis.authoritativeRatios[d])})`;
    if (Math.abs(error) > config.uniformTolerancePct) warnings.push(`${description}: corrected automatically`);
  }

  const mappingGain = analysis.scaleSpreadPct - analysis.bestAxisMappingScaleSpreadPct;
  if (!sameMapping(analysis.bestAxisMapping, configuredMapping) && mappingGain > config.axisMappingMarginPct) {
    warnings.push(
      `Axis mapping ${mappingLabel(analysis.bestAxisMapping)} would need ${fmt(mappingGain)} points less scale spread ` +
        `than the configured ${mappingLabel(configuredMapping)}: the generated model may be oriented differently`,
    );
  }

  return {
    decision: {
      status: failures.length > 0 ? "FAIL" : "PASS",
      reasonCodes: failures.map((f) => f.code),
      reasons: failures.map((f) => f.reason),
      metrics: {
        maxAbsProportionalErrorPct: analysis.maxAbsProportionalErrorPct,
        widthProportionalErrorPct: analysis.proportionalErrorPct.width,
        depthProportionalErrorPct: analysis.proportionalErrorPct.depth,
        heightProportionalErrorPct: analysis.proportionalErrorPct.height,
        scaleSpreadPct: analysis.scaleSpreadPct,
        bestAxisMappingScaleSpreadPct: analysis.bestAxisMappingScaleSpreadPct,
        rawAspectRatio: analysis.rawAspectRatio,
      },
    },
    warnings,
  };
}
