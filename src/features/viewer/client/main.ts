import { errorMessage } from "../../../shared/utils/errors";
import { DEFAULT_VIEWER_PRODUCT, type CameraView } from "./constants";
import { $, showError } from "./dom";
import { loadLineup } from "./lineup-mode";
import { InspectionScene } from "./scene";
import { loadSingleProduct } from "./single-mode";

/** Wires the camera-view buttons and visibility toggles in the page chrome to the scene. */
function bindControls(view: InspectionScene) {
  document
    .querySelectorAll<HTMLButtonElement>("#views button")
    .forEach((b) => b.addEventListener("click", () => view.setView(b.dataset.view as CameraView)));
  const bindToggle = (id: string, apply: (on: boolean) => void) => {
    const input = $<HTMLInputElement>(id);
    input.addEventListener("change", () => apply(input.checked));
  };
  bindToggle("toggle-bounds", view.setBoundsVisible);
  bindToggle("toggle-envelope", view.setEnvelopeVisible);
  bindToggle("toggle-labels", view.setLabelsVisible);
}

const params = new URLSearchParams(location.search);
const view = new InspectionScene($("stage"), $("labels"));
bindControls(view);

try {
  if (params.get("mode") === "lineup") {
    await loadLineup(view);
  } else {
    await loadSingleProduct(view, params.get("product") ?? DEFAULT_VIEWER_PRODUCT, params.get("run") ?? "latest");
  }
} catch (e) {
  showError(errorMessage(e));
}
