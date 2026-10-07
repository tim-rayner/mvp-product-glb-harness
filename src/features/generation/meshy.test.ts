import { describe, expect, test } from "bun:test";
import { createMeshyClient, type MeshyTask, type MultiImageTo3dSettings } from "./meshy-client";
import { createMeshyProvider, MeshyProvider } from "./meshy";
import { ProviderError } from "./types";

const API_KEY = "msy-secret-test-key";
const settings: MultiImageTo3dSettings = { ai_model: "meshy-6", should_remesh: false, should_texture: true, enable_pbr: false, target_formats: ["glb"] };
const request = { productId: "flyn-cot-bed-white", imageUrls: ["https://example.com/a.jpg"], attempt: 3 };
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 1, 2, 3, 4]);

const task = (overrides: Partial<MeshyTask>): MeshyTask => ({
  id: "task-1",
  status: "SUCCEEDED",
  progress: 100,
  model_urls: { glb: "https://assets.meshy.ai/task-1/model.glb?Expires=1" },
  consumed_credits: 30,
  created_at: 1,
  started_at: 2,
  finished_at: 3,
  ...overrides,
});

/** Scripted Meshy API: POST returns a task id; each GET returns the next task state. */
function provider(script: { submit?: Response; polls?: MeshyTask[]; download?: Response; timeoutMs?: number }) {
  const polls = [...(script.polls ?? [task({})])];
  const seen: Request[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    seen.push(req);
    if (req.method === "POST") return script.submit ?? Response.json({ result: "task-1" });
    if (req.url.startsWith("https://assets.meshy.ai/")) return script.download ?? new Response(GLB);
    return Response.json(polls.length > 1 ? polls.shift() : polls[0]);
  }) as typeof globalThis.fetch;
  const client = createMeshyClient({ apiKey: API_KEY, fetch, sleep: async () => {} });
  return { seen, provider: new MeshyProvider(client, { settings, poll: { intervalMs: 0, timeoutMs: script.timeoutMs ?? 60_000 } }) };
}

async function failure(p: MeshyProvider): Promise<ProviderError> {
  try {
    await p.generate(request);
  } catch (e) {
    if (e instanceof ProviderError) return e;
    throw e;
  }
  throw new Error("expected a ProviderError");
}

describe("MeshyProvider", () => {
  test("submits the benchmark images, polls to completion and returns the GLB byte-for-byte", async () => {
    const { provider: p, seen } = provider({ polls: [task({ status: "IN_PROGRESS", progress: 40 }), task({})] });
    const progress: string[] = [];
    const result = await p.generate(request, (m) => progress.push(m));

    expect(result.glb).toEqual(GLB);
    expect(result.job).toMatchObject({ jobId: "task-1", credits: 30, providerTimings: { createdAt: 1, startedAt: 2, finishedAt: 3 } });
    expect(result.job.latencyMs).toBeGreaterThanOrEqual(0);
    expect(progress).toEqual(["submitted Meshy task task-1 (attempt 3)", "Meshy IN_PROGRESS 40%", "Meshy SUCCEEDED 100%"]);

    const submit = seen.find((r) => r.method === "POST")!;
    expect(await submit.json()).toEqual({ image_urls: request.imageUrls, ...settings });
    expect(submit.headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
    // The pre-signed asset download carries no credentials.
    expect(seen.find((r) => r.url.startsWith("https://assets.meshy.ai/"))!.headers.get("authorization")).toBeNull();
    expect(p.model).toBe("meshy-6");
  });

  test("submits every image, in order, in one task", async () => {
    const imageUrls = ["https://example.com/front.jpg", "https://example.com/side.jpg", "https://example.com/top.jpg"];
    const { provider: p, seen } = provider({});
    await p.generate({ ...request, imageUrls });

    const submits = seen.filter((r) => r.method === "POST");
    expect(submits).toHaveLength(1);
    expect((await submits[0]!.json()).image_urls).toEqual(imageUrls);
  });

  test("submission errors", async () => {
    const e = await failure(provider({ submit: new Response("bad key", { status: 401 }) }).provider);
    expect(e.code).toBe("PROVIDER_SUBMISSION_FAILED");
    expect(e.job.jobId).toBeNull();
    expect(e.message).not.toContain(API_KEY);
  });

  test("failed generation keeps job id and credits", async () => {
    const e = await failure(provider({ polls: [task({ status: "FAILED", task_error: { message: "no object found" }, consumed_credits: 5 })] }).provider);
    expect(e.code).toBe("PROVIDER_GENERATION_FAILED");
    expect(e.message).toContain("no object found");
    expect(e.job).toMatchObject({ jobId: "task-1", credits: 5 });
  });

  test("canceled, timed-out or URL-less jobs are incomplete", async () => {
    expect((await failure(provider({ polls: [task({ status: "CANCELED" })] }).provider)).code).toBe("PROVIDER_GENERATION_FAILED");
    expect((await failure(provider({ polls: [task({ status: "IN_PROGRESS" })], timeoutMs: -1 }).provider)).code).toBe("PROVIDER_JOB_INCOMPLETE");
    expect((await failure(provider({ polls: [task({ model_urls: {} })] }).provider)).code).toBe("PROVIDER_JOB_INCOMPLETE");
  });

  test("download failures", async () => {
    const e = await failure(provider({ download: new Response("gone", { status: 403 }) }).provider);
    expect(e.code).toBe("DOWNLOAD_FAILED");
    expect(e.message).not.toContain("Expires"); // signed query string isn't echoed
  });

  test("missing API key is an actionable configuration error", () => {
    expect(() => createMeshyProvider(undefined, { settings, poll: { intervalMs: 1, timeoutMs: 1 } })).toThrow(/MESHY_API_KEY is not set/);
  });
});
