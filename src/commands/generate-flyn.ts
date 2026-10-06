import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { flynCotbed } from "../mocks/flyn-cotbed";
import {
  createMultiImageTo3dTask,
  downloadFile,
  waitForTask,
  type MeshyTask,
  type MultiImageTo3dSettings,
} from "../meshy";

// Only the clean cot-mode packshot. The others are lifestyle crops, an infographic,
// a different mattress height, or toddler-bed mode (different geometry).
const sourceImages = [flynCotbed.images[3]!];

const settings: MultiImageTo3dSettings = {
  ai_model: "meshy-6",
  should_remesh: false,
  should_texture: true,
  enable_pbr: false,
  target_formats: ["glb"],
};

const POLL = { intervalMs: 10_000, timeoutMs: 20 * 60_000 };
const OUTPUT_FILENAME = "raw.glb";
const providerDir = path.join("output", "flyn-cotbed", "meshy");

async function nextAttemptNumber(dir: string): Promise<number> {
  const entries = await readdir(dir).catch(() => []);
  const attempts = entries.map((name) => Number(/^attempt-(\d+)$/.exec(name)?.[1] ?? 0));
  return Math.max(0, ...attempts) + 1;
}

const attempt = await nextAttemptNumber(providerDir);
const attemptDir = path.join(providerDir, `attempt-${attempt}`);
await mkdir(attemptDir, { recursive: true });

const submittedAt = new Date();
let taskId: string | undefined;
let task: MeshyTask | undefined;
let latencyMs: number | undefined;
let error: string | undefined;

try {
  taskId = await createMultiImageTo3dTask(sourceImages, settings);
  console.log(`[meshy] submitted task ${taskId} (attempt ${attempt})`);

  task = await waitForTask(taskId, POLL);
  latencyMs = Date.now() - submittedAt.getTime();

  if (task.status !== "SUCCEEDED") {
    throw new Error(`Task ${task.status}: ${task.task_error?.message || "no error message from Meshy"}`);
  }
  if (!task.model_urls?.glb) {
    throw new Error("Task succeeded but returned no GLB URL");
  }
  await downloadFile(task.model_urls.glb, path.join(attemptDir, OUTPUT_FILENAME));
} catch (e) {
  error = e instanceof Error ? e.message : String(e);
}

const generation = {
  product: { id: flynCotbed.productId, title: flynCotbed.title, sku: flynCotbed.sku },
  provider: "meshy",
  endpoint: "multi-image-to-3d",
  model: settings.ai_model,
  taskId: taskId ?? null,
  submittedAt: submittedAt.toISOString(),
  sourceImages,
  settings,
  latencyMs: latencyMs ?? null,
  providerTimings: task
    ? { createdAt: task.created_at, startedAt: task.started_at, finishedAt: task.finished_at }
    : null,
  creditsConsumed: task?.consumed_credits ?? null,
  attempt,
  outputFile: error ? null : OUTPUT_FILENAME,
  status: error ? "failed" : "succeeded",
  error: error ?? null,
};

const generationPath = path.join(attemptDir, "generation.json");
await Bun.write(generationPath, JSON.stringify(generation, null, 2));

if (error) {
  console.error(`[meshy] failed: ${error}\nMetadata: ${generationPath}`);
  process.exit(1);
}
console.log(`[meshy] done in ${(latencyMs! / 1000).toFixed(1)}s → ${path.join(attemptDir, OUTPUT_FILENAME)}`);
