import type { Document } from "@gltf-transform/core";
import type { AxisMapping } from "../../../shared/geometry/dimensions";
import type { PipelineConfig, ProportionAnalysis, ValidationDecision } from "../schemas";
import type { SpatialProductSource } from "../../products/product";
import { largestDimension, type Bounds } from "../../../shared/geometry/bounds";
import { proportionalCheck } from "../analysis/gate";
import { contentSummary, measureBounds, preflight, readGlb, SUPPORTED_EXTENSIONS } from "../../../shared/geometry/gltf";
import { analyseProportions, checkedExtents, measureAsset } from "../analysis/proportions";
import { errorMessage } from "../../../shared/utils/errors";
import { formatRatios } from "../../../shared/utils/format";
import { StageFailure } from "../errors";
import type { StageContext } from "../types";

export interface InspectedRaw {
  document: Document;
  bounds: Bounds;
  analysis: ProportionAnalysis;
  blockers: string[];
}

/**
 * Parses the raw GLB, runs the structural preflight and measures its proportions. Bounds are
 * validated (empty, non-finite, zero-sized → INVALID_GEOMETRY) before any ratio maths.
 */
export async function inspectRaw(
  { manifest, warn }: StageContext,
  bytes: Uint8Array,
  source: SpatialProductSource,
  axisMapping: AxisMapping,
  config: PipelineConfig,
): Promise<InspectedRaw> {
  let parsed: Awaited<ReturnType<typeof readGlb>>;
  try {
    parsed = await readGlb(bytes);
  } catch (e) {
    throw new StageFailure("GLB_PARSE_FAILED", `Raw GLB could not be parsed: ${errorMessage(e)}`);
  }
  const { document, extensions } = parsed;

  const { blockers, warnings } = preflight(document);
  const unsupported = extensions.extensionsUsed.filter((name) => !SUPPORTED_EXTENSIONS.has(name));
  if (unsupported.length > 0) blockers.push(`Unsupported glTF extensions would be dropped on export: ${unsupported.join(", ")}`);
  for (const w of warnings) warn("inspect-raw", w);

  const bounds = measureBounds(document);
  const reference = config.proportionalCheck.referenceDimension ?? largestDimension(source.dimensions);
  manifest.rawMeasurements = measureAsset(bounds, axisMapping, "raw", reference);
  const analysis = analyseProportions(checkedExtents(bounds), source.dimensions, axisMapping, reference);
  if (!Object.values(analysis.scaleFactors).every(Number.isFinite)) {
    throw new StageFailure("INVALID_GEOMETRY", "Scale factors are not finite");
  }
  manifest.rawProportions = analysis;
  manifest.content = { raw: contentSummary(document), corrected: null, extensionsUsed: extensions.extensionsUsed };
  return { document, bounds, analysis, blockers };
}

export const describeInspection = ({ analysis }: InspectedRaw) =>
  `raw ratios W:D:H ${formatRatios(analysis.rawRatios)} vs authoritative ${formatRatios(analysis.authoritativeRatios)}`;

/** Code-measured proportional check; any proportional error is corrected automatically later. */
export function checkProportions(
  { manifest, warn }: StageContext,
  analysis: ProportionAnalysis,
  axisMapping: AxisMapping,
  config: PipelineConfig,
): ValidationDecision {
  const result = proportionalCheck(analysis, axisMapping, config.proportionalCheck);
  manifest.proportionalCheck = result.decision;
  for (const w of result.warnings) warn("proportional-check", w);
  return result.decision;
}

export const describeProportionalCheck = (decision: ValidationDecision, analysis: ProportionAnalysis) =>
  decision.status === "PASS"
    ? `PASS (max proportional error ${analysis.maxAbsProportionalErrorPct.toFixed(2)}%, scale spread ${analysis.scaleSpreadPct.toFixed(2)}%)`
    : `FAIL (${decision.reasonCodes.join(", ")})`;

export const proportionalFailure = (decision: ValidationDecision) =>
  new StageFailure("PROPORTIONAL_FAIL", `Raw geometry is not plausibly this product: ${decision.reasons.join("; ")}`, {
    reasonCodes: decision.reasonCodes,
  });
