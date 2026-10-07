# Flyn Cotbed ingestion pipeline

One command takes the frozen Flyn Cotbed source record to a true-scale, correctly proportioned GLB and opens it in a Three.js viewer. There are no human steps:

```
frozen source → Meshy (or existing GLB) → immutable raw GLB → inspection → proportional check
  → automatic correction (orientation, per-axis scale, pivot, grounding) → export
  → re-open & validate → manifest → viewer
```

The provider decides the initial shape. This code owns dimensions, proportions, orientation, grounding, validation and provenance.

## Quick start

```bash
pnpm install
pnpm ingest:product flyn-cotbed --generate        # new Meshy attempt (paid, ~30 credits) → … → viewer
pnpm ingest:product flyn-cotbed                   # same, reusing the newest succeeded Meshy attempt (free)
pnpm ingest:product flyn-cotbed --raw some.glb    # same, from a specific existing GLB
```

When a run completes, the command serves the viewer and prints its URL, e.g. `http://localhost:3000/?product=flyn-cotbed&run=<runId>`. It keeps serving until you press Ctrl+C. Pass `--no-viewer` to exit straight away (for scripts or CI). `pnpm viewer` serves earlier runs.

| Option | Purpose |
| --- | --- |
| `--generate` | New Meshy request. Always creates a new `attempt-<n>`. |
| `--raw <file.glb>` | Use an existing GLB instead of Meshy. |
| `--run-id <id>` | Name the run (default: start timestamp). A repeated id is refused, never overwritten. |
| `--output <dir>` | Artifact root (default `output`). |
| `--json` | Print the manifest to stdout; progress goes to stderr. |
| `--no-viewer` | Don't start the viewer after a successful run. |

Exit codes: `0` completed, `1` failure.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `MESHY_API_KEY` | only with `--generate` | Meshy API key. Put it in `.env` (gitignored); see `.env.example`. Never logged. |
| `PORT` | no (default 3000) | Viewer port. |
| `NODE_ENV` | no (default `development`) | `production` turns off the viewer's dev bundling. |

Everything about the product is in [`src/features/products/profiles.ts`](../src/features/products/profiles.ts):

- which benchmark images go to Meshy (1–4 views of the same configuration, primary view first)
- the Meshy model and options (`meshy-6`, textured, no remesh)
- polling
- the declared raw axis mapping (`width=x, height=y, depth=z`)

The authoritative dimensions come from the frozen source record [`src/features/products/mocks/flyn-cotbed.ts`](../src/features/products/mocks/flyn-cotbed.ts): 1463 × 795 × 953 mm (W × D × H, cot mode, merchant page). Millimetres are canonical everywhere. They are converted to metres only where the GLB is written, validated or rendered.

Thresholds and their defaults are in [`src/features/ingestion/schemas/config.ts`](../src/features/ingestion/schemas/config.ts) (`PipelineConfigSchema`). `runIngestionPipeline({ config })` can override them.

### Proportional check (raw asset, before correction)

Code measures the raw GLB's world-space bounds and compares its W:D:H ratios with the authoritative ones. Any proportional error is **corrected automatically** with per-axis scaling, however large. The amount of correction is recorded as a warning, e.g. `depth is +11.00% out of proportion … corrected automatically`, and in `rawProportions` in the manifest, so a model that looks off can be traced back to how far it was stretched. Only geometry that is not plausibly a product (absurd aspect ratio) fails the run.

| Setting | Default | Meaning |
| --- | --- | --- |
| `uniformTolerancePct` | 0.5 | At or below this, the correction is recorded as `uniform` (a plain rescale), otherwise `non-uniform`. |
| `axisMappingMarginPct` | 5 | Warn when another axis assignment would need this many fewer points of scale spread. |
| `maxRawAspectRatio` | 100 | FAIL (`ABSURD_ASPECT_RATIO`) when the longest/shortest raw axis exceeds it. |
| `referenceDimension` | largest authoritative (width) | Dimension the proportions are expressed against. |

Limits are inclusive (`≤ limit` passes), and non-finite values fail. Both Flyn Meshy attempts came in at about 10–11% depth error, which is corrected automatically.

### Dimensional validation (re-opened corrected GLB)

The exported file is read back from disk with a fresh glTF IO and its bounds are measured again. It must pass all of these:

