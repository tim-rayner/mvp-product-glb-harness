import { parseArgs } from "node:util";
import { flynCotbed } from "../mocks/flyn-cotbed";
import type { SpatialProductSource } from "../schemas/product";
import type { SemanticDimension } from "../schemas/normalisation";
import { normaliseGlb, UnsafeGlbError } from "../normalisation/normalise";

// Usage:
//   bun src/commands/normalise-dimensions.ts --input raw.glb --output corrected.glb \
//     --axes width=x,height=y,depth=z (--product <productId> | --width 1463 --depth 795 --height 953) \
//     [--report report.json] [--tolerance-mm 0.5] [--review-threshold-pct 5] [--reference width]

const products: Record<string, SpatialProductSource> = {
  [flynCotbed.productId]: flynCotbed,
};

const { values: args } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    report: { type: "string" },
    axes: { type: "string" },
    product: { type: "string" },
    width: { type: "string" },
    depth: { type: "string" },
    height: { type: "string" },
    "tolerance-mm": { type: "string" },
    "review-threshold-pct": { type: "string" },
    reference: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!args.input || !args.output) fail("--input and --output are required");
if (!args.axes) fail("--axes is required, e.g. width=x,height=y,depth=z (no default: orientation varies by asset)");

const axisMapping = Object.fromEntries(args.axes.split(",").map((pair) => pair.split("=")));

let target;
if (args.product) {
  const product = products[args.product] ?? fail(`Unknown product "${args.product}". Known: ${Object.keys(products).join(", ")}`);
  target = product.dimensions;
} else {
  target = { width: Number(args.width), depth: Number(args.depth), height: Number(args.height) };
}

const optionalNumber = (v?: string) => (v === undefined ? undefined : Number(v));

try {
  const report = await normaliseGlb({
    inputPath: args.input,
    outputPath: args.output,
    target,
    axisMapping,
    config: {
      toleranceMm: optionalNumber(args["tolerance-mm"]),
      reviewThresholdPct: optionalNumber(args["review-threshold-pct"]),
      referenceDimension: args.reference as SemanticDimension | undefined,
    },
  });
  const json = JSON.stringify(report, null, 2);
  if (args.report) await Bun.write(args.report, json);
  console.log(json);
  console.log(
    `\n[normalise] numerical ${report.validation.numerical}` +
      (report.validation.requiresHumanReview ? " · HUMAN REVIEW REQUIRED" : "") +
      ` → ${args.output}`,
  );
  if (report.validation.numerical !== "PASS") process.exit(1);
} catch (e) {
  if (e instanceof UnsafeGlbError) fail(`[normalise] ${e.message}`);
  throw e;
}
