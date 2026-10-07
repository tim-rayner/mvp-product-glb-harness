import type { PipelineErrorCode, PipelineStage } from "./schemas";
import { InvalidGeometryError } from "./analysis/proportions";
import { ProviderError } from "../generation/types";
import { errorMessage } from "../../shared/utils/errors";

/** Stops the run at the current stage with a specific code. */
export class StageFailure extends Error {
  constructor(
    readonly code: PipelineErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Thrown internally once the run has been recorded as stopped. */
export class Halt extends Error {}

/** Code recorded when a stage throws something that isn't already a typed failure. */
export const DEFAULT_ERROR_CODE: Record<PipelineStage, PipelineErrorCode> = {
  "load-source": "INVALID_SOURCE",
  "acquire-raw": "RAW_ASSET_UNAVAILABLE",
  "persist-raw": "RAW_ASSET_UNAVAILABLE",
  "inspect-raw": "GLB_PARSE_FAILED",
  "proportional-check": "PROPORTIONAL_FAIL",
  correct: "CORRECTION_FAILED",
  export: "EXPORT_FAILED",
  validate: "CORRECTED_PARSE_FAILED",
  "persist-provenance": "EXPORT_FAILED",
  "expose-viewer": "EXPORT_FAILED",
};

/** Maps anything a stage throws onto a typed StageFailure. */
export function toStageFailure(stage: PipelineStage, e: unknown): StageFailure {
  if (e instanceof StageFailure) return e;
  if (e instanceof ProviderError) return new StageFailure(e.code, e.message, { jobId: e.job.jobId });
  if (e instanceof InvalidGeometryError) return new StageFailure("INVALID_GEOMETRY", e.message, { kind: e.kind });
  return new StageFailure(DEFAULT_ERROR_CODE[stage], errorMessage(e));
}
