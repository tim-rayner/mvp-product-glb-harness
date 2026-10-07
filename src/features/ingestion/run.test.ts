import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document, getBounds, NodeIO } from "@gltf-transform/core";
import { Box3, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { flynCotbed } from "../products/mocks/flyn-cotbed";
import { createGltfIO } from "../../shared/geometry/gltf";
import { RunManifestSchema } from "./schemas";
import {
  ABSURD_ASPECT_EXTENTS,
  BAD_PROPORTION_EXTENTS,
  FakeProvider,
  FLYN_MESHY_ATTEMPT_1_EXTENTS,
  FLYN_PROPORTIONAL_EXTENTS,
  productGlb,
  tempDir,
  testProfile,
} from "./test-fixtures";
import { exists, sha256, sha256File } from "../../shared/utils/files";
import { runIngestionPipeline, type IngestOptions } from "./run";
import { readLatestRunId, readManifest, RunIdCollisionError } from "./storage/store";

let root: string;
let cleanup: () => Promise<void>;
let fixtures: string;
const codeVersion = { codeVersion: "test", gitCommit: null, gitDirty: null };

beforeAll(async () => {
  ({ dir: root, cleanup } = await tempDir("ingest-test-"));
  fixtures = path.join(root, "fixtures");
  await Bun.write(path.join(fixtures, "proportional.glb"), await productGlb({ extents: FLYN_PROPORTIONAL_EXTENTS }));
  await Bun.write(path.join(fixtures, "attempt-1-shape.glb"), await productGlb({ extents: FLYN_MESHY_ATTEMPT_1_EXTENTS, centre: [0.01, 0, -0.02] }));
  await Bun.write(path.join(fixtures, "bad.glb"), await productGlb({ extents: BAD_PROPORTION_EXTENTS }));
  await Bun.write(path.join(fixtures, "absurd.glb"), await productGlb({ extents: ABSURD_ASPECT_EXTENTS }));
  await Bun.write(path.join(fixtures, "rotated-root.glb"), await productGlb({ extents: FLYN_PROPORTIONAL_EXTENTS, rotatedRoot: true }));
  await Bun.write(path.join(fixtures, "garbage.glb"), "definitely not a GLB");
  const empty = new Document();
  empty.createScene().addChild(empty.createNode("nothing"));
  await Bun.write(path.join(fixtures, "empty.glb"), await new NodeIO().writeBinary(empty));
});
afterAll(() => cleanup());

let counter = 0;
const outputRoot = () => path.join(root, `out-${++counter}`);
const fixture = (name: string) => path.join(fixtures, name);

function run(options: Partial<IngestOptions> & Pick<IngestOptions, "raw">) {
  return runIngestionPipeline({ profile: testProfile(), codeVersion, ...options });
}

/** Independent re-measure: plain NodeIO (no shared state with the pipeline), straight from disk. */
async function measureFile(file: string) {
  const doc = await createGltfIO().read(file);
  const { min, max } = getBounds(doc.getRoot().listScenes()[0]!);
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], doc };
}

