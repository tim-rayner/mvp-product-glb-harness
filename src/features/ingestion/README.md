# Ingestion

The core of the product. Ingestion takes a raw, generated GLB and produces a **true-scale, correctly proportioned, validated** GLB, with a full record of how it got there. It needs no human steps.

## Where it fits

```
products → generation → [ingestion] → viewer
```

Ingestion runs the whole flow. It loads the product, gets a raw GLB (from generation or from disk), then corrects and validates it. Only a run that passes validation is shown in the viewer.

The pipeline runs as named stages, and the manifest is saved after each one:

```
load-source → acquire-raw → persist-raw → inspect-raw → proportional-check
  → correct → export → validate → persist-provenance → expose-viewer
```

## What's here

- `run.ts`: the stage order. Start reading here.
- `stage-runner.ts`: timing, manifest saves and failure handling for each stage.
- `stages/`: one module per stage.
- `analysis/`: the measurement, proportional-check, correction-transform and validation maths. These functions have no side effects.
- `storage/`: the on-disk layout under `output/<slug>/`, which holds provider attempts, run directories and the latest-run pointer.
- `schemas/`: the config thresholds and the versioned run manifest.
- `cli/ingest-product.ts` (`pnpm ingest:product <slug>`): runs the pipeline, then starts the viewer.

See [docs/ingestion-pipeline.md](../../../docs/ingestion-pipeline.md) for configuration, checks and failure modes.
