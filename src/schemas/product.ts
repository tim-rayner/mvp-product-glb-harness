import { z } from "zod";

export const DimensionsMmSchema = z.object({
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
});

export const SpatialProductSourceSchema = z.object({
  merchantId: z.string().min(1),
  productId: z.string().min(1),
  sku: z.string().min(1).optional(),
  title: z.string().min(1),
  sourceUrl: z.url(),
  images: z.array(z.url()).min(1),
  dimensions: DimensionsMmSchema,
  dimensionSource: z.string().min(1),
  dimensionConfidence: z.enum(["high", "medium", "low"]),
});

export type DimensionsMm = z.infer<typeof DimensionsMmSchema>;
export type SpatialProductSource = z.infer<typeof SpatialProductSourceSchema>;