import {
  AmbientLight,
  Box3,
  Box3Helper,
  BoxGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import {
  CAMERA,
  COLORS,
  DEFAULT_FLOOR_SIZE_M,
  FLOOR_OFFSET_Y,
  GRID_DIVISIONS_PER_METRE,
  GRID_OFFSET_Y,
  VIEW_DISTANCE_FACTOR,
  type CameraView,
} from "./constants";

/** 1 m ruler with 10 cm ticks (longer every 50 cm), centred on the origin along X. */
function buildRuler(): Group {
  const ruler = new Group();
  const material = new MeshBasicMaterial({ color: COLORS.ruler });
  const bar = new Mesh(new BoxGeometry(1, 0.004, 0.012), material);
  bar.position.set(0, 0.002, 0);
  ruler.add(bar);
  for (let i = 0; i <= 10; i++) {
    const tick = new Mesh(new BoxGeometry(0.003, 0.004, i % 5 === 0 ? 0.05 : 0.03), material);
    tick.position.set(-0.5 + i * 0.1, 0.002, 0);
    ruler.add(tick);
  }
  return ruler;
}

/**
 * The inspection scene: 1 world unit = 1 metre, floor at y = 0, product origin at the world origin.
 * Models are added exactly as exported (no rescaling, no re-centring), so what you see is what the
 * file says.
 */
export class InspectionScene {
  readonly scene = new Scene();
  private readonly renderer = new WebGLRenderer({ antialias: true });
  private readonly labelRenderer: CSS2DRenderer;
  private readonly camera = new PerspectiveCamera(CAMERA.fovDegrees, 1, CAMERA.near, CAMERA.far);
  private readonly controls: OrbitControls;
  private readonly floor = new Group();
  private readonly labels = new Group();
  private readonly boundsHelpers: Object3D[] = [];
  private readonly envelopeHelpers: Object3D[] = [];
  private focus = { size: new Vector3(1.5, 1, 0.8), center: new Vector3(0, 0.5, 0) };

  constructor(
    private readonly container: HTMLElement,
    labelsElement: HTMLElement,
  ) {
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.prepend(this.renderer.domElement);
    this.labelRenderer = new CSS2DRenderer({ element: labelsElement });

    this.scene.background = new Color(COLORS.background);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new HemisphereLight(COLORS.skyLight, COLORS.groundLight, 1.6));
    this.scene.add(new AmbientLight(COLORS.skyLight, 0.4));
    const sun = new DirectionalLight(COLORS.skyLight, 1.4);
    sun.position.set(3, 5, 4);
    this.scene.add(sun, this.floor, this.labels);
    this.buildFloor(DEFAULT_FLOOR_SIZE_M);

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    });
    this.setView("three-quarter");
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Square floor of `sizeM` metres with a 10 cm minor grid and 1 m major grid. */
  buildFloor(sizeM: number) {
    this.floor.clear();
    const plane = new Mesh(new PlaneGeometry(sizeM, sizeM), new MeshStandardMaterial({ color: COLORS.floor, roughness: 1 }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = FLOOR_OFFSET_Y;
    const minorGrid = new GridHelper(sizeM, sizeM * GRID_DIVISIONS_PER_METRE, COLORS.minorGrid, COLORS.minorGridCentre);
    const majorGrid = new GridHelper(sizeM, sizeM, COLORS.majorGrid, COLORS.majorGridCentre);
    majorGrid.position.y = minorGrid.position.y = GRID_OFFSET_Y;
    this.floor.add(plane, minorGrid, majorGrid);
  }

  addLabel(text: string, position: Vector3) {
    const el = document.createElement("div");
    el.className = "label";
    el.textContent = text;
    const obj = new CSS2DObject(el);
    obj.position.copy(position);
    this.labels.add(obj);
    return obj;
  }

  /** Lays the 1 m ruler on the floor in front of `frontZ`. */
  addScaleReference(frontZ: number) {
    const ruler = buildRuler();
    ruler.position.set(0, 0, frontZ + 0.2);
    this.scene.add(ruler);
    this.addLabel("1.000 m scale reference (10 cm ticks)", new Vector3(0, 0.03, frontZ + 0.27));
  }

  /** Outline of a model's measured bounding box. */
  addMeasuredBounds(box: Box3) {
    const helper = new Box3Helper(box, new Color(COLORS.measuredBounds));
    this.boundsHelpers.push(helper);
    this.scene.add(helper);
  }

  /** Outline of the authoritative size, standing on the floor and centred on the origin. */
  addEnvelope(size: { x: number; y: number; z: number }) {
    const box = new Box3(new Vector3(-size.x / 2, 0, -size.z / 2), new Vector3(size.x / 2, size.y, size.z / 2));
    const helper = new Box3Helper(box, new Color(COLORS.authoritativeEnvelope));
    this.envelopeHelpers.push(helper);
    this.scene.add(helper);
  }

  setBoundsVisible = (on: boolean) => this.boundsHelpers.forEach((o) => (o.visible = on));
  setEnvelopeVisible = (on: boolean) => this.envelopeHelpers.forEach((o) => (o.visible = on));
  setLabelsVisible = (on: boolean) => (this.labels.visible = on);

  /** Frames the camera on `box` from the three-quarter view. */
  focusOn(box: Box3) {
    this.focus = { size: box.getSize(new Vector3()), center: box.getCenter(new Vector3()) };
    this.setView("three-quarter");
  }

  setView(view: CameraView) {
    const { size, center: c } = this.focus;
    const r = Math.max(size.x, size.y, size.z) * VIEW_DISTANCE_FACTOR;
    const positions: Record<CameraView, Vector3> = {
      "three-quarter": new Vector3(c.x + r * 0.7, c.y + r * 0.45, c.z + r * 0.75),
      front: new Vector3(c.x, c.y, c.z + r),
      back: new Vector3(c.x, c.y, c.z - r),
      side: new Vector3(c.x + r, c.y, c.z),
      top: new Vector3(c.x, c.y + r, c.z + 0.001),
    };
    this.camera.position.copy(positions[view] ?? positions["three-quarter"]);
    this.controls.target.copy(c);
    this.controls.update();
  }
}