| Setting | Default | Meaning |
| --- | --- | --- |
| `toleranceMm` and `tolerancePct` | 0.5 mm and 0.1 % | Per dimension. **Both** must hold (inclusive). |
| `groundToleranceMm` | 0.5 | Maximum distance of the lowest point from y = 0. |
| `pivotToleranceMm` | 1 | Maximum footprint-centre offset from the origin. |
| `maxPlausibleDimensionMm` | 5000 | Any larger dimension is absurd. |

Validation also fails with `VISUAL_DATA_CHANGED` if mesh, primitive, vertex, material or texture counts, or glTF extensions, differ between the raw and corrected files. Every FAIL carries `reasonCodes` (machine-readable) and `reasons` (human-readable).

## How correction works

The correction is a single new root node (`dimensional-normalisation`) with translation · rotation · scale. Every original root is re-parented under it. Vertex data, materials, textures and nested transforms are left as generated.

- **Scale**: per raw axis, `authoritative mm → metres / raw extent`. This corrects proportions as well as size. It is applied along the raw world axes, so it is exact under rotated or nested children.
- **Rotation**: a signed axis permutation that maps the declared raw axes onto canonical glTF axes (+Y up, width on X, depth on Z). An odd permutation would mirror the model, so the depth axis is reversed instead, and a warning is recorded.
- **Translation**: centres the footprint on the origin and puts the lowest point on y = 0.

Structures that a root transform can't correct faithfully stop the run with `CORRECTION_FAILED`. These are animations, skins, morph targets, GPU instancing, mirrored transforms, more than one scene, and unsupported extensions. The same raw GLB always produces a byte-identical `corrected.glb`.

## Artifact layout

```
output/flyn-cotbed/
  meshy/attempt-<n>/raw.glb              immutable provider GLB, byte-for-byte, read-only (0444)
  meshy/attempt-<n>/generation.json      provider record: job id, model, options, timings, credits, sha256
  runs/<runId>/manifest.json             run manifest (schema below)
  runs/<runId>/corrected.glb             corrected GLB, present only once validation passed (read-only)
  runs/<runId>/corrected.rejected.glb    exported GLB that failed validation (kept as evidence)
  runs/latest.json                       newest completed run (the viewer's default)
```

- The pipeline never writes to a raw GLB. Its sha256 is checked against the hash recorded at download, before and after processing (`RAW_ASSET_MUTATED` if they differ).
- The default mode reuses the newest succeeded attempt and records `provider.reused: true` and `cost.credits: 0`. Failed attempts are never reused.
- Every run gets its own directory, created exclusively. The export is written atomically as `corrected.unvalidated.glb` and renamed to `corrected.glb` only after validation passes.
- The manifest is rewritten atomically after every stage, so a crashed or failed run leaves an inspectable state (`status`, `currentStage`, `completedStages`, `errors`).

### Manifest

`RunManifestSchema` in [`src/features/ingestion/schemas/manifest.ts`](../src/features/ingestion/schemas/manifest.ts) (`schemaVersion: 2`) records:

- the product and SKU
- source reference and sha256
- benchmark images
- authoritative dimensions and their source
- provider name, endpoint, model, options, job id, attempt, timestamps, latency and credits
- raw and corrected asset path, sha256 and size
- raw measurements and proportions (ratio errors, per-axis scale factors, spread, best-fit axis mapping)
- the proportional-check decision
- the correction (`uniform` or `non-uniform`, per-axis scale, rotation, translation)
- corrected measurements
- dimensional validation (per-dimension measured, error in mm and %, tolerances, ground and pivot offsets)
- content counts
- per-stage timings and the generation/processing/total split
- code version and git commit
- warnings and typed errors

Run status is `RUNNING`, `COMPLETED` or `FAILED`.

Error codes: `INVALID_SOURCE`, `INVALID_CONFIG`, `PROVIDER_SUBMISSION_FAILED`, `PROVIDER_GENERATION_FAILED`, `PROVIDER_JOB_INCOMPLETE`, `DOWNLOAD_FAILED`, `RAW_ASSET_UNAVAILABLE`, `RAW_ASSET_MUTATED`, `GLB_PARSE_FAILED`, `INVALID_GEOMETRY`, `PROPORTIONAL_FAIL`, `CORRECTION_FAILED`, `EXPORT_FAILED`, `CORRECTED_PARSE_FAILED`, `DIMENSIONAL_VALIDATION_FAILED`.

