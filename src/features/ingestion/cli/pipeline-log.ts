import type { RunManifest } from "../schemas";
import type { PipelineEvent } from "../run";
import { displayPath } from "../../../shared/utils/files";
import { formatNumber, formatScale } from "../../../shared/utils/format";

const EVENT_ICON = { "stage-start": "→", "stage-complete": "✓", "stage-failed": "✗", progress: "…", warning: "!" } as const;

/** One progress line per pipeline event. */
export function formatPipelineEvent(event: PipelineEvent): string {
  const icon = EVENT_ICON[event.type];
  switch (event.type) {
    case "stage-start":
      return `${icon} ${event.stage}`;
    case "stage-complete":
      return `${icon} ${event.stage} (${event.durationMs.toFixed(0)} ms)${event.summary ? `: ${event.summary}` : ""}`;
    case "stage-failed":
      return `${icon} ${event.stage} [${event.code}] ${event.message}`;
    default:
      return `  ${icon} ${event.message}`;
  }
}

const row = (label: string, value: string) => `${label.padEnd(18)}${value}`;
const mm = (v: number | null | undefined) => formatNumber(v, 2);
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

/** Multi-line, human-readable summary of a finished run. */
export function formatRunSummary(m: RunManifest, manifestPath: string): string {
  const target = m.authoritativeDimensionsMm;
  const lines = [
    "",
    `── ${m.title} (${m.sku ?? m.productId}) · run ${m.runId} ──`,
    row("status", m.status),
    row("raw GLB", m.rawAsset ? `${m.rawAsset.path} (${m.rawAsset.origin}, sha256 ${m.rawAsset.sha256.slice(0, 12)}…)` : "—"),
    row("corrected GLB", m.correctedAsset?.path ?? "— (none: see errors)"),
    row("manifest", displayPath(manifestPath)),
    row("authoritative mm", `W ${target?.width ?? "?"} · D ${target?.depth ?? "?"} · H ${target?.height ?? "?"}`),
  ];

  const p = m.rawProportions;
  if (p) {
    const e = p.proportionalErrorPct;
    lines.push(
      row(
        "raw proportions",
        `error vs ${p.referenceDimension}: W ${mm(e.width)}% · D ${mm(e.depth)}% · H ${mm(e.height)}%, scale spread ${mm(p.scaleSpreadPct)}%`,
      ),
    );
  }

  const check = m.proportionalCheck;
  if (check) {
    lines.push(row("proportion check", `${check.status}${check.reasonCodes.length ? ` (${check.reasonCodes.join(", ")})` : ""}`));
  }

  if (m.correction) {
    lines.push(row("correction", `${m.correction.type} · scale ${formatScale(m.correction.scaleFactors)} · grounded, centred`));
  }

  const v = m.dimensionalValidation;
  if (v) {
    const d = v.dimensions;
    lines.push(
      row(
        "validation",
        `${v.status} · W ${mm(d.width.measuredMm)} · D ${mm(d.depth.measuredMm)} · H ${mm(d.height.measuredMm)} mm · ground ${mm(v.groundOffsetMm)} mm`,
      ),
    );
  }

  const provider = m.provenance.provider;
  if (provider) {
    const reused = provider.reused ? " (reused, no new request)" : "";
    lines.push(
      row(
        "provider",
        `${provider.name} ${provider.model} job ${provider.jobId ?? "—"} attempt ${provider.attempt}${reused}, credits ${provider.credits ?? "n/a"}`,
      ),
    );
  }

  if (m.timings.totalMs !== null) {
    lines.push(row("timing", `total ${seconds(m.timings.totalMs)}, processing ${seconds(m.timings.processingMs ?? 0)}`));
  }
  for (const w of m.warnings) lines.push(row("warning", w));
  for (const e of m.errors) lines.push(row("error", `[${e.code}] ${e.message}`));
  return lines.join("\n");
}
