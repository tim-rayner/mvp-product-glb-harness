import path from "node:path";
import { env } from "../../../shared/env";
import { fail } from "../../../shared/cli/fail";
import { flynCotbed } from "../../products/mocks/flyn-cotbed";
import { DEFAULT_OUTPUT_ROOT, GENERATION_RECORD_FILENAME, RAW_FILENAME } from "../../ingestion/storage/constants";
import { flynCotbedProfile } from "../../products/profiles";
import { reserveAttemptDir } from "../../ingestion/storage/store";
import { createMeshyClient, type MeshyTask } from "../meshy-client";
import { errorMessage } from "../../../shared/utils/errors";

/**
 * Generation only: one Meshy request for the Flynn cotbed, saved as a new provider attempt.
 * `pnpm ingest:product flyn-cotbed --generate` does this plus the full pipeline.
 */
if (!env.MESHY_API_KEY) fail("MESHY_API_KEY is not set: add it to .env (see .env.example)");
const { createMultiImageTo3dTask, downloadBytes, waitForTask } = createMeshyClient({ apiKey: env.MESHY_API_KEY });

const { benchmarkImages: sourceImages, meshy } = flynCotbedProfile;
const { attempt, dir: attemptDir } = await reserveAttemptDir(DEFAULT_OUTPUT_ROOT, flynCotbedProfile.slug, "meshy");

const submittedAt = new Date();
let taskId: string | undefined;
let task: MeshyTask | undefined;
let latencyMs: number | undefined;
let error: string | undefined;

try {
  taskId = await createMultiImageTo3dTask(sourceImages, meshy.settings);
  console.log(`[meshy] submitted task ${taskId} (attempt ${attempt})`);

  task = await waitForTask(taskId, meshy.poll);
  latencyMs = Date.now() - submittedAt.getTime();

  if (task.status !== "SUCCEEDED") {
    throw new Error(`Task ${task.status}: ${task.task_error?.message || "no error message from Meshy"}`);
  }
  if (!task.model_urls?.glb) {
    throw new Error("Task succeeded but returned no GLB URL");
  }
  await Bun.write(path.join(attemptDir, RAW_FILENAME), await downloadBytes(task.model_urls.glb));
} catch (e) {
  error = errorMessage(e);
}

const generation = {
  product: { id: flynCotbed.productId, title: flynCotbed.title, sku: flynCotbed.sku },
  provider: "meshy",
  endpoint: "multi-image-to-3d",
  model: meshy.settings.ai_model,
  taskId: taskId ?? null,
  submittedAt: submittedAt.toISOString(),
  sourceImages,
  settings: meshy.settings,
  latencyMs: latencyMs ?? null,
  providerTimings: task
    ? { createdAt: task.created_at, startedAt: task.started_at, finishedAt: task.finished_at }
    : null,
  creditsConsumed: task?.consumed_credits ?? null,
  attempt,
  outputFile: error ? null : RAW_FILENAME,
  status: error ? "failed" : "succeeded",
  error: error ?? null,
};

const generationPath = path.join(attemptDir, GENERATION_RECORD_FILENAME);
await Bun.write(generationPath, JSON.stringify(generation, null, 2));

if (error) fail(`[meshy] failed: ${error}\nMetadata: ${generationPath}`);
console.log(`[meshy] done in ${(latencyMs! / 1000).toFixed(1)}s → ${path.join(attemptDir, RAW_FILENAME)}`);
