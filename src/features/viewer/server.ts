import path from "node:path";
import index from "./client/index.html";
import { ingestionProfiles } from "../products/profiles";
import { isValidRunId, listRunIds, readLatestRunId, readManifest } from "../ingestion/storage/store";
import { errorMessage } from "../../shared/utils/errors";
import { exists } from "../../shared/utils/files";

const error = (status: number, message: string) => Response.json({ error: message }, { status });

/**
 * Local server for the inspection viewer: serves the page, run manifests and corrected GLBs from the
 * output directory. Read-only, no authentication: a development tool, not for deployment.
 * `/api/products` lists products with a latest validated run on disk, for lineup mode.
 */
export function startViewerServer({ outputRoot, port, development }: { outputRoot: string; port: number; development: boolean }) {
  /** Validates `:slug` and `:runId`, mapping `latest` through the latest-run pointer. */
  async function resolve(params: { slug: string; runId: string }): Promise<{ slug: string; runId: string } | Response> {
    if (!ingestionProfiles[params.slug]) return error(404, `Unknown product "${params.slug}"`);
    const runId = params.runId === "latest" ? await readLatestRunId(outputRoot, params.slug) : params.runId;
    if (!runId) return error(404, `No completed run for ${params.slug} yet: run pnpm ingest:product ${params.slug}`);
    if (!isValidRunId(runId)) return error(400, "Invalid run id");
    return { slug: params.slug, runId };
  }

  return Bun.serve({
    port,
    development,
    routes: {
      "/": index,
      "/api/products": async () => {
        const products = [];
        for (const [slug, profile] of Object.entries(ingestionProfiles)) {
          const runId = await readLatestRunId(outputRoot, slug).catch(() => null);
          if (runId && isValidRunId(runId)) products.push({ slug, title: profile.source.title, runId });
        }
        return Response.json(products);
      },

      "/api/products/:slug/runs": async (req) => {
        if (!ingestionProfiles[req.params.slug]) return error(404, `Unknown product "${req.params.slug}"`);
        const runs = [];
        for (const runId of await listRunIds(outputRoot, req.params.slug)) {
          const m = await readManifest(outputRoot, req.params.slug, runId).catch(() => null);
          runs.push({ runId, status: m?.status ?? "UNREADABLE" });
        }
        return Response.json(runs);
      },

      "/api/products/:slug/runs/:runId": async (req) => {
        const target = await resolve(req.params);
        if (target instanceof Response) return target;
        try {
          return Response.json(await readManifest(outputRoot, target.slug, target.runId));
        } catch (e) {
          return error(404, errorMessage(e));
        }
      },

      "/api/products/:slug/runs/:runId/corrected.glb": async (req) => {
        const target = await resolve(req.params);
        if (target instanceof Response) return target;
        const manifest = await readManifest(outputRoot, target.slug, target.runId).catch(() => null);
        if (!manifest?.correctedAsset) return error(404, `Run ${target.runId} has no validated corrected GLB`);
        const file = path.resolve(manifest.correctedAsset.path);
        if (!(await exists(file))) return error(404, `Corrected GLB missing on disk: ${manifest.correctedAsset.path}`);
        return new Response(Bun.file(file), { headers: { "Content-Type": "model/gltf-binary", "Cache-Control": "no-store" } });
      },
    },
  });
}

export const viewerUrl = (port: number, slug: string, runId?: string) =>
  `http://localhost:${port}/?product=${encodeURIComponent(slug)}${runId ? `&run=${encodeURIComponent(runId)}` : ""}`;

export const lineupUrl = (port: number) => `http://localhost:${port}/?mode=lineup`;
