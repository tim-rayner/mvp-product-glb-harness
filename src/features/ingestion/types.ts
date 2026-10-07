import type {
  PipelineConfigInput,
  PipelineErrorCode,
  PipelineStage,
  PipelineVersion,
  RunManifest,
} from "./schemas";
import type { GenerationProvider } from "../generation/types";
import type { IngestionProfile } from "../products/profiles";

/**
 * Where the raw GLB comes from: a new (paid) provider request, always in a new attempt directory;
 * the newest succeeded provider attempt already on disk; or a specific GLB file on disk.
 */
export type RawInput =
  | { kind: "generate"; provider: GenerationProvider }
  | { kind: "latest-provider-attempt" }
  | { kind: "existing-file"; path: string };

export type PipelineEvent =
  | { type: "stage-start"; stage: PipelineStage }
  | { type: "stage-complete"; stage: PipelineStage; durationMs: number; summary?: string }
  | { type: "stage-failed"; stage: PipelineStage; code: PipelineErrorCode; message: string }
  | { type: "progress"; stage: PipelineStage; message: string }
  | { type: "warning"; stage: PipelineStage; message: string };

/** `codeVersion` is recorded as provenance.pipeline and defaults to the package version and git state. */
export interface IngestOptions {
  profile: IngestionProfile;
  raw: RawInput;
  outputRoot?: string;
  runId?: string;
  config?: PipelineConfigInput;
  onEvent?: (event: PipelineEvent) => void;
  now?: () => Date;
  codeVersion?: PipelineVersion;
}

export interface PipelineRunResult {
  manifest: RunManifest;
  runDir: string;
  manifestPath: string;
}

/** Shared state every stage reads and records into. */
export interface StageContext {
  manifest: RunManifest;
  profile: IngestionProfile;
  outputRoot: string;
  runDir: string;
  now: () => Date;
  emit: (event: PipelineEvent) => void;
  warn: (stage: PipelineStage, message: string) => void;
}
