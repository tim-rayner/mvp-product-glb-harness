import { AxisMappingSchema, DimensionsMmSchema } from "../../shared/geometry/dimensions";
import { MANIFEST_SCHEMA_VERSION, PipelineConfigSchema, type PipelineVersion, type RunManifest } from "./schemas";
import { CANONICAL_AXIS_MAPPING } from "./analysis/transform";
import type { IngestionProfile } from "../products/profiles";

/**
 * The manifest as it stands before any stage has run. Fields that come from the profile are filled
 * best-effort here, so a run that fails source validation still records what it was given.
 */
export function createInitialManifest(
  profile: IngestionProfile,
  runId: string,
  startedAt: Date,
  pipeline: PipelineVersion,
): RunManifest {
  const dimensions = DimensionsMmSchema.safeParse(profile.source?.dimensions);
  const mapping = AxisMappingSchema.safeParse(profile.axisMapping);
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    runId,
    productId: profile.source?.productId ?? profile.slug,
    sku: profile.source?.sku ?? null,
    title: profile.source?.title ?? profile.slug,
    status: "RUNNING",
    currentStage: null,
    completedStages: [],
    attempt: null,
    rawAsset: null,
    correctedAsset: null,
    authoritativeDimensionsMm: dimensions.success ? dimensions.data : null,
    axisMapping: mapping.success ? mapping.data : CANONICAL_AXIS_MAPPING,
    rawMeasurements: null,
    rawProportions: null,
    proportionalCheck: null,
    correction: null,
    correctedMeasurements: null,
    dimensionalValidation: null,
    provenance: {
      source: {
        reference: profile.sourceReference,
        sha256: "",
        sourceUrl: profile.source?.sourceUrl ?? "",
        dimensionSource: profile.source?.dimensionSource ?? "",
        dimensionConfidence: profile.source?.dimensionConfidence ?? "",
        benchmarkImages: profile.benchmarkImages,
      },
      provider: null,
      pipeline,
      config: PipelineConfigSchema.parse({}),
    },
    timings: { stagesMs: {}, generationLatencyMs: null, processingMs: null, totalMs: null },
    cost: { credits: null, unit: "provider credits" },
    content: null,
    warnings: [],
    errors: [],
    startedAt: startedAt.toISOString(),
    updatedAt: startedAt.toISOString(),
    finishedAt: null,
  };
}
