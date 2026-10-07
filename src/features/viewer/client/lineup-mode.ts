import { Box3, Vector3, type Object3D } from "three";
import { errorMessage } from "../../../shared/utils/errors";
import { formatNumber } from "../../../shared/utils/format";
import { fetchCorrectedModel, fetchManifest, fetchProducts, type ProductSummary } from "./api";
import { DEFAULT_FLOOR_SIZE_M } from "./constants";
import { $, escapeHtml, showError } from "./dom";
import { layoutRow } from "./lineup";
import { worldToMm } from "./scale";
import type { InspectionScene } from "./scene";

interface LineupEntry extends ProductSummary {
  model: Object3D;
  box: Box3;
}

const mm = (worldUnits: number) => formatNumber(worldToMm(worldUnits), 0);

function showLineupLayout() {
  $("title").textContent = "All products · lineup";
  $("mode-link").innerHTML = `<a href="/">Single-product view</a>`;
  $("single").hidden = true;
  $("lineup").hidden = false;
  $<HTMLInputElement>("toggle-envelope").closest("label")!.style.display = "none";
}

/** Loads every product in parallel; a product that fails is reported and left out of the row. */
async function loadEntries(products: ProductSummary[]): Promise<LineupEntry[]> {
  const results = await Promise.allSettled(
    products.map(async (p): Promise<LineupEntry> => {
      const manifest = await fetchManifest(p.slug, p.runId);
      const model = await fetchCorrectedModel(p.slug, manifest);
      return { ...p, model, box: new Box3().setFromObject(model, true) };
    }),
  );
  const entries: LineupEntry[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") entries.push(r.value);
    else showError(`${products[i]!.slug}: ${errorMessage(r.reason)}`);
  });
  return entries;
}

/** Bounding box plus measured W/D/H labels on its front, side and top edges, and the product title above. */
function addMeasuredBox(view: InspectionScene, box: Box3, title: string) {
  view.addMeasuredBounds(box);
  const size = box.getSize(new Vector3());
  const c = box.getCenter(new Vector3());
  view.addLabel(`W ${mm(size.x)} mm`, new Vector3(c.x, box.min.y - 0.02, box.max.z + 0.04));
  view.addLabel(`D ${mm(size.z)} mm`, new Vector3(box.max.x + 0.02, box.min.y - 0.02, c.z));
  view.addLabel(`H ${mm(size.y)} mm`, new Vector3(box.max.x, c.y, box.max.z));
  view.addLabel(title, new Vector3(c.x, box.max.y + 0.06, c.z));
}

/**
 * Places entries in one row, translating along X only so each model keeps its exported height and
 * floor contact. Returns the bounds of the whole row.
 */
function placeInRow(view: InspectionScene, entries: LineupEntry[]): Box3 {
  const slots = layoutRow(entries.map((e) => e.box.max.x - e.box.min.x));
  const row = new Box3();
  entries.forEach((e, i) => {
    const dx = slots[i]!.minX - e.box.min.x;
    e.model.position.x += dx;
    e.box.translate(new Vector3(dx, 0, 0));
    view.scene.add(e.model);
    addMeasuredBox(view, e.box, e.title);
    row.union(e.box);
  });
  return row;
}

/** Smallest even floor (in metres) that covers the row with a metre to spare. */
function floorSizeFor(row: Box3): number {
  const extent = Math.max(Math.abs(row.min.x), Math.abs(row.max.x), Math.abs(row.min.z), Math.abs(row.max.z));
  return Math.max(DEFAULT_FLOOR_SIZE_M, 2 * Math.ceil(extent + 1));
}

function renderLineupTable(entries: LineupEntry[]) {
  $("lineup-dims").querySelector("tbody")!.innerHTML = entries
    .map((e) => {
      const s = e.box.getSize(new Vector3());
      const href = `/?product=${encodeURIComponent(e.slug)}&run=${encodeURIComponent(e.runId)}`;
      return `<tr><td><a href="${href}">${escapeHtml(e.title)}</a></td><td>${mm(s.x)}</td><td>${mm(s.z)}</td><td>${mm(s.y)}</td><td class="muted">${escapeHtml(e.runId)}</td></tr>`;
    })
    .join("");
}

/** Every product with a validated latest run, side by side in one row, without the floor ruler. */
export async function loadLineup(view: InspectionScene) {
  showLineupLayout();
  const products = await fetchProducts();
  if (!products.length) throw new Error("No product has a validated run yet: run pnpm ingest:product <slug>");

  const entries = await loadEntries(products);
  if (!entries.length) return;

  const row = placeInRow(view, entries);
  view.buildFloor(floorSizeFor(row));
  view.focusOn(row);
  renderLineupTable(entries);
}
