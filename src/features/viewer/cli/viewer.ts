import path from "node:path";
import { parseArgs } from "node:util";
import { env } from "../../../shared/env";
import { DEFAULT_OUTPUT_ROOT } from "../../ingestion/storage/constants";
import { DEFAULT_VIEWER_PRODUCT } from "../client/constants";
import { lineupUrl, startViewerServer, viewerUrl } from "../server";

/**
 * `pnpm viewer [--output output]` serves the inspection viewer for runs already on disk
 * (`pnpm ingest:product` starts it automatically). Open `/?product=<slug>[&run=<runId>]`, or
 * `/?mode=lineup` for every product's latest run side by side.
 */
const { values: args } = parseArgs({ options: { output: { type: "string", default: DEFAULT_OUTPUT_ROOT } } });
const server = startViewerServer({ outputRoot: args.output, port: env.PORT, development: env.NODE_ENV !== "production" });
console.log(`[viewer] ${viewerUrl(server.port ?? env.PORT, DEFAULT_VIEWER_PRODUCT)} (serving ${path.resolve(args.output)})`);
console.log(`[viewer] ${lineupUrl(server.port ?? env.PORT)} (all products in a row)`);
