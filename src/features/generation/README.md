# Generation

Turns a product's images into a raw 3D model (GLB) using a third-party image-to-3D provider. Today that provider is Meshy. The provider decides the model's initial shape. Everything about its size and proportions is fixed later, in ingestion.

## Where it fits

```
products → [generation] → ingestion → viewer
```

Generation takes the benchmark images from a product profile and returns the GLB exactly as the provider produced it. Ingestion calls it only when a new model is requested (`--generate`). Otherwise ingestion reuses an earlier result, because every request costs provider credits.

## What's here

- `types.ts`: the `GenerationProvider` interface. Ingestion only ever talks to this, so tests can swap in a fake provider and never make a paid request.
- `meshy-client.ts`: a thin client for the Meshy REST API.
- `meshy.ts`: Meshy behind the `GenerationProvider` interface, including error and timing details.
- `cli/generate-flyn.ts` (`pnpm generate:flyn`): an older, generation-only command. `pnpm ingest:product <slug> --generate` replaces it.
