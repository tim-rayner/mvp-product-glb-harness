import { z } from "zod";

/** A product's authoritative size, keyed by semantic dimension. Millimetres are canonical everywhere. */
export const DimensionsMmSchema = z.object({
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
});

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

export type DimensionsMm = z.infer<typeof DimensionsMmSchema>;
export type SemanticDimension = z.infer<typeof SemanticDimensionSchema>;
export type GltfAxis = z.infer<typeof GltfAxisSchema>;
export type AxisMapping = z.infer<typeof AxisMappingSchema>;
