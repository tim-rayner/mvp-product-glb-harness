const BASE_URL = "https://api.meshy.ai/openapi/v1";

export type MeshyTaskStatus = "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";

/** Multi-image-to-3D accepts 1–4 views of the same object. */
export const MESHY_MAX_IMAGES = 4;

const TERMINAL_STATUSES: ReadonlySet<MeshyTaskStatus> = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);

export interface MultiImageTo3dSettings {
  ai_model: "meshy-6-lite" | "meshy-6" | "meshy-7.1";
  should_remesh: boolean;
  should_texture: boolean;
  enable_pbr: boolean;
  target_formats: Array<"glb" | "obj" | "fbx" | "stl" | "usdz" | "3mf">;
}

export interface MeshyTask {
  id: string;
  status: MeshyTaskStatus;
  progress: number;
  model_urls?: { glb?: string };
  task_error?: { message?: string };
  consumed_credits?: number;
  created_at: number;
  started_at: number;
  finished_at: number;
}

export class MeshyTimeoutError extends Error {
  constructor(
    readonly taskId: string,
    readonly lastTask: MeshyTask,
    timeoutMs: number,
  ) {
    super(`Timed out after ${timeoutMs / 1000}s waiting for task ${taskId} (last status ${lastTask.status})`);
  }
}

/** `fetch` and `sleep` are injectable for tests. */
export interface MeshyClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<unknown>;
}

export type MeshyClient = ReturnType<typeof createMeshyClient>;

/** Thin Meshy REST client. The API key is passed in, never read from the environment here. */
export function createMeshyClient({ apiKey, fetch = globalThis.fetch, sleep = Bun.sleep }: MeshyClientOptions) {
  async function meshyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Meshy ${init.method ?? "GET"} ${path} failed (${response.status}): ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  }

  async function createMultiImageTo3dTask(imageUrls: string[], settings: MultiImageTo3dSettings): Promise<string> {
    const { result } = await meshyFetch<{ result: string }>("/multi-image-to-3d", {
      method: "POST",
      body: JSON.stringify({ image_urls: imageUrls, ...settings }),
    });
    return result;
  }

  function getMultiImageTo3dTask(taskId: string): Promise<MeshyTask> {
    return meshyFetch<MeshyTask>(`/multi-image-to-3d/${taskId}`);
  }

  async function waitForTask(
    taskId: string,
    { intervalMs, timeoutMs }: { intervalMs: number; timeoutMs: number },
    onProgress: (task: MeshyTask) => void = (task) => console.log(`[meshy] ${task.status} ${task.progress}%`),
  ): Promise<MeshyTask> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const task = await getMultiImageTo3dTask(taskId);
      onProgress(task);
      if (TERMINAL_STATUSES.has(task.status)) return task;
      if (Date.now() > deadline) throw new MeshyTimeoutError(taskId, task, timeoutMs);
      await sleep(intervalMs);
    }
  }

  /** Downloads an asset byte-for-byte. Model URLs are pre-signed, so no auth header is sent. */
  async function downloadBytes(url: string): Promise<Uint8Array> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed (${response.status}): ${new URL(url).pathname}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  return { createMultiImageTo3dTask, getMultiImageTo3dTask, waitForTask, downloadBytes };
}
