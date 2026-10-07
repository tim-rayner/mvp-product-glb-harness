import { Box3, Vector3 } from "three";
import { $ } from "./dom";
import { fetchCorrectedModel, fetchManifest } from "./api";
import { renderPanel } from "./panel";
import { dimensionsToWorldSize } from "./scale";
import type { InspectionScene } from "./scene";

/** One product's run: its corrected model, measured bounds, authoritative envelope and a 1 m ruler. */
export async function loadSingleProduct(view: InspectionScene, slug: string, runId: string) {
  $("mode-link").innerHTML = `<a href="/?mode=lineup">All products in a row</a>`;
  const manifest = await fetchManifest(slug, runId);
  renderPanel(manifest, null);

  const model = await fetchCorrectedModel(slug, manifest);
  view.scene.add(model);
  const box = new Box3().setFromObject(model, true);
  view.addMeasuredBounds(box);

  const target = manifest.authoritativeDimensionsMm;
  if (target) {
    const size = dimensionsToWorldSize(target);
    view.addEnvelope(size);
    view.addLabel(`W ${target.width} mm`, new Vector3(0, -0.02, size.z / 2 + 0.06));
    view.addLabel(`D ${target.depth} mm`, new Vector3(size.x / 2 + 0.08, -0.02, 0));
    view.addLabel(`H ${target.height} mm`, new Vector3(size.x / 2 + 0.06, size.y / 2, size.z / 2));
  }
  view.addScaleReference(box.max.z);
  view.focusOn(box);

  renderPanel(manifest, box.getSize(new Vector3()));
}
