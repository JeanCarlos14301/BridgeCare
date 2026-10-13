import type { ProviderMode, Revision } from "../api";

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1)} s`;
}

// Values come only from API responses. The AMD label and telemetry drawer arrive with WP5, once
// /health reports the inference host.
export function ProviderPill({ mode, revision }: { mode: ProviderMode | null; revision: Revision | null }) {
  if (mode === null) return null;
  if (mode === "mock") {
    return (
      <span className="pill pill-mock" title="The mock provider replays recorded fixture responses.">
        <span aria-hidden="true">●</span>
        MOCK · recorded responses
      </span>
    );
  }
  const parts = ["Live model"];
  if (revision?.model) parts.push(revision.model);
  if (revision?.timings.model_ms != null) parts.push(formatSeconds(revision.timings.model_ms));
  return (
    <span className="pill pill-live">
      <span aria-hidden="true">⚡</span>
      {parts.join(" · ")}
    </span>
  );
}