describe("existing GLB → corrected GLB (PASS path)", () => {
  test("runs every stage, validates the persisted output and awaits visual QA", async () => {
    const out = outputRoot();
    const rawBefore = await sha256File(fixture("proportional.glb"));
    const events: string[] = [];
    const { manifest, runDir } = await run({
      raw: { kind: "existing-file", path: fixture("proportional.glb") },
      outputRoot: out,
      runId: "run-a",
      onEvent: (e) => e.type === "stage-complete" && events.push(e.stage),
    });

    expect(manifest.errors).toEqual([]);
    expect(manifest.status).toBe("COMPLETED");
    expect(manifest.proportionalCheck?.status).toBe("PASS");
    expect(manifest.correction?.type).toBe("uniform");
    expect(manifest.dimensionalValidation?.status).toBe("PASS");
    expect(events).toEqual(["load-source", "acquire-raw", "persist-raw", "inspect-raw", "proportional-check", "correct", "export", "validate", "persist-provenance", "expose-viewer"]);
    expect(manifest.currentStage).toBe("expose-viewer");
    expect(manifest.rawAsset?.origin).toBe("existing-file");
    expect(manifest.provenance.provider).toBeNull();

    // Separate, obviously named corrected file; the raw input is untouched.
    const corrected = path.join(runDir, "corrected.glb");
    expect(manifest.correctedAsset?.path).toEndWith("runs/run-a/corrected.glb");
    expect(await exists(path.join(runDir, "corrected.unvalidated.glb"))).toBe(false);
    expect(await sha256File(fixture("proportional.glb"))).toBe(rawBefore);
    expect(manifest.rawAsset?.sha256).toBe(rawBefore);
    expect(await sha256File(corrected)).toBe(manifest.correctedAsset!.sha256);

    // Re-open independently: authoritative size, grounded, centred, visual data intact.
    const { min, max, size, doc } = await measureFile(corrected);
    expect(size[0]).toBeCloseTo(1.463, 6);
    expect(size[1]).toBeCloseTo(0.953, 6);
    expect(size[2]).toBeCloseTo(0.795, 6);
    expect(min[1]).toBeCloseTo(0, 6);
    expect(min[0] + max[0]).toBeCloseTo(0, 6);
    expect(doc.getRoot().listMeshes()).toHaveLength(2);
    expect(doc.getRoot().listTextures()).toHaveLength(1);
    expect(manifest.content?.corrected).toEqual(manifest.content!.raw);

    // Manifest on disk is the documented schema and matches what was returned.
    const onDisk = await readManifest(out, "flyn-cotbed", "run-a");
    expect(onDisk).toEqual(RunManifestSchema.parse(manifest));
    expect(await readLatestRunId(out, "flyn-cotbed")).toBe("run-a");
    expect(manifest.timings.stagesMs["validate"]).toBeGreaterThan(0);
  });

  test("handles a rotated root and nested transforms", async () => {
    const { manifest, runDir } = await run({ raw: { kind: "existing-file", path: fixture("rotated-root.glb") }, outputRoot: outputRoot() });
    expect(manifest.status).toBe("COMPLETED");
    const { size } = await measureFile(path.join(runDir, "corrected.glb"));
    expect(size[0]).toBeCloseTo(1.463, 6);
    expect(size[2]).toBeCloseTo(0.795, 6);
  });

  test("a Z-up asset is rotated into canonical orientation", async () => {
    const out = outputRoot();
    const zUpFile = path.join(fixtures, "z-up.glb");
    // Height on z, depth on y.
    await Bun.write(zUpFile, await productGlb({ extents: [1.463, 0.795, 0.953] }));
    const { manifest, runDir } = await run({
      profile: testProfile({ axisMapping: { width: "x", depth: "y", height: "z" } }),
      raw: { kind: "existing-file", path: zUpFile },
      outputRoot: out,
    });
    expect(manifest.status).toBe("COMPLETED");
    expect(manifest.correction?.depthAxisFlipped).toBe(true);
    const { size, min } = await measureFile(path.join(runDir, "corrected.glb"));
    expect(size[1]).toBeCloseTo(0.953, 6); // height now on +Y
    expect(min[1]).toBeCloseTo(0, 6);
  });

  test("reruns never touch the raw asset, never collide, and are byte-deterministic", async () => {
    const out = outputRoot();
    const rawBefore = await sha256File(fixture("proportional.glb"));
    const first = await run({ raw: { kind: "existing-file", path: fixture("proportional.glb") }, outputRoot: out, runId: "first" });
    const second = await run({ raw: { kind: "existing-file", path: fixture("proportional.glb") }, outputRoot: out, runId: "second" });
    expect(second.runDir).not.toBe(first.runDir);
    expect(await sha256File(fixture("proportional.glb"))).toBe(rawBefore);
    expect(second.manifest.correctedAsset!.sha256).toBe(first.manifest.correctedAsset!.sha256);
    expect(await readLatestRunId(out, "flyn-cotbed")).toBe("second");

    await expect(run({ raw: { kind: "existing-file", path: fixture("proportional.glb") }, outputRoot: out, runId: "first" })).rejects.toBeInstanceOf(RunIdCollisionError);
    // The collision left the original run intact.
    expect((await readManifest(out, "flyn-cotbed", "first")).status).toBe("COMPLETED");
  });

  test("the corrected GLB loads in Three.js at true scale: 1,000 mm = 1 world unit", async () => {
    const out = outputRoot();
    const cube = path.join(fixtures, "cube.glb");
    await Bun.write(cube, await productGlb({ extents: [3, 3, 3], textured: false }));
    const source = { ...flynCotbed, dimensions: { width: 1000, depth: 1000, height: 1000 } };
    const { manifest, runDir } = await run({ profile: testProfile({ source }), raw: { kind: "existing-file", path: cube }, outputRoot: out });
    expect(manifest.status).toBe("COMPLETED");

    const bytes = await Bun.file(path.join(runDir, "corrected.glb")).arrayBuffer();
    const gltf = await new GLTFLoader().parseAsync(bytes, "");
    const box = new Box3().setFromObject(gltf.scene, true);
    const size = box.getSize(new Vector3());
    expect(size.x).toBeCloseTo(1, 6);
    expect(size.y).toBeCloseTo(1, 6);
    expect(size.z).toBeCloseTo(1, 6);
    expect(box.min.y).toBeCloseTo(0, 6);
  });
});

