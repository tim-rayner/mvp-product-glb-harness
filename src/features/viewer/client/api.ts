import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RunManifestSchema, type RunManifest } from "../../ingestion/schemas";
import { errorMessage } from "../../../shared/utils/errors";

export interface ProductSummary {
  slug: string;
  title: string;
  runId: string;
}

const runsApi = (slug: string, path: string) => `/api/products/${encodeURIComponent(slug)}/runs/${path}`;

export async function fetchManifest(slug: string, runId: string): Promise<RunManifest> {
  const response = await fetch(runsApi(slug, encodeURIComponent(runId)));
  if (!response.ok) throw new Error(`Run manifest unavailable (${response.status}): ${await response.text()}`);
  const parsed = RunManifestSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(`Run manifest does not match the expected schema: ${parsed.error.message}`);
  return parsed.data;
}

/** Fetches and parses a run's corrected GLB, exactly as exported. */
export async function fetchCorrectedModel(slug: string, m: RunManifest): Promise<Object3D> {
  if (!m.correctedAsset) {
    const errors = m.errors.map((e) => `[${e.code}] ${e.message}`).join(" ");
    throw new Error(`Run ${m.runId} has no validated corrected GLB (status ${m.status}). ${errors}`);
  }
  const response = await fetch(runsApi(slug, `${encodeURIComponent(m.runId)}/corrected.glb`));
  if (!response.ok) throw new Error(`Corrected GLB missing (${response.status}): ${m.correctedAsset.path}`);
  const buffer = await response.arrayBuffer();
  try {
    return (await new GLTFLoader().parseAsync(buffer, "")).scene;
  } catch (e) {
    throw new Error(`Corrected GLB failed to parse in Three.js: ${errorMessage(e)}`);
  }
}

/** Products with a latest validated run on disk. */
export async function fetchProducts(): Promise<ProductSummary[]> {
  const response = await fetch("/api/products");
  if (!response.ok) throw new Error(`Product list unavailable (${response.status}): ${await response.text()}`);
  return (await response.json()) as ProductSummary[];
}
