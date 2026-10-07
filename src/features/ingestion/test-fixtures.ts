import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { Document } from "@gltf-transform/core";
import { flynCotbed } from "../products/mocks/flyn-cotbed";
import { createGltfIO } from "../../shared/geometry/gltf";
import type { IngestionProfile } from "../products/profiles";
import type { Vec3 } from "../../shared/geometry/bounds";
import { ProviderError, type GenerationProvider, type GenerationRequest, type GenerationResult, type ProviderErrorCode } from "../generation/types";

/** Valid 1×1 opaque PNG built at runtime (correct CRCs), so fixtures carry a real decodable texture. */
const PNG_1X1 = (() => {
  const chunk = (type: string, data: Uint8Array) => {
    const body = new Uint8Array([...new TextEncoder().encode(type), ...data]);
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(body, 4);
    view.setUint32(8 + data.length, zlib.crc32(body));
    return out;
  };
  const ihdr1x1Rgb8 = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const filterByteAndOnePixel = new Uint8Array([0, 0xf2, 0xf2, 0xee]);
  const idat = zlib.deflateSync(filterByteAndOnePixel);
  return new Uint8Array([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...chunk("IHDR", ihdr1x1Rgb8),
    ...chunk("IDAT", idat),
    ...chunk("IEND", new Uint8Array()),
  ]);
})();

function boxPositions(size: Vec3, centre: Vec3 = [0, 0, 0]): Float32Array<ArrayBuffer> {
  const out: number[] = [];
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
    out.push(centre[0] + x * size[0], centre[1] + y * size[1], centre[2] + z * size[2]);
  }
  return new Float32Array(out);
}

/** Twelve triangles over the eight corners from boxPositions (index = x*4 + y*2 + z). */
const BOX_INDICES = new Uint16Array([
  0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3,
]);

/**
 * Options for a small, deterministic GLB fixture. Nothing here touches a paid provider.
 *
 * - `extents` / `centre`: world-space size and centre of the whole asset in raw units; the default
 *   centre is off the ground, so raw assets aren't conveniently grounded.
 * - `rotatedRoot`: rotate the root 90° about Y. Extents stay world-space because the body is built
 *   pre-swapped (a 90° Y rotation maps local (x, z) to world (z, x)).
 * - `textured`: embed a textured material. Three.js can't decode images under Bun, so turn this off
 *   for loader tests.
 */
export interface FixtureOptions {
  extents: Vec3;
  centre?: Vec3;
  rotatedRoot?: boolean;
  textured?: boolean;
}

/**
 * A "product": a body box filling `extents`, plus a second mesh (a leg) nested two levels deep
 * under a rotated, translated node, fully inside the body so it never changes the bounds.
 */
export function productDocument({ extents, centre = [0, 0.1, 0], rotatedRoot = false, textured = true }: FixtureOptions): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const material = doc.createMaterial("finish").setBaseColorFactor([0.95, 0.95, 0.93, 1]);
  if (textured) {
    material.setBaseColorTexture(doc.createTexture("albedo").setMimeType("image/png").setImage(PNG_1X1));
  }

  const primitive = (positions: Float32Array<ArrayBuffer>) => {
    const uv = new Float32Array(16).fill(0.5);
    return doc
      .createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer))
      .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(uv).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(BOX_INDICES).setBuffer(buffer))
      .setMaterial(material);
  };

  const bodySize: Vec3 = rotatedRoot ? [extents[2], extents[1], extents[0]] : extents;
  const bodyCentre: Vec3 = rotatedRoot ? [-centre[2], centre[1], centre[0]] : centre;
  const body = doc.createNode("body").setMesh(doc.createMesh("body").addPrimitive(primitive(boxPositions(bodySize, bodyCentre))));

  const s = Math.SQRT1_2;
  const smallest = Math.min(...extents) * 0.2;
  const leg = doc.createNode("leg").setMesh(doc.createMesh("leg").addPrimitive(primitive(boxPositions([smallest, smallest, smallest]))));
  const legPivot = doc.createNode("leg-pivot").setRotation([0, s, 0, s]).setTranslation(bodyCentre).addChild(leg);
  body.addChild(legPivot);

  const root = doc.createNode("root").addChild(body);
  if (rotatedRoot) root.setRotation([0, s, 0, s]);
  root.addChild(doc.createNode("empty-marker"));
  doc.createScene("scene").addChild(root);
  return doc;
}

export const productGlb = (options: FixtureOptions) => createGltfIO().writeBinary(productDocument(options));

/** Raw extents (glTF x, y, z) proportional to the Flyn Cotbed's authoritative W×H×D. */
export const FLYN_PROPORTIONAL_EXTENTS: Vec3 = [1.463 * 1.3, 0.953 * 1.3, 0.795 * 1.3];
/** The real Meshy attempt-1 raw extents: depth ≈10% too deep for its width, corrected automatically. */
export const FLYN_MESHY_ATTEMPT_1_EXTENTS: Vec3 = [1.899646, 1.267491, 1.135289];
/** Grossly wrong proportions: depth less than half what the width implies → proportional FAIL. */
export const BAD_PROPORTION_EXTENTS: Vec3 = [1.9, 1.24, 0.45];
/** Longest/shortest axis ratio well past `maxRawAspectRatio`: not plausibly a product. */
export const ABSURD_ASPECT_EXTENTS: Vec3 = [1.9, 0.5, 0.01];

export function testProfile(overrides: Partial<IngestionProfile> = {}): IngestionProfile {
  return {
    slug: "flyn-cotbed",
    source: flynCotbed,
    sourceReference: "src/mocks/flyn-cotbed.ts#flynCotbed",
    benchmarkImages: [flynCotbed.images[3]!],
    axisMapping: { width: "x", height: "y", depth: "z" },
    meshy: {
      settings: { ai_model: "meshy-6", should_remesh: false, should_texture: true, enable_pbr: false, target_formats: ["glb"] },
      poll: { intervalMs: 1, timeoutMs: 1000 },
    },
    ...overrides,
  };
}

/** Stands in for Meshy: returns given bytes, or fails with a given provider error code. */
export class FakeProvider implements GenerationProvider {
  readonly name = "fake";
  readonly endpoint = "fake-image-to-3d";
  readonly model = "fake-1";
  readonly options = { quality: "test" };
  readonly requests: GenerationRequest[] = [];

  constructor(private readonly behaviour: { glb: Uint8Array } | { fail: ProviderErrorCode }) {}

  get calls() {
    return this.requests.length;
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    this.requests.push(request);
    const job = {
      jobId: `fake-job-${this.calls}`,
      submittedAt: "2026-10-07T00:00:00.000Z",
      completedAt: null as string | null,
      latencyMs: null as number | null,
      credits: 7,
      providerTimings: null,
    };
    if ("fail" in this.behaviour) throw new ProviderError(this.behaviour.fail, `fake ${this.behaviour.fail}`, job);
    return { glb: this.behaviour.glb, job: { ...job, completedAt: "2026-10-07T00:00:01.500Z", latencyMs: 1500 } };
  }
}

export async function tempDir(prefix: string) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
