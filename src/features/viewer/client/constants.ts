export const DEFAULT_VIEWER_PRODUCT = "flyn-cotbed";

export const COLORS = {
  background: 0xf4f4f2,
  skyLight: 0xffffff,
  groundLight: 0x8a8a84,
  floor: 0xe6e6e1,
  minorGrid: 0xcfcfc8,
  minorGridCentre: 0xd9d9d3,
  majorGrid: 0x8f8f88,
  majorGridCentre: 0x9f9f98,
  ruler: 0x1d1d1b,
  measuredBounds: 0x4a5bd4,
  authoritativeEnvelope: 0xd97706,
} as const;

export const CAMERA = { fovDegrees: 40, near: 0.01, far: 100 } as const;

/** Camera distance as a multiple of the focused object's largest extent. */
export const VIEW_DISTANCE_FACTOR = 2.2;

/** Floor side length in whole metres; lineup mode grows it to fit the row. */
export const DEFAULT_FLOOR_SIZE_M = 6;
export const GRID_DIVISIONS_PER_METRE = 10;
/** The floor sits just below y = 0 and the grid just above, so the floor-contact edge stays visible. */
export const FLOOR_OFFSET_Y = -0.0005;
export const GRID_OFFSET_Y = 0.0002;

export type CameraView = "three-quarter" | "front" | "back" | "side" | "top";
