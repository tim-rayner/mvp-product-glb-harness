import { z } from "zod";
import { SemanticDimensionSchema } from "../../../shared/geometry/dimensions";

/**
 * Proportional check of the raw asset, before correction. Proportional error of any size is
 * corrected automatically (non-uniform per-axis scale) and reported; only an absurd raw aspect
 * ratio fails the run. Limits are inclusive.
 *
 * - `uniformTolerancePct`: proportional errors at or below this are reported as a uniform rescale.
 * - `axisMappingMarginPct`: warn when another axis assignment would need this many fewer points of scale spread.
 * - `maxRawAspectRatio`: FAIL when the raw longest/shortest axis ratio exceeds this.
 * - `referenceDimension`: what proportions are expressed relative to; defaults to the largest authoritative dimension.
 */
export const ProportionalCheckConfigSchema = z.object({
  uniformTolerancePct: z.number().nonnegative().default(0.5),
  axisMappingMarginPct: z.number().nonnegative().default(5),
  maxRawAspectRatio: z.number().gt(1).default(100),
  referenceDimension: SemanticDimensionSchema.optional(),
});

/**
 * Independent validation of the exported GLB. A dimension passes only when BOTH the absolute and the
 * percentage tolerance hold (inclusive). All absolute tolerances are in mm.
 *
 * - `groundToleranceMm`: max |lowest point − ground plane (y = 0)|.
 * - `pivotToleranceMm`: max horizontal offset of the footprint centre from the origin.
 * - `maxPlausibleDimensionMm`: any corrected dimension above this is treated as absurd.
 */
export const DimensionalValidationConfigSchema = z.object({
  toleranceMm: z.number().nonnegative().default(0.5),
  tolerancePct: z.number().nonnegative().default(0.1),
  groundToleranceMm: z.number().nonnegative().default(0.5),
  pivotToleranceMm: z.number().nonnegative().default(1),
  maxPlausibleDimensionMm: z.number().positive().default(5000),
});

export const PipelineConfigSchema = z.object({
  proportionalCheck: ProportionalCheckConfigSchema.prefault({}),
  dimensionalValidation: DimensionalValidationConfigSchema.prefault({}),
});

export type ProportionalCheckConfig = z.infer<typeof ProportionalCheckConfigSchema>;
export type DimensionalValidationConfig = z.infer<typeof DimensionalValidationConfigSchema>;
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
export type PipelineConfigInput = z.input<typeof PipelineConfigSchema>;
