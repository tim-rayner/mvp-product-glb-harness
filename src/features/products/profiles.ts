import { flynCotbed } from "./mocks/flyn-cotbed";
import { flynDresserChanger } from "./mocks/flyn-dresser-changer";
import { mosesBasket } from "./mocks/moses-basket";
import { penroseNursingChairStool } from "./mocks/penrose";
import type { AxisMapping } from "../../shared/geometry/dimensions";
import type { SpatialProductSource } from "./product";
import type { MeshyProviderOptions } from "../generation/meshy";

/**
 * Everything the pipeline needs to ingest one product, beyond the product record itself.
 *
 * - `slug`: CLI name and output folder (`output/<slug>/`).
 * - `sourceReference`: where the frozen source record lives, for provenance.
 * - `benchmarkImages`: the subset of `source.images` sent to the provider. Multi-view by default:
 *   every clean packshot of the same configuration (up to Meshy's limit of 4), primary view first.
 *   Meshy treats the first image as the front on meshy-7.1+; more views constrain the unseen sides.
 * - `axisMapping`: which raw glTF axis carries each product dimension in this provider's output.
 *   Declared per product/provider rather than guessed; the proportional gate flags it if another
 *   mapping fits better.
 */
export interface IngestionProfile {
  slug: string;
  source: SpatialProductSource;
  sourceReference: string;
  benchmarkImages: string[];
  axisMapping: AxisMapping;
  meshy: MeshyProviderOptions;
}

/** Meshy output follows glTF convention: +Y up, the long side along X. */
const MESHY_AXIS_MAPPING: AxisMapping = { width: "x", height: "y", depth: "z" };

const DEFAULT_MESHY_OPTIONS: MeshyProviderOptions = {
  settings: {
    ai_model: "meshy-6",
    should_remesh: false,
    should_texture: true,
    enable_pbr: false,
    target_formats: ["glb"],
  },
  poll: { intervalMs: 10_000, timeoutMs: 20 * 60_000 },
};

/**
 * Single view: the clean cot-mode packshot (image 3) is the only one of this configuration. The
 * others are lifestyle crops, an infographic, a different mattress height, or toddler-bed mode
 * (different geometry). There is no back view.
 */
export const flynCotbedProfile: IngestionProfile = {
  slug: "flyn-cotbed",
  source: flynCotbed,
  sourceReference: "src/features/products/mocks/flyn-cotbed.ts#flynCotbed",
  benchmarkImages: [flynCotbed.images[3]!],
  axisMapping: MESHY_AXIS_MAPPING,
  meshy: DEFAULT_MESHY_OPTIONS,
};

/**
 * Three-quarter (image 2), long-side (image 3) and top-down (image 4) packshots, all without the
 * stand, which is sold separately. Images 0 and 5 include the rocking stand; image 1 is a lifestyle
 * shot. There is no back view, but the basket is symmetric front to back.
 */
export const mosesBasketProfile: IngestionProfile = {
  slug: "moses-basket",
  source: mosesBasket,
  sourceReference: "src/features/products/mocks/moses-basket.ts#mosesBasket",
  benchmarkImages: [mosesBasket.images[2]!, mosesBasket.images[3]!, mosesBasket.images[4]!],
  axisMapping: MESHY_AXIS_MAPPING,
  meshy: DEFAULT_MESHY_OPTIONS,
};

/**
 * Single view: the set packshot (image 1) is the only clean shot with both pieces. Chair-only views
 * (2, 4, 5) would show Meshy a different object; image 0 is a lifestyle shot with other furniture.
 */
export const penroseNursingChairStoolProfile: IngestionProfile = {
  slug: "penrose-nursing-chair-stool",
  source: penroseNursingChairStool,
  sourceReference: "src/features/products/mocks/penrose.ts#penroseNursingChairStool",
  benchmarkImages: [penroseNursingChairStool.images[1]!],
  axisMapping: MESHY_AXIS_MAPPING,
  meshy: DEFAULT_MESHY_OPTIONS,
};

/**
 * Single view: the three-quarter packshot with the changing top (image 3) is the only clean shot of
 * this configuration. Image 2 has no changing top (different geometry), image 1 is a close-up crop
 * and image 0 is a lifestyle shot with props on top. There is no back view.
 */
export const flynDresserChangerProfile: IngestionProfile = {
  slug: "flyn-dresser-changer",
  source: flynDresserChanger,
  sourceReference: "src/features/products/mocks/flyn-dresser-changer.ts#flynDresserChanger",
  benchmarkImages: [flynDresserChanger.images[3]!],
  axisMapping: MESHY_AXIS_MAPPING,
  meshy: DEFAULT_MESHY_OPTIONS,
};

export const ingestionProfiles: Readonly<Record<string, IngestionProfile>> = {
  [flynCotbedProfile.slug]: flynCotbedProfile,
  [mosesBasketProfile.slug]: mosesBasketProfile,
  [penroseNursingChairStoolProfile.slug]: penroseNursingChairStoolProfile,
  [flynDresserChangerProfile.slug]: flynDresserChangerProfile,
};
