import { z } from "zod";
import { PipelineErrorCodeSchema } from "./manifest";

/**
 * Provider record stored beside each raw attempt (`generation.json`). The shape predates the
 * pipeline: `completedAt`, `rawSha256` and `errorCode` are added by the pipeline and absent on
 * records written by the original generate command.
 */
export const GenerationRecordSchema = z.object({
  product: z.object({ id: z.string(), title: z.string(), sku: z.string().optional() }),
  provider: z.string(),
  endpoint: z.string(),
  model: z.string(),
  taskId: z.string().nullable(),
  submittedAt: z.string(),
  sourceImages: z.array(z.string()),
  settings: z.record(z.string(), z.unknown()),
  latencyMs: z.number().nullable(),
  providerTimings: z
    .object({ createdAt: z.number(), startedAt: z.number(), finishedAt: z.number() })
    .nullable(),
  creditsConsumed: z.number().nullable(),
  attempt: z.number().int().positive(),
  outputFile: z.string().nullable(),
  status: z.enum(["succeeded", "failed"]),
  error: z.string().nullable(),
  completedAt: z.string().nullable().optional(),
  rawSha256: z.string().nullable().optional(),
  errorCode: PipelineErrorCodeSchema.nullable().optional(),
});
export type GenerationRecord = z.infer<typeof GenerationRecordSchema>;
