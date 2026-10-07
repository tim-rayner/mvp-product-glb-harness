import { z } from "zod";

export const SEMANTIC_DIMENSIONS = ["width", "depth", "height"] as const;
export const SemanticDimensionSchema = z.enum(SEMANTIC_DIMENSIONS);

/** A glTF scene axis. glTF 2.0 is right-handed, +Y up, but generated assets don't always honour that. */
export const GltfAxisSchema = z.enum(["x", "y", "z"]);

/**
 * Which glTF axis carries each semantic product dimension. Must be supplied per asset:
 * there is deliberately no default, because generators don't agree on orientation.
 */
export const AxisMappingSchema = z
  .object({
    width: GltfAxisSchema,
    depth: GltfAxisSchema,
    height: GltfAxisSchema,
  })
  .refine((m) => new Set([m.width, m.depth, m.height]).size === 3, {
    message: "Axis mapping must assign width, depth and height to three distinct axes",
  });

export const NormalisationConfigSchema = z.object({
  /** Max |corrected − target| per dimension, in mm, for the numerical check to pass. */
  toleranceMm: z.number().nonnegative().default(0.5),
  /**
   * Flag a dimension for human review when its shape correction (relative to the reference
   * dimension) exceeds this percentage. Experimental benchmark guardrail, not a production rule.
   */
  reviewThresholdPct: z.number().positive().default(5),
  /** Scale factors within this percentage of each other are reported as a uniform correction. */
  uniformityTolerancePct: z.number().nonnegative().default(0.1),
  /**
   * Dimension the shape correction is expressed relative to (it gets 0% by definition).
   * Defaults to the largest target dimension.
   */
  referenceDimension: SemanticDimensionSchema.optional(),
});

export type SemanticDimension = z.infer<typeof SemanticDimensionSchema>;
export type GltfAxis = z.infer<typeof GltfAxisSchema>;
export type AxisMapping = z.infer<typeof AxisMappingSchema>;
export type NormalisationConfig = z.infer<typeof NormalisationConfigSchema>;
export type NormalisationConfigInput = z.input<typeof NormalisationConfigSchema>;
