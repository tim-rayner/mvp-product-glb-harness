import { getBounds, NodeIO, Primitive, type Document, type Node } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import type { Bounds, Vec3 } from "./bounds";
import {
  GLB_CHUNK_TYPE_JSON,
  GLB_HEADER_BYTES,
  GLB_JSON_CHUNK_OFFSET,
  GLB_MAGIC,
  GLB_VERSION,
  INSTANCING_EXTENSION,
  NORMALISATION_NODE_NAME,
} from "./gltf-constants";

export { NORMALISATION_NODE_NAME };

/**
 * `blockers` are conditions under which a root scale would corrupt the asset or make bounds
 * meaningless; `warnings` don't block normalisation but a human should know about them.
 */
export interface Preflight {
  blockers: string[];
  warnings: string[];
}

const determinant3 = (m: ArrayLike<number>) =>
  m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) -
  m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!) +
  m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!);

/**
 * Checks that measuring static world-space vertex bounds and scaling the whole scene
 * along world axes is a faithful operation for this document.
 */
export function preflight(document: Document): Preflight {
  const root = document.getRoot();
  const blockers: string[] = [];
  const warnings: string[] = [];

  const scenes = root.listScenes();
  if (scenes.length !== 1) {
    blockers.push(`Expected exactly 1 scene, found ${scenes.length}: which one represents the product is ambiguous`);
  }
  if (root.listAnimations().length > 0) {
    blockers.push(`${root.listAnimations().length} animation(s): rest-pose bounds don't represent the product's size`);
  }
  if (root.listSkins().length > 0) {
    blockers.push(`${root.listSkins().length} skin(s): skinned vertex positions aren't covered by static bounds`);
  }
  const instancing = root.listExtensionsUsed().find((e) => e.extensionName === INSTANCING_EXTENSION);
  if (instancing) {
    blockers.push(`${INSTANCING_EXTENSION}: instanced copies aren't covered by static bounds`);
  }

  const scene = scenes[0];
  if (scene) {
    const meshNodes: Node[] = [];
    for (const child of scene.listChildren()) {
      child.traverse((node) => {
        if (node.getMesh()) meshNodes.push(node);
        if (node.getCamera()) warnings.push(`Node "${node.getName()}" has a camera; it will be scaled with the model`);
        if (determinant3(node.getWorldMatrix()) < 0) {
          blockers.push(`Node "${node.getName()}" has a mirrored (negative-determinant) world transform`);
        }
      });
    }
    if (meshNodes.length === 0) blockers.push("Scene contains no meshes");

    for (const node of meshNodes) {
      for (const prim of node.getMesh()!.listPrimitives()) {
        if (prim.listTargets().length > 0) {
          blockers.push(`Mesh "${node.getMesh()!.getName()}" has morph targets: active weights change the bounds`);
        }
        if (prim.getMode() !== Primitive.Mode.TRIANGLES) {
          warnings.push(`Mesh "${node.getMesh()!.getName()}" has non-triangle primitives (mode ${prim.getMode()})`);
        }
      }
    }
  }

  const unsupported = root
    .listExtensionsUsed()
    .map((e) => e.extensionName)
    .filter((name) => name !== INSTANCING_EXTENSION);
  if (unsupported.length > 0) {
    warnings.push(`Extensions present (check they're scale-invariant): ${unsupported.join(", ")}`);
  }

  return { blockers: [...new Set(blockers)], warnings: [...new Set(warnings)] };
}

/** Exact world-space AABB of the single scene, from every vertex (not accessor min/max). */
export function measureBounds(document: Document): Bounds {
  const scene = document.getRoot().listScenes()[0];
  if (!scene) throw new Error("Document has no scene to measure");
  const { min, max } = getBounds(scene);
  return { min: [...min] as Vec3, max: [...max] as Vec3 };
}

/**
 * Node TRS for the wrapper: `scale` first along the raw scene's axes, then `rotation`
 * (quaternion [x, y, z, w]), then `translation` in output units.
 */
export interface RootTransform {
  scale: Vec3;
  rotation?: [number, number, number, number];
  translation?: Vec3;
}

/**
 * Re-parents every root node of the scene under one new node carrying the transform.
 * Because it sits above everything, the scale acts along the raw scene's world axes, so world
 * bounds scale exactly even when child nodes are rotated. Vertex data, materials and textures
 * are untouched: the correction lives entirely in this node.
 */
export function applyRootTransform(document: Document, transform: RootTransform, extras: Record<string, unknown>): Node {
  const scene = document.getRoot().listScenes()[0];
  if (!scene) throw new Error("Document has no scene to transform");

  const wrapper = document.createNode(NORMALISATION_NODE_NAME).setScale(transform.scale).setExtras(extras);
  if (transform.rotation) wrapper.setRotation(transform.rotation);
  if (transform.translation) wrapper.setTranslation(transform.translation);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    wrapper.addChild(child);
  }
  scene.addChild(wrapper);
  return wrapper;
}

/**
 * glTF IO that understands every extension gltf-transform implements. Without registration, gltf-transform drops
 * unknown extensions on read, which would silently discard material/texture data on re-export.
 */
export function createGltfIO(): NodeIO {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS);
}

export const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set(ALL_EXTENSIONS.map((e) => e.EXTENSION_NAME));

export interface GlbExtensions {
  extensionsUsed: string[];
  extensionsRequired: string[];
}

/** Reads the JSON chunk of a GLB container directly, independent of any glTF library. */
export function readGlbJson(bytes: Uint8Array): GlbExtensions {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < GLB_JSON_CHUNK_OFFSET || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error("Not a GLB file (missing glTF magic header)");
  }
  const version = view.getUint32(4, true);
  if (version !== GLB_VERSION) throw new Error(`Unsupported GLB version ${version}`);
  const jsonLength = view.getUint32(GLB_HEADER_BYTES, true);
  const jsonEnd = GLB_JSON_CHUNK_OFFSET + jsonLength;
  if (view.getUint32(GLB_HEADER_BYTES + 4, true) !== GLB_CHUNK_TYPE_JSON || jsonEnd > bytes.byteLength) {
    throw new Error("GLB JSON chunk is missing or truncated");
  }
  const json: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(GLB_JSON_CHUNK_OFFSET, jsonEnd)));
  const list = (key: string) => {
    const value = typeof json === "object" && json !== null ? (json as Record<string, unknown>)[key] : undefined;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  };
  return { extensionsUsed: list("extensionsUsed"), extensionsRequired: list("extensionsRequired") };
}

/**
 * Parses GLB bytes into a document plus the extensions its JSON declares. A fresh IO instance is
 * used each time, so nothing is shared with any document written earlier.
 */
export async function readGlb(bytes: Uint8Array): Promise<{ document: Document; extensions: GlbExtensions }> {
  const extensions = readGlbJson(bytes);
  const document = await createGltfIO().readBinary(bytes);
  return { document, extensions };
}

/** Counts used to confirm normalisation didn't drop or duplicate content. */
export function contentSummary(document: Document) {
  const root = document.getRoot();
  const primitives = root.listMeshes().flatMap((m) => m.listPrimitives());
  return {
    meshes: root.listMeshes().length,
    primitives: primitives.length,
    vertices: primitives.reduce((n, p) => n + (p.getAttribute("POSITION")?.getCount() ?? 0), 0),
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
  };
}
