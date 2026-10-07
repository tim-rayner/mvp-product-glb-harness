import { getBounds, Primitive, type Document, type Node } from "@gltf-transform/core";
import type { Bounds, Vec3 } from "./dimensions";

// glTF-specific half of the stage: safety checks, measurement and applying the scale.

export interface Preflight {
  /** Conditions under which a root scale would corrupt the asset or make bounds meaningless. */
  blockers: string[];
  /** Conditions that don't block normalisation but a human should know about. */
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
  const instancing = root.listExtensionsUsed().find((e) => e.extensionName === "EXT_mesh_gpu_instancing");
  if (instancing) {
    blockers.push("EXT_mesh_gpu_instancing: instanced copies aren't covered by static bounds");
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
    .filter((name) => name !== "EXT_mesh_gpu_instancing");
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

export const NORMALISATION_NODE_NAME = "dimensional-normalisation";

/**
 * Re-parents every root node of the scene under one new node carrying the per-axis scale.
 * Because the scale sits above everything, it acts along world axes, so world bounds scale
 * exactly by `scaleByAxis` even when child nodes are rotated. Vertex data is untouched.
 */
export function applyAxisScale(document: Document, scaleByAxis: Vec3, extras: Record<string, unknown>): Node {
  const scene = document.getRoot().listScenes()[0];
  if (!scene) throw new Error("Document has no scene to scale");

  const wrapper = document.createNode(NORMALISATION_NODE_NAME).setScale(scaleByAxis).setExtras(extras);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    wrapper.addChild(child);
  }
  scene.addChild(wrapper);
  return wrapper;
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
