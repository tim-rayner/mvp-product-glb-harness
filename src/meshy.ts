import { env } from "./env";

const BASE_URL = "https://api.meshy.ai/openapi/v1";

export type MeshyTaskStatus = "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";

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

async function meshyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.MESHY_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Meshy ${init.method ?? "GET"} ${path} failed (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export async function createMultiImageTo3dTask(
  imageUrls: string[],
  settings: MultiImageTo3dSettings,
): Promise<string> {
  const { result } = await meshyFetch<{ result: string }>("/multi-image-to-3d", {
    method: "POST",
    body: JSON.stringify({ image_urls: imageUrls, ...settings }),
  });
  return result;
}

export function getMultiImageTo3dTask(taskId: string): Promise<MeshyTask> {
  return meshyFetch<MeshyTask>(`/multi-image-to-3d/${taskId}`);
}

export async function waitForTask(
  taskId: string,
  { intervalMs, timeoutMs }: { intervalMs: number; timeoutMs: number },
): Promise<MeshyTask> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const task = await getMultiImageTo3dTask(taskId);
    console.log(`[meshy] ${task.status} ${task.progress}%`);
    if (TERMINAL_STATUSES.has(task.status)) return task;
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs / 1000}s waiting for task ${taskId} (last status ${task.status})`);
    }
    await Bun.sleep(intervalMs);
  }
}

export async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  await Bun.write(destination, response);
}
