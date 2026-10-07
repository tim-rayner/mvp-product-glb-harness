import { errorMessage } from "../../shared/utils/errors";
import { createMeshyClient, MeshyTimeoutError, type MeshyClient, type MeshyTask, type MultiImageTo3dSettings } from "./meshy-client";
import { ProviderError, type GenerationProvider, type GenerationRequest, type GenerationResult, type ProviderJob } from "./types";

export interface MeshyProviderOptions {
  settings: MultiImageTo3dSettings;
  poll: { intervalMs: number; timeoutMs: number };
}

/** Meshy multi-image-to-3D behind the GenerationProvider interface. */
export class MeshyProvider implements GenerationProvider {
  readonly name = "meshy";
  readonly endpoint = "multi-image-to-3d";
  readonly model: string;
  readonly options: Record<string, unknown>;

  constructor(
    private readonly client: MeshyClient,
    private readonly config: MeshyProviderOptions,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.model = config.settings.ai_model;
    this.options = { ...config.settings, poll: config.poll };
  }

  async generate(request: GenerationRequest, onProgress: (message: string) => void = () => {}): Promise<GenerationResult> {
    const submitted = this.now();
    const job: ProviderJob = {
      jobId: null,
      submittedAt: submitted.toISOString(),
      completedAt: null,
      latencyMs: null,
      credits: null,
      providerTimings: null,
    };
    const fromTask = (task: MeshyTask) => {
      job.credits = task.consumed_credits ?? null;
      job.providerTimings = { createdAt: task.created_at, startedAt: task.started_at, finishedAt: task.finished_at };
    };

    try {
      job.jobId = await this.client.createMultiImageTo3dTask(request.imageUrls, this.config.settings);
    } catch (e) {
      throw new ProviderError("PROVIDER_SUBMISSION_FAILED", errorMessage(e), job);
    }
    onProgress(`submitted Meshy task ${job.jobId} (attempt ${request.attempt})`);

    let task: MeshyTask;
    try {
      task = await this.client.waitForTask(job.jobId, this.config.poll, (t) => onProgress(`Meshy ${t.status} ${t.progress}%`));
    } catch (e) {
      if (e instanceof MeshyTimeoutError) fromTask(e.lastTask);
      throw new ProviderError("PROVIDER_JOB_INCOMPLETE", errorMessage(e), job);
    }
    fromTask(task);

    if (task.status !== "SUCCEEDED") {
      throw new ProviderError(
        "PROVIDER_GENERATION_FAILED",
        `Task ${task.status}: ${task.task_error?.message || "no error message from Meshy"}`,
        job,
      );
    }
    if (!task.model_urls?.glb) {
      throw new ProviderError("PROVIDER_JOB_INCOMPLETE", "Task succeeded but returned no GLB URL", job);
    }

    let glb: Uint8Array;
    try {
      glb = await this.client.downloadBytes(task.model_urls.glb);
    } catch (e) {
      throw new ProviderError("DOWNLOAD_FAILED", errorMessage(e), job);
    }
    const completed = this.now();
    job.completedAt = completed.toISOString();
    job.latencyMs = completed.getTime() - submitted.getTime();
    return { glb, job };
  }
}

/** Builds the real provider. Fails with an actionable message (and no secret) when unconfigured. */
export function createMeshyProvider(apiKey: string | undefined, options: MeshyProviderOptions): MeshyProvider {
  if (!apiKey) {
    throw new Error("MESHY_API_KEY is not set: add it to .env (see .env.example) to generate with Meshy");
  }
  return new MeshyProvider(createMeshyClient({ apiKey }), options);
}
