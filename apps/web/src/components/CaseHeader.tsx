import type { CaseView } from "../api";
import { Icon, type IconName } from "./Icon";

const STATUS: Record<CaseView["status"], { icon: IconName; label: string; tone: string }> = {
  received: { icon: "file", label: "Received", tone: "neutral" },
  processing: { icon: "cpu", label: "Processing", tone: "neutral" },
  needs_review: { icon: "help", label: "Needs review", tone: "warning" },
  approved: { icon: "check", label: "Approved", tone: "success" },
  rejected: { icon: "x", label: "Rejected", tone: "danger" },
  failed: { icon: "alert", label: "Failed", tone: "danger" },
};

export function CaseHeader({ caseView, title }: { caseView: CaseView; title: string | null }) {
  const status = STATUS[caseView.status];
  const revision = caseView.revision;
  return (
    <div className="case-header">
      <div className="case-title">
        <p className="eyebrow">Current case</p>
        <h2>{title ?? caseView.fixture_id}</h2>
      </div>
      <div className="case-badges">
        <span key={caseView.status} className={`status status-${status.tone}`}>
          <Icon name={status.icon} size={14} />
          Status: {status.label}
        </span>
        {caseView.failure_reason && <code className="code-chip">{caseView.failure_reason}</code>}
        {revision && (
          <span className="muted case-meta">
            Revision {revision.number} · {revision.origin === "model" ? "model output" : "reviewer edit"} ·{" "}
            prompt {revision.prompt_version}
          </span>
        )}
      </div>
    </div>
  );
}
