import { z } from "zod";
import { AxisMappingSchema, SemanticDimensionSchema } from "../../../shared/geometry/dimensions";
import { DimensionalValidationConfigSchema } from "./config";

export const GateStatusSchema = z.enum(["PASS", "FAIL"]);

const XyzSchema = z.object({ x: z.number(), y: z.number(), z: z.number() });
const SemanticNumbersSchema = z.object({ width: z.number(), depth: z.number(), height: z.number() });
const QuaternionSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/** Null where the exported file had no finite bounds to measure. */
const MeasuredNumberSchema = z.number().nullable();

export const ValidationDecisionSchema = z.object({
  status: GateStatusSchema,
  reasonCodes: z.array(z.string()),
  reasons: z.array(z.string()),
  metrics: z.record(z.string(), z.number()),
});

/**
 * An asset's world-space bounds read through an axis mapping. `units` is "raw" (unknown generator
 * units) or "mm"; `ratios` are each dimension over the reference dimension; `groundOffset` is the
 * lowest point along the height axis, in `units`.
 */
export const AssetMeasurementsSchema = z.object({
  units: z.enum(["raw", "mm"]),
  min: XyzSchema,
  max: XyzSchema,
  axisExtents: XyzSchema,
  axisMapping: AxisMappingSchema,
  canonicalDimensions: SemanticNumbersSchema,
  ratios: SemanticNumbersSchema,
  groundOffset: z.number(),
});

/**
 * Raw shape compared with the authoritative dimensions. `proportionalErrorPct` is
 * (raw ratio / authoritative ratio − 1) × 100; `scaleFactors` take raw units to metres per raw axis.
 */
export const ProportionAnalysisSchema = z.object({
  referenceDimension: SemanticDimensionSchema,
  rawRatios: SemanticNumbersSchema,
  authoritativeRatios: SemanticNumbersSchema,
  proportionalErrorPct: SemanticNumbersSchema,
  maxAbsProportionalErrorPct: z.number(),
  scaleFactors: XyzSchema,
  scaleSpreadPct: z.number(),
  rawAspectRatio: z.number(),
  bestAxisMapping: AxisMappingSchema,
  bestAxisMappingScaleSpreadPct: z.number(),
});

/**
 * The root transform applied to the raw asset. `type` is "uniform" when the raw proportions already
 * matched. `scaleFactors` apply per raw axis (raw units → metres), then `rotation` (quaternion
 * [x, y, z, w]) takes raw axes onto canonical glTF axes (width=x, height=y, depth=z), then
 * `translationM` centres the footprint and grounds the product.
 */
export const CorrectionSchema = z.object({
  method: z.string(),
  type: z.enum(["uniform", "non-uniform"]),
  scaleFactors: XyzSchema,
  rotation: QuaternionSchema,
  translationM: XyzSchema,
  depthAxisFlipped: z.boolean(),
});

const DimensionCheckSchema = z.object({
  targetMm: z.number(),
  measuredMm: MeasuredNumberSchema,
  errorMm: MeasuredNumberSchema,
  errorPct: MeasuredNumberSchema,
  pass: z.boolean(),
});

export const DimensionalValidationSchema = ValidationDecisionSchema.extend({
  dimensions: z.object({ width: DimensionCheckSchema, depth: DimensionCheckSchema, height: DimensionCheckSchema }),
  groundOffsetMm: MeasuredNumberSchema,
  footprintCentreOffsetMm: z.object({ x: MeasuredNumberSchema, z: MeasuredNumberSchema }),
  tolerances: DimensionalValidationConfigSchema,
});

export type GateStatus = z.infer<typeof GateStatusSchema>;
export type ValidationDecision = z.infer<typeof ValidationDecisionSchema>;
export type AssetMeasurements = z.infer<typeof AssetMeasurementsSchema>;
export type ProportionAnalysis = z.infer<typeof ProportionAnalysisSchema>;
export type Correction = z.infer<typeof CorrectionSchema>;
export type DimensionalValidation = z.infer<typeof DimensionalValidationSchema>;
