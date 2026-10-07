# Products

The catalogue the rest of the system works from. Each product has a frozen source record: title, merchant images and **authoritative dimensions in millimetres**. Each product also has an ingestion profile that says which images to send to the 3D provider, how the provider's axes map to width, depth and height, and which provider settings to use.

## Where it fits

```
[products] → generation → ingestion → viewer
```

This is the start of the flow. Generation takes its images from here. Ingestion takes the dimensions it corrects the model to. The viewer takes the list of products it can show.

## What's here

- `product.ts`: the product source schema.
- `mocks/`: the frozen records for each product (Flynn Cotbed, Moses Basket, Penrose Nursing Chair & Stool, Flyn Dresser Changer).
- `profiles.ts`: one ingestion profile per product, keyed by slug (`flyn-cotbed`, `moses-basket`, `penrose-nursing-chair-stool`, `flyn-dresser-changer`).

Profiles are multi-view by default. Send every clean packshot of the configuration being modelled, up to Meshy's limit of 4, with the primary (front) view first. Leave out lifestyle shots, close-ups and shots that show other objects or a different configuration. Merchant galleries rarely include a back view, so a side profile is usually the best second view.

A set sold as one product (the Penrose chair and footstool) is one model, arranged as in the merchant's set packshot. Ingestion corrects to a single bounding box, so the set's overall dimensions are needed; when the merchant only gives per-piece sizes, estimate the overall size from the packshot and record how.

To add a product, add a record to `mocks/` and a profile to `profiles.ts`.
