import { z } from "zod";
import { AxisMappingSchema, DimensionsMmSchema } from "../../../shared/geometry/dimensions";
import { PipelineConfigSchema } from "./config";
import {
  AssetMeasurementsSchema,
  CorrectionSchema,
  DimensionalValidationSchema,
  ProportionAnalysisSchema,
  ValidationDecisionSchema,
} from "./decisions";

/** Version of the persisted run manifest. Bump on any breaking change to RunManifestSchema. */
export const MANIFEST_SCHEMA_VERSION = 2;

export const PIPELINE_STAGES = [
  "load-source",
  "acquire-raw",
  "persist-raw",
  "inspect-raw",
  "proportional-check",
  "correct",
  "export",
  "validate",
  "persist-provenance",
  "expose-viewer",
] as const;
export const PipelineStageSchema = z.enum(PIPELINE_STAGES);
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

export const PIPELINE_ERROR_CODES = [
  "INVALID_SOURCE",
  "INVALID_CONFIG",
  "PROVIDER_SUBMISSION_FAILED",
  "PROVIDER_GENERATION_FAILED",
  "PROVIDER_JOB_INCOMPLETE",
  "DOWNLOAD_FAILED",
  "RAW_ASSET_UNAVAILABLE",
  "RAW_ASSET_MUTATED",
  "GLB_PARSE_FAILED",
  "INVALID_GEOMETRY",
  "PROPORTIONAL_FAIL",
  "CORRECTION_FAILED",
  "EXPORT_FAILED",
  "CORRECTED_PARSE_FAILED",
  "DIMENSIONAL_VALIDATION_FAILED",
  "RUN_ID_COLLISION",
] as const;
export const PipelineErrorCodeSchema = z.enum(PIPELINE_ERROR_CODES);
export type PipelineErrorCode = z.infer<typeof PipelineErrorCodeSchema>;

export const PipelineErrorRecordSchema = z.object({
  code: PipelineErrorCodeSchema,
  stage: PipelineStageSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type PipelineErrorRecord = z.infer<typeof PipelineErrorRecordSchema>;

/**
 * FAILED is a true pipeline failure (see `errors`). COMPLETED means proportions were checked, and the
 * asset corrected, exported and independently validated; only COMPLETED runs are shown in the viewer.
 */
export const RUN_STATUSES = ["RUNNING", "FAILED", "COMPLETED"] as const;
export const RunStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/** A file the pipeline produced or consumed. `path` is relative to the working directory the pipeline ran in. */
export const AssetRefSchema = z.object({
  path: z.string(),
  sha256: z.string(),
  bytes: z.number().int().nonnegative(),
});

export const RawAssetRefSchema = AssetRefSchema.extend({
  origin: z.enum(["provider-generated", "existing-provider-attempt", "existing-file"]),
  attempt: z.number().int().positive().nullable(),
});

/** Provider request behind the raw asset. `reused` is true when the run reused an earlier result instead of making a new request. */
export const ProviderProvenanceSchema = z.object({
  name: z.string(),
  endpoint: z.string(),
  model: z.string(),
  options: z.record(z.string(), z.unknown()),
  jobId: z.string().nullable(),
  attempt: z.number().int().positive(),
  submittedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  latencyMs: z.number().nullable(),
  credits: z.number().nullable(),
  sourceImages: z.array(z.string()),
  reused: z.boolean(),
});

const PipelineVersionSchema = z.object({
  codeVersion: z.string(),
  gitCommit: z.string().nullable(),
  gitDirty: z.boolean().nullable(),
});

/** Everything recorded about one ingestion run. `authoritativeDimensionsMm` is null only when the source failed validation. */
export const RunManifestSchema = z.object({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
  runId: z.string(),
  productId: z.string(),
  sku: z.string().nullable(),
  title: z.string(),
  status: RunStatusSchema,
  currentStage: PipelineStageSchema.nullable(),
  completedStages: z.array(PipelineStageSchema),
  attempt: z.number().int().positive().nullable(),
  rawAsset: RawAssetRefSchema.nullable(),
  correctedAsset: AssetRefSchema.nullable(),
  authoritativeDimensionsMm: DimensionsMmSchema.nullable(),
  axisMapping: AxisMappingSchema,
  rawMeasurements: AssetMeasurementsSchema.nullable(),
  rawProportions: ProportionAnalysisSchema.nullable(),
  proportionalCheck: ValidationDecisionSchema.nullable(),
  correction: CorrectionSchema.nullable(),
  correctedMeasurements: AssetMeasurementsSchema.nullable(),
  dimensionalValidation: DimensionalValidationSchema.nullable(),
  provenance: z.object({
    source: z.object({
      reference: z.string(),
      sha256: z.string(),
      sourceUrl: z.string(),
      dimensionSource: z.string(),
      dimensionConfidence: z.string(),
      benchmarkImages: z.array(z.string()),
    }),
    provider: ProviderProvenanceSchema.nullable(),
    pipeline: PipelineVersionSchema,
    config: PipelineConfigSchema,
  }),
  timings: z.object({
    stagesMs: z.partialRecord(PipelineStageSchema, z.number()),
    generationLatencyMs: z.number().nullable(),
    processingMs: z.number().nullable(),
    totalMs: z.number().nullable(),
  }),
  cost: z.object({ credits: z.number().nullable(), unit: z.string() }),
  content: z
    .object({
      raw: z.record(z.string(), z.number()),
      corrected: z.record(z.string(), z.number()).nullable(),
      extensionsUsed: z.array(z.string()),
    })
    .nullable(),
  warnings: z.array(z.string()),
  errors: z.array(PipelineErrorRecordSchema),
  startedAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
});

export type AssetRef = z.infer<typeof AssetRefSchema>;
export type RawAssetRef = z.infer<typeof RawAssetRefSchema>;
export type ProviderProvenance = z.infer<typeof ProviderProvenanceSchema>;
export type PipelineVersion = z.infer<typeof PipelineVersionSchema>;
export type RunManifest = z.infer<typeof RunManifestSchema>;
