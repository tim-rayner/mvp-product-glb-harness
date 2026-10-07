import type { Vector3 } from "three";
import type { RunManifest } from "../../ingestion/schemas";
import { formatNumber, formatScale } from "../../../shared/utils/format";
import { $, badge, definitionRows, escapeHtml, reasonsList } from "./dom";
import { compareSceneBounds } from "./scale";

const fmt = (v: number | null | undefined, digits = 1) => formatNumber(v, digits, "—");
const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

function renderHeader(m: RunManifest) {
  $("title").textContent = `${m.title}${m.sku ? ` · ${m.sku}` : ""}`;
  $("subtitle").textContent = `run ${m.runId} · ${m.productId}`;
}

function renderStatus(m: RunManifest) {
  $("status").innerHTML = definitionRows([
    ["run", badge(m.status)],
    ["proportion check", m.proportionalCheck ? badge(m.proportionalCheck.status) : "—"],
    ["correction", m.correction ? m.correction.type : "—"],
    ["dimensional validation", m.dimensionalValidation ? badge(m.dimensionalValidation.status) : "—"],
  ]);
}

/** Authoritative vs scene-measured dimensions; measured columns stay empty until the model has loaded. */
function renderDimensions(m: RunManifest, sceneSize: Vector3 | null) {
  const target = m.authoritativeDimensionsMm;
  if (!target) return;
  const rows = sceneSize ? compareSceneBounds(sceneSize, target) : null;
  $("dims").querySelector("tbody")!.innerHTML = (["width", "depth", "height"] as const)
    .map((d, i) => {
      const row = rows?.[i];
      return `<tr><td>${d}</td><td>${target[d]}</td><td>${fmt(row?.measuredMm, 2)}</td><td>${row ? signed(row.deltaMm) : "—"}</td></tr>`;
    })
    .join("");
}

function renderValidation(m: RunManifest) {
  const v = m.dimensionalValidation;
  $("validation").innerHTML = v
    ? `${badge(v.status)} ground offset ${fmt(v.groundOffsetMm, 3)} mm (±${v.tolerances.groundToleranceMm}), ` +
      `tolerance ±${v.tolerances.toleranceMm} mm and ±${v.tolerances.tolerancePct}% per dimension` +
      reasonsList(v.reasons)
    : "Not run";
}

function renderProportionalCheck(m: RunManifest) {
  const check = m.proportionalCheck;
  const proportions = m.rawProportions;
  if (!check || !proportions) {
    $("gate").innerHTML = "Not run";
    return;
  }
  const e = proportions.proportionalErrorPct;
  const c = m.correction;
  $("gate").innerHTML =
    `${badge(check.status)} raw error vs ${proportions.referenceDimension}: ` +
    `W ${fmt(e.width, 2)}% · D ${fmt(e.depth, 2)}% · H ${fmt(e.height, 2)}%, scale spread ${fmt(proportions.scaleSpreadPct, 2)}%` +
    (c ? `<div class="muted">${c.type} correction, scale ${formatScale(c.scaleFactors)}</div>` : "") +
    reasonsList(check.reasons);
}

function renderArtifacts(m: RunManifest) {
  const provider = m.provenance.provider;
  $("artifacts").innerHTML = definitionRows([
    ["raw", m.rawAsset ? `${escapeHtml(m.rawAsset.path)} <span class="muted">(${m.rawAsset.origin})</span>` : "—"],
    ["corrected", m.correctedAsset ? escapeHtml(m.correctedAsset.path) : "—"],
    ["provider", provider ? `${provider.name} ${provider.model}, job ${provider.jobId ?? "—"}` : "none recorded"],
  ]);
}

/** Fills the single-product side panel from a run manifest. */
export function renderPanel(m: RunManifest, sceneSize: Vector3 | null) {
  renderHeader(m);
  renderStatus(m);
  renderDimensions(m, sceneSize);
  renderValidation(m);
  renderProportionalCheck(m);
  renderArtifacts(m);
}