describe("proportional check in the pipeline", () => {
  test("a Flyn-Meshy-shaped asset is measured, corrected non-uniformly and completes without any human step", async () => {
    const out = outputRoot();
    const rawBefore = await sha256File(fixture("attempt-1-shape.glb"));
    const { manifest, runDir } = await run({ raw: { kind: "existing-file", path: fixture("attempt-1-shape.glb") }, outputRoot: out });

    expect(manifest.status).toBe("COMPLETED");
    expect(manifest.errors).toEqual([]);
    expect(manifest.proportionalCheck?.status).toBe("PASS");
    expect(manifest.rawProportions?.proportionalErrorPct.depth).toBeCloseTo(9.98, 2);
    expect(manifest.correction?.type).toBe("non-uniform");
    expect(manifest.warnings.some((w) => w.includes("depth is +9.98%") && w.includes("corrected automatically"))).toBe(true);

    // Correct proportions in the output, measured independently from disk.
    const { size, min } = await measureFile(path.join(runDir, "corrected.glb"));
    expect(size[0]).toBeCloseTo(1.463, 6);
    expect(size[1]).toBeCloseTo(0.953, 6);
    expect(size[2]).toBeCloseTo(0.795, 6);
    expect(min[1]).toBeCloseTo(0, 6);
    expect(await sha256File(fixture("attempt-1-shape.glb"))).toBe(rawBefore);
    expect(await readLatestRunId(out, "flyn-cotbed")).toBe(manifest.runId);
  });

  test("far-off proportions are still corrected, with warnings", async () => {
    const { manifest } = await run({ raw: { kind: "existing-file", path: fixture("bad.glb") }, outputRoot: outputRoot() });
    expect(manifest.status).toBe("COMPLETED");
    expect(manifest.proportionalCheck?.status).toBe("PASS");
    expect(manifest.rawProportions!.scaleSpreadPct).toBeGreaterThan(15);
    expect(manifest.warnings.some((w) => w.includes("corrected automatically"))).toBe(true);
  });

  test("FAIL (absurd geometry) stops before correction", async () => {
    const out = outputRoot();
    const { manifest, runDir } = await run({ raw: { kind: "existing-file", path: fixture("absurd.glb") }, outputRoot: out });
    expect(manifest.status).toBe("FAILED");
    expect(manifest.proportionalCheck?.status).toBe("FAIL");
    expect(manifest.errors.map((e) => e.code)).toEqual(["PROPORTIONAL_FAIL"]);
    expect(manifest.completedStages).not.toContain("correct");
    expect(manifest.correction).toBeNull();
    expect(await exists(path.join(runDir, "corrected.glb"))).toBe(false);
    expect(await exists(path.join(runDir, "corrected.unvalidated.glb"))).toBe(false);
    expect(await readLatestRunId(out, "flyn-cotbed")).toBeNull();
  });
});

