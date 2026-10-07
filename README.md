## Description 

Can we turn product SKU to 3D model generated in a browser? 

check back later to see...

<img width="649" height="384" alt="image" src="https://github.com/user-attachments/assets/b5f6f1b2-deb0-4d89-bb86-0f3c88792584" />

**In GLB viewer:**
<img width="912" height="709" alt="image" src="https://github.com/user-attachments/assets/ea129f38-5c2c-4335-94f0-c40020bf1f97" />

the answer was yes! 


## Ingestion pipeline

Frozen product source → Meshy → immutable raw GLB → proportional check → automatic dimensional correction → independent validation → true-scale Three.js viewer.

```bash
pnpm ingest:product flyn-cotbed --generate   # new Meshy attempt, then everything through to the viewer
pnpm ingest:product flyn-cotbed              # same, reusing the latest Meshy attempt (no paid request)
```

See [docs/ingestion-pipeline.md](docs/ingestion-pipeline.md) for configuration, checks, artifact layout and failure modes.
