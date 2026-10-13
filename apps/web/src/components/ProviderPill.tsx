import type { ProviderMode, Revision } from "../api";
import { formatDuration } from "../lib/caseStats";
import { Icon } from "./Icon";

// Name the provider only from the configured hostname that /health reports; never guess it.
export function providerLabel(host: string | null): string {
  if (host && /(^|\.)amd\.com(\.cn)?$/.test(host)) return "AMD Token Factory";
  return host ? `Remote model · ${host}` : "Live model";
}

// Values come only from API responses.
export function ProviderPill({
  mode,
  host,
  revision,
  requestId,
}: {
  mode: ProviderMode | null;
  host: string | null;
  revision: Revision | null;
  requestId: string | null;
}) {
  if (mode === null) return null;
  if (mode === "mock") {
    return (
      <span
        className="pill pill-mock"
        title="The mock provider replays recorded fixture responses."
      >
        <span className="pulse-dot" aria-hidden="true" />
        MOCK · recorded responses
      </span>
    );
  }
  const parts = [providerLabel(host)];
  if (revision?.model) parts.push(revision.model);
  if (revision?.timings.model_ms != null)
    parts.push(formatDuration(revision.timings.model_ms));
  if (requestId) parts.push(`req ${requestId.slice(0, 8)}`);
  return (
    <span
      className="pill pill-live"
      title={requestId ? `Request ID ${requestId}` : undefined}
    >
      <Icon name="zap" size={14} />
      {parts.join(" · ")}
    </span>
  );
}