describe("failure handling", () => {
  test.each([
    ["garbage.glb", "GLB_PARSE_FAILED"],
    ["empty.glb", "INVALID_GEOMETRY"],
    ["missing.glb", "RAW_ASSET_UNAVAILABLE"],
  ])("%s → %s", async (name, code) => {
    const { manifest } = await run({ raw: { kind: "existing-file", path: fixture(name) }, outputRoot: outputRoot() });
    expect(manifest.status).toBe("FAILED");
    expect(manifest.errors.map((e) => e.code)).toEqual([code as never]);
    expect(manifest.correctedAsset).toBeNull();
  });

  test("invalid source is rejected before anything else happens", async () => {
    const source = { ...flynCotbed, dimensions: { width: -1, depth: 795, height: 953 } };
    const { manifest } = await run({ profile: testProfile({ source }), raw: { kind: "existing-file", path: fixture("proportional.glb") }, outputRoot: outputRoot() });
    expect(manifest.errors.map((e) => e.code)).toEqual(["INVALID_SOURCE"]);
    expect(manifest.completedStages).toEqual([]);
    expect(manifest.authoritativeDimensionsMm).toBeNull();
    // Still a readable, schema-valid failure record.
    expect(RunManifestSchema.safeParse(manifest).success).toBe(true);
  });

  test.each([
    ["more than Meshy's 4 views", flynCotbed.images.slice(0, 5)],
    ["a repeated view", [flynCotbed.images[3]!, flynCotbed.images[3]!]],
  ])("benchmark images with %s are rejected", async (_, benchmarkImages) => {
    const { manifest } = await run({ profile: testProfile({ benchmarkImages }), raw: { kind: "existing-file", path: fixture("proportional.glb") }, outputRoot: outputRoot() });
    expect(manifest.errors.map((e) => e.code)).toEqual(["INVALID_SOURCE"]);
    expect(manifest.completedStages).toEqual([]);
  });

  test("a failed independent validation is loud and leaves nothing that looks successful", async () => {
    const out = outputRoot();
    const { manifest, runDir } = await run({
      raw: { kind: "existing-file", path: fixture("proportional.glb") },
      outputRoot: out,
      config: { dimensionalValidation: { maxPlausibleDimensionMm: 1000 } },
    });
    expect(manifest.status).toBe("FAILED");
    expect(manifest.errors.map((e) => e.code)).toEqual(["DIMENSIONAL_VALIDATION_FAILED"]);
    expect(manifest.dimensionalValidation?.reasonCodes).toEqual(["IMPLAUSIBLE_BOUNDS"]);
    expect(manifest.correctedAsset).toBeNull();
    expect(await exists(path.join(runDir, "corrected.glb"))).toBe(false);
    expect(await exists(path.join(runDir, "corrected.rejected.glb"))).toBe(true);
    expect(await readLatestRunId(out, "flyn-cotbed")).toBeNull();
  });
});

