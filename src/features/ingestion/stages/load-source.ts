import { AxisMappingSchema, type AxisMapping } from "../../../shared/geometry/dimensions";
import { PipelineConfigSchema, type PipelineConfig, type PipelineConfigInput } from "../schemas";
import { SpatialProductSourceSchema, type SpatialProductSource } from "../../products/product";
import { MESHY_MAX_IMAGES } from "../../generation/meshy-client";
import { sha256 } from "../../../shared/utils/files";
import { StageFailure } from "../errors";
import type { StageContext } from "../types";

export interface LoadedSource {
  source: SpatialProductSource;
  config: PipelineConfig;
  axisMapping: AxisMapping;
}

/** Profile benchmark images must be 1–4 distinct views, all present in the source record. */
function assertBenchmarkImages(benchmarkImages: string[], sourceImages: string[]) {
  if (benchmarkImages.length === 0) {
    throw new StageFailure("INVALID_SOURCE", "Profile lists no benchmark images");
  }
  if (benchmarkImages.length > MESHY_MAX_IMAGES) {
    throw new StageFailure("INVALID_SOURCE", `Profile lists ${benchmarkImages.length} benchmark images; Meshy accepts at most ${MESHY_MAX_IMAGES}`);
  }
  if (new Set(benchmarkImages).size !== benchmarkImages.length) {
    throw new StageFailure("INVALID_SOURCE", "Profile lists the same benchmark image more than once");
  }
  const notInSource = benchmarkImages.filter((url) => !sourceImages.includes(url));
  if (notInSource.length > 0) {
    throw new StageFailure("INVALID_SOURCE", `Benchmark images missing from the source record: ${notInSource.join(", ")}`);
  }
}

/** Validates the product source, axis mapping and pipeline config, and records them in the manifest. */
export function loadSource({ manifest, profile }: StageContext, configInput: PipelineConfigInput = {}): LoadedSource {
  const parsed = SpatialProductSourceSchema.safeParse(profile.source);
  if (!parsed.success) {
    throw new StageFailure("INVALID_SOURCE", `Product source is invalid: ${parsed.error.message}`);
  }
  assertBenchmarkImages(profile.benchmarkImages, parsed.data.images);

  const mapping = AxisMappingSchema.safeParse(profile.axisMapping);
  if (!mapping.success) throw new StageFailure("INVALID_SOURCE", `Invalid axis mapping: ${mapping.error.message}`);
  const config = PipelineConfigSchema.safeParse(configInput);
  if (!config.success) throw new StageFailure("INVALID_CONFIG", `Invalid pipeline config: ${config.error.message}`);

  const source = parsed.data;
  manifest.authoritativeDimensionsMm = source.dimensions;
  manifest.axisMapping = mapping.data;
  manifest.provenance.config = config.data;
  manifest.provenance.source.sha256 = sha256(new TextEncoder().encode(JSON.stringify(source)));
  return { source, config: config.data, axisMapping: mapping.data };
}

export const describeLoadedSource = ({ source }: LoadedSource) =>
  `${source.title} ${source.dimensions.width}×${source.dimensions.depth}×${source.dimensions.height} mm (W×D×H)`;
