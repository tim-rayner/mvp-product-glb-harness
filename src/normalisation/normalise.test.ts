import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { flynCotbed } from "../mocks/flyn-cotbed";
import { NORMALISATION_NODE_NAME } from "./gltf";
import { normaliseGlb, UnsafeGlbError } from "./normalise";

const dir = await mkdtemp(path.join(tmpdir(), "normalise-test-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

const io = new NodeIO();
const yUp = { width: "x", height: "y", depth: "z" } as const;

/** Unit cube mesh (8 corners) under a node with the given transform. */
function cubeDocument(transform: { rotation?: [number, number, number, number]; scale?: [number, number, number] } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const corners = new Float32Array(
    [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].flatMap((z) => [x - 0.5, y - 0.5, z - 0.5]))),
  );
  const position = doc.createAccessor().setType("VEC3").setArray(corners).setBuffer(buffer);
  const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute("POSITION", position));
  const node = doc.createNode("cube").setMesh(mesh);
  if (transform.rotation) node.setRotation(transform.rotation);
  if (transform.scale) node.setScale(transform.scale);
  doc.createScene().addChild(doc.createNode("root").addChild(node));
  return { doc, node };
}

async function writeFixture(name: string, doc: Document) {
  const file = path.join(dir, name);
  await io.write(file, doc);
  return file;
}

describe("normaliseGlb", () => {
  test("re-measured output matches the target on every semantic axis", async () => {
    const input = await writeFixture("box.glb", cubeDocument({ scale: [2, 3, 4] }).doc);
    const output = path.join(dir, "box-corrected.glb");
    const report = await normaliseGlb({
      inputPath: input,
      outputPath: output,
      target: { width: 1200, depth: 600, height: 900 },
      axisMapping: yUp,
    });

    expect(report.validation.numerical).toBe("PASS");
    expect(report.corrected.semantic.width).toBeCloseTo(1.2, 6);
    expect(report.corrected.semantic.depth).toBeCloseTo(0.6, 6);
    expect(report.corrected.semantic.height).toBeCloseTo(0.9, 6);
    expect(report.input.unchanged).toBe(true);

    const reloaded = await io.read(output);
    expect(reloaded.getRoot().listScenes()[0]!.listChildren().map((n) => n.getName())).toEqual([NORMALISATION_NODE_NAME]);
  });

  test("scales along world axes even when the mesh node is rotated", async () => {
    // 45° about Y: the world X/Z extents both come from the rotated geometry.
    const s = Math.SQRT1_2;
    const input = await writeFixture("rotated.glb", cubeDocument({ rotation: [0, s, 0, s], scale: [1, 1, 3] }).doc);
    const report = await normaliseGlb({
      inputPath: input,
      outputPath: path.join(dir, "rotated-corrected.glb"),
      target: { width: 1000, depth: 2000, height: 500 },
      axisMapping: yUp,
    });
    expect(report.validation.numerical).toBe("PASS");
  });

  test("refuses to overwrite its input", async () => {
    const input = await writeFixture("same.glb", cubeDocument().doc);
    await expect(
      normaliseGlb({ inputPath: input, outputPath: input, target: { width: 1, depth: 1, height: 1 }, axisMapping: yUp }),
    ).rejects.toThrow(/never overwritten/);
  });

  test("rejects an ambiguous axis mapping", async () => {
    const input = await writeFixture("axes.glb", cubeDocument().doc);
    await expect(
      normaliseGlb({
        inputPath: input,
        outputPath: path.join(dir, "axes-out.glb"),
        target: { width: 1, depth: 1, height: 1 },
        axisMapping: { width: "x", height: "x", depth: "z" },
      }),
    ).rejects.toThrow(/distinct/);
  });

  test.each([
    ["animation", (doc: Document) => doc.createAnimation("spin")],
    ["mirrored transform", (_: Document, node: ReturnType<typeof cubeDocument>["node"]) => node.setScale([-1, 1, 1])],
    ["multiple scenes", (doc: Document) => doc.createScene("second")],
  ] as const)("blocks unsafe structure: %s", async (name, mutate) => {
    const { doc, node } = cubeDocument();
    mutate(doc, node);
    const input = await writeFixture(`unsafe-${name.replace(/\s/g, "-")}.glb`, doc);
    const output = path.join(dir, `unsafe-${name}-out.glb`);
    await expect(
      normaliseGlb({ inputPath: input, outputPath: output, target: { width: 1, depth: 1, height: 1 }, axisMapping: yUp }),
    ).rejects.toBeInstanceOf(UnsafeGlbError);
    expect(await Bun.file(output).exists()).toBe(false);
  });
});

const flynRaw = "output/flyn-cotbed/meshy/attempt-1/raw.glb";

describe.skipIf(!(await Bun.file(flynRaw).exists()))("Flyn Cotbed raw.glb (local benchmark asset)", () => {
  test("normalises to merchant dimensions and flags depth for review", async () => {
    const report = await normaliseGlb({
      inputPath: flynRaw,
      outputPath: path.join(dir, "flyn-corrected.glb"),
      target: flynCotbed.dimensions,
      axisMapping: yUp,
    });
    expect(report.validation.numerical).toBe("PASS");
    expect(report.validation.requiresHumanReview).toBe(true);
    expect(report.correction.type).toBe("non-uniform");
    expect(report.input.unchanged).toBe(true);
  });
});
