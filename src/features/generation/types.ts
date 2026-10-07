export type ProviderErrorCode =
  | "PROVIDER_SUBMISSION_FAILED"
  | "PROVIDER_GENERATION_FAILED"
  | "PROVIDER_JOB_INCOMPLETE"
  | "DOWNLOAD_FAILED";

/**
 * What is known about one provider job. `latencyMs` runs from submission to asset downloaded;
 * `providerTimings` are the provider's own timestamps (epoch ms), when it reports them.
 */
export interface ProviderJob {
  jobId: string | null;
  submittedAt: string;
  completedAt: string | null;
  latencyMs: number | null;
  credits: number | null;
  providerTimings: { createdAt: number; startedAt: number; finishedAt: number } | null;
}

/** A provider failure, carrying whatever job metadata exists so provenance is never lost. */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly job: ProviderJob,
  ) {
    super(message);
  }
}

export interface GenerationRequest {
  productId: string;
  imageUrls: string[];
  attempt: number;
}

/** `glb` is the provider's GLB, exactly as downloaded. */
export interface GenerationResult {
  glb: Uint8Array;
  job: ProviderJob;
}

/**
 * Provider boundary for 3D generation. Orchestration only ever talks to this interface, so a fake
 * provider can stand in for a paid one in tests.
 */
export interface GenerationProvider {
  readonly name: string;
  readonly endpoint: string;
  readonly model: string;
  readonly options: Record<string, unknown>;
  generate(request: GenerationRequest, onProgress?: (message: string) => void): Promise<GenerationResult>;
}