describe("provider path", () => {
  test("generated GLB is persisted byte-for-byte, read-only, with provider provenance", async () => {
    const out = outputRoot();
    const glb = await productGlb({ extents: FLYN_PROPORTIONAL_EXTENTS });
    const provider = new FakeProvider({ glb });
    const { manifest } = await run({ raw: { kind: "generate", provider }, outputRoot: out });

    expect(manifest.status).toBe("COMPLETED");
    expect(manifest.attempt).toBe(1);
    expect(manifest.rawAsset?.origin).toBe("provider-generated");
    const rawFile = path.join(out, "flyn-cotbed", "fake", "attempt-1", "raw.glb");
    expect(await sha256File(rawFile)).toBe(sha256(glb));
    expect((await stat(rawFile)).mode & 0o222).toBe(0); // read-only
    expect(manifest.provenance.provider).toMatchObject({ name: "fake", model: "fake-1", jobId: "fake-job-1", attempt: 1, credits: 7, latencyMs: 1500, reused: false });
    expect(manifest.cost.credits).toBe(7);
    expect(manifest.timings.generationLatencyMs).toBe(1500);

    const record = await Bun.file(path.join(out, "flyn-cotbed", "fake", "attempt-1", "generation.json")).json();
    expect(record).toMatchObject({ status: "succeeded", taskId: "fake-job-1", rawSha256: sha256(glb), outputFile: "raw.glb" });

    // Default path reuses that attempt without calling any provider, and records the reuse.
    const reused = await run({ raw: { kind: "latest-provider-attempt" }, outputRoot: out });
    expect(provider.calls).toBe(1);
    expect(reused.manifest.status).toBe("COMPLETED");
    expect(reused.manifest.rawAsset).toMatchObject({ origin: "existing-provider-attempt", attempt: 1, sha256: sha256(glb) });
    expect(reused.manifest.provenance.provider?.reused).toBe(true);
    expect(reused.manifest.cost.credits).toBe(0);
    expect(reused.manifest.warnings.some((w) => w.includes("no new provider request"))).toBe(true);

    // A second generation is a distinct attempt; attempt 1 is untouched.
    await run({ raw: { kind: "generate", provider: new FakeProvider({ glb: await productGlb({ extents: FLYN_PROPORTIONAL_EXTENTS, centre: [0, 0.3, 0] }) }) }, outputRoot: out });
    expect(await sha256File(rawFile)).toBe(sha256(glb));
    expect(await exists(path.join(out, "flyn-cotbed", "fake", "attempt-2", "raw.glb"))).toBe(true);
  });

  test("every benchmark image goes to the provider, in profile order, and is recorded", async () => {
    const out = outputRoot();
    const benchmarkImages = [flynCotbed.images[3]!, flynCotbed.images[0]!, flynCotbed.images[1]!];
    const provider = new FakeProvider({ glb: await productGlb({ extents: FLYN_PROPORTIONAL_EXTENTS }) });
    const { manifest } = await run({ profile: testProfile({ benchmarkImages }), raw: { kind: "generate", provider }, outputRoot: out });

    expect(manifest.status).toBe("COMPLETED");
    expect(provider.requests.map((r) => r.imageUrls)).toEqual([benchmarkImages]);
    const record = await Bun.file(path.join(out, "flyn-cotbed", "fake", "attempt-1", "generation.json")).json();
    expect(record.sourceImages).toEqual(benchmarkImages);
  });

  test("a raw provider GLB edited after download is detected", async () => {
    const out = outputRoot();
    await run({ raw: { kind: "generate", provider: new FakeProvider({ glb: await productGlb({ extents: FLYN_PROPORTIONAL_EXTENTS }) }) }, outputRoot: out });
    const rawFile = path.join(out, "flyn-cotbed", "fake", "attempt-1", "raw.glb");
    // Simulate someone deliberately overriding the read-only bit and rewriting the file.
    await chmod(rawFile, 0o644);
    await writeFile(rawFile, await productGlb({ extents: [1, 1, 1] }));
    const { manifest } = await run({ raw: { kind: "latest-provider-attempt" }, outputRoot: out });
    expect(manifest.errors.map((e) => e.code)).toEqual(["RAW_ASSET_MUTATED"]);
  });

  test.each(["PROVIDER_SUBMISSION_FAILED", "PROVIDER_GENERATION_FAILED", "PROVIDER_JOB_INCOMPLETE", "DOWNLOAD_FAILED"] as const)(
    "%s is recorded as a typed failure with no raw asset",
    async (code) => {
      const out = outputRoot();
      const { manifest } = await run({ raw: { kind: "generate", provider: new FakeProvider({ fail: code }) }, outputRoot: out });
      expect(manifest.status).toBe("FAILED");
      expect(manifest.errors).toEqual([expect.objectContaining({ code, stage: "acquire-raw" })]);
      expect(manifest.rawAsset).toBeNull();
      expect(manifest.provenance.provider?.jobId).toBe("fake-job-1");
      const attemptDir = path.join(out, "flyn-cotbed", "fake", "attempt-1");
      expect(await exists(path.join(attemptDir, "raw.glb"))).toBe(false);
      expect(await Bun.file(path.join(attemptDir, "generation.json")).json()).toMatchObject({ status: "failed", errorCode: code });
      // A failed attempt is never picked up as a reusable result.
      const reuse = await run({ raw: { kind: "latest-provider-attempt" }, outputRoot: out });
      expect(reuse.manifest.errors.map((e) => e.code)).toEqual(["RAW_ASSET_UNAVAILABLE"]);
    },
  );
});
