import type { CaseView } from "../api";

const STATUS: Record<CaseView["status"], { glyph: string; label: string; tone: string }> = {
  received: { glyph: "•", label: "Received", tone: "neutral" },
  processing: { glyph: "…", label: "Processing", tone: "neutral" },
  needs_review: { glyph: "?", label: "Needs review", tone: "warning" },
  approved: { glyph: "✓", label: "Approved", tone: "success" },
  rejected: { glyph: "✕", label: "Rejected", tone: "danger" },
  failed: { glyph: "!", label: "Failed", tone: "danger" },
};

export function CaseHeader({ caseView }: { caseView: CaseView }) {
  const status = STATUS[caseView.status];
  const revision = caseView.revision;
  return (
    <div className="case-header">
      <span className={`status status-${status.tone}`}>
        <span aria-hidden="true">{status.glyph}</span>
        Status: {status.label}
      </span>
      {caseView.failure_reason && <code className="code-chip">{caseView.failure_reason}</code>}
      {revision && (
        <span className="muted case-meta">
          Revision {revision.number} · {revision.origin === "model" ? "model output" : "reviewer edit"} · prompt{" "}
          {revision.prompt_version}
        </span>
      )}
    </div>
  );
}