Manifests written by the earlier v1 pipeline (which had a REVIEW stop) are listed as `UNREADABLE` by the viewer.

## Viewer

The viewer loads `corrected.glb` exactly as exported. It applies no rescaling and no re-centring. The scene uses 1 world unit = 1 m. Millimetre metadata is converted at the scene boundary ([`src/features/viewer/client/scale.ts`](../src/features/viewer/client/scale.ts)), so 1000 mm becomes exactly 1.0 world unit. The viewer shows:

- a 6 m floor with a 10 cm grid and a 1 m grid, an orbit camera, view presets and neutral lighting
- a labelled 1 m ruler as the scale reference
- the authoritative dimension labels
- the measured bounding box (blue) and the authoritative envelope (orange)
- live Three.js bounds next to the authoritative values
- the check, correction and validation results
- loading, parse and missing-asset errors

**Lineup mode** (`/?mode=lineup`, also linked from the panel) loads the latest validated run of every product (`GET /api/products`) and places them left to right along X with an equal 30 cm gap between bounding boxes ([`src/features/viewer/client/lineup.ts`](../src/features/viewer/client/lineup.ts)). Models are only translated, never scaled. Each product gets its measured bounding box with W/D/H labels in mm. The 1 m ruler and the authoritative envelope are left out in this mode, and the floor grows to fit the row. A product that fails to load is reported and left out of the row.

`pnpm build:viewer` writes a production bundle to `dist/viewer`. It needs the API that the ingest command or `pnpm viewer` serves. The server is a local development tool with no authentication.

## Common failure modes

| Symptom | Cause / fix |
| --- | --- |
| `RAW_ASSET_UNAVAILABLE: No succeeded provider attempt` | Nothing under `output/flyn-cotbed/meshy/`. Run with `--generate` or pass `--raw`. |
| `MESHY_API_KEY is not set` | Add the key to `.env` for `--generate`. |
| `PROVIDER_*` / `DOWNLOAD_FAILED` | Meshy rejected the request, the job failed or timed out (20 min), or the download failed. `generation.json` in the attempt directory has the details. |
| `PROPORTIONAL_FAIL` | The raw geometry has an absurd aspect ratio (longest/shortest axis > 100): not plausibly the product. Regenerate with `--generate`. |
| `CORRECTION_FAILED` | Unsupported structure (see above). The reason lists the blockers. |
| `DIMENSIONAL_VALIDATION_FAILED` | See `dimensionalValidation.reasons`. The rejected export is kept as `corrected.rejected.glb`. |
| `RAW_ASSET_MUTATED` | A raw GLB changed after download. Regenerate rather than editing raw files. |
| `Viewer not started` | Port in use. Set `PORT` or run `pnpm viewer` later. |

## Code map

Code is organised by feature (vertical slices) under `src/features/`, with a small shared kernel in `src/shared/`. Each slice owns its schemas, logic, tests and CLI entry points (`cli/`). Shared code never imports from a feature.

| Slice | Contents |
| --- | --- |
| `features/products/` | Product source schema, frozen product records (`mocks/`), ingestion profiles |
| `features/generation/` | Provider boundary (`types.ts`), Meshy client and provider, `generate:flyn` CLI |
| `features/ingestion/` | `run.ts` (stage order) and `stage-runner.ts`; `stages/`; `analysis/` (measurement, proportional check, transform, validation maths); `storage/` (on-disk layout, attempts, manifests); `schemas/` (config defaults, manifest); `ingest:product` CLI |
| `features/viewer/` | `server.ts`, the browser app in `client/` (`main.ts` entry), `viewer` CLI |
| `shared/geometry/` | Dimensions and axis-mapping schemas, bounds helpers, glTF IO and operations |
| `shared/utils/`, `shared/cli/`, `shared/env.ts` | Files and hashing, formatting, units, errors, environment |

Dependencies point one way between slices: products references generation (profiles carry provider options); ingestion uses products and generation; the viewer reads products and ingestion's storage and schemas. CLI entry points are where things get wired together, so they may import across slices (for example, `ingest:product` starts the viewer server).

The older lower-level command `pnpm generate:flyn` (generation only) still works, and `ingest:product` supersedes it.

## Tests

`pnpm test` runs pure unit tests and fixture-based integration tests with small GLBs generated in memory (`src/features/ingestion/test-fixtures.ts`) and a fake provider. The normal suite makes no Meshy request.
