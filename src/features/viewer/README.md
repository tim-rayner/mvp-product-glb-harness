# Viewer

A local, browser-based Three.js viewer for checking ingestion results. It loads the corrected GLB **exactly as exported** (no rescaling or re-centring) into a scene where 1 unit = 1 metre. It then overlays the measured bounds, the product's real dimensions and a 1 m ruler, so you can confirm the model is true to scale. It is a development tool, not for deployment.

## Where it fits

```
products → generation → ingestion → [viewer]
```

This is the end of the flow. The viewer only reads from ingestion: run manifests and validated GLBs under `output/`. It never changes them. Single-product mode shows one run. Lineup mode (`/?mode=lineup`) shows every product's latest run side by side.

## What's here

- `server.ts`: a read-only local server for the page, run manifests and corrected GLBs.
- `client/`: the browser app. `main.ts` is the entry point. `scene.ts` holds the Three.js scene, `panel.ts` the side panel, and `single-mode.ts` and `lineup-mode.ts` the two display modes.
- `cli/viewer.ts` (`pnpm viewer`): serves runs already on disk. `pnpm ingest:product` starts the viewer automatically.
