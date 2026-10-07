import { createHash } from "node:crypto";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { DimensionsMmSchema, type DimensionsMm } from "../schemas/product";
import {
  AxisMappingSchema,
  NormalisationConfigSchema,
  type AxisMapping,
  type NormalisationConfigInput,
} from "../schemas/normalisation";
import {
  boundsSize,
  computeResiduals,
  planCorrection,
  toSemantic,
  type Bounds,
} from "./dimensions";
import { applyAxisScale, contentSummary, measureBounds, preflight } from "./gltf";

export interface NormaliseGlbOptions {
  inputPath: string;
  outputPath: string;
  target: DimensionsMm;
  axisMapping: AxisMapping;
  config?: NormalisationConfigInput;
}

/** Thrown when the asset has a structure a root scale can't safely correct. Nothing is written. */
export class UnsafeGlbError extends Error {
  constructor(readonly blockers: string[]) {
    super(`Refusing to normalise:\n- ${blockers.join("\n- ")}`);
  }
}

const sha256 = async (file: string) =>
  createHash("sha256").update(await Bun.file(file).bytes()).digest("hex");

const measurement = (bounds: Bounds, mapping: AxisMapping) => {
  const size = boundsSize(bounds);
  return { bounds, sizeByAxis: { x: size[0], y: size[1], z: size[2] }, semantic: toSemantic(size, mapping) };
};

/**
 * Dimensional-normalisation stage: measure → plan per-axis correction → apply → export →
 * reload → re-measure → validate. Returns a JSON-serialisable benchmark report.
 * Never writes to `inputPath`.
 */
export async function normaliseGlb(options: NormaliseGlbOptions) {
  const target = DimensionsMmSchema.parse(options.target);
  const axisMapping = AxisMappingSchema.parse(options.axisMapping);
  const config = NormalisationConfigSchema.parse(options.config ?? {});

  if (path.resolve(options.inputPath) === path.resolve(options.outputPath)) {
    throw new Error("outputPath must differ from inputPath: the source GLB is never overwritten");
  }

  const io = new NodeIO();
  const inputHash = await sha256(options.inputPath);
  const document = await io.read(options.inputPath);

  const { blockers, warnings } = preflight(document);
  if (blockers.length > 0) throw new UnsafeGlbError(blockers);

  if (axisMapping.height !== "y") {
    warnings.push(`Height mapped to ${axisMapping.height}, not glTF's +Y up: confirm the model's orientation`);
  }

  const contentBefore = contentSummary(document);
  const rawBounds = measureBounds(document);
  const plan = planCorrection(boundsSize(rawBounds), target, axisMapping, config);

  for (const d of plan.flaggedDimensions) {
    const c = plan.dimensions[d];
    warnings.push(
      `${d} needs ${c.correctionPct.toFixed(2)}% non-uniform correction relative to ${plan.referenceDimension} ` +
        `(threshold ±${config.reviewThresholdPct}%): human review required`,
    );
  }

  applyAxisScale(document, plan.scaleByAxis, {
    dimensionalNormalisation: {
      sourceSha256: inputHash,
      target,
      axisMapping,
      scaleByAxis: plan.scaleByAxis,
      outputUnits: "m",
    },
  });
  await io.write(options.outputPath, document);

  // Validate from what's on disk, not the in-memory document.
  const reloaded = await io.read(options.outputPath);
  const correctedBounds = measureBounds(reloaded);
  const residuals = computeResiduals(boundsSize(correctedBounds), target, axisMapping, config.toleranceMm);
  const contentAfter = contentSummary(reloaded);
  const contentPreserved = JSON.stringify(contentBefore) === JSON.stringify(contentAfter);
  if (!contentPreserved) warnings.push("Mesh/material/texture counts changed during export");

  const inputUnchanged = (await sha256(options.inputPath)) === inputHash;
  if (!inputUnchanged) warnings.push("Input file hash changed during normalisation");

  const numericalPass = residuals.pass && contentPreserved && inputUnchanged;

  return {
    stage: "dimensional-normalisation",
    generatedAt: new Date().toISOString(),
    input: { path: options.inputPath, sha256: inputHash, unchanged: inputUnchanged },
    output: { path: options.outputPath, sha256: await sha256(options.outputPath), units: "m" },
    axisMapping,
    config,
    targetMm: target,
    raw: { ...measurement(rawBounds, axisMapping), units: "unknown (raw generator units)" },
    correction: {
      method: "root wrapper node with per-axis scale (vertex data unchanged)",
      type: plan.uniform ? "uniform" : "non-uniform",
      referenceDimension: plan.referenceDimension,
      scaleByAxis: { x: plan.scaleByAxis[0], y: plan.scaleByAxis[1], z: plan.scaleByAxis[2] },
      anisotropyPct: plan.anisotropyPct,
      dimensions: plan.dimensions,
    },
    corrected: measurement(correctedBounds, axisMapping),
    residuals: residuals.dimensions,
    content: { before: contentBefore, after: contentAfter, preserved: contentPreserved },
    validation: {
      numerical: numericalPass ? "PASS" : "FAIL",
      toleranceMm: config.toleranceMm,
      requiresHumanReview: plan.flaggedDimensions.length > 0 || !numericalPass,
      visualFidelity: "NOT ASSESSED: bounding-box agreement says nothing about shape or texture fidelity",
    },
    warnings,
  };
}

export type NormalisationReport = Awaited<ReturnType<typeof normaliseGlb>>;
