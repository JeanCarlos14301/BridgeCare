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

/** Toolbar content for the open case: title, status, and the revision being reviewed. */
export function CaseHeader({ caseView, title }: { caseView: CaseView; title: string | null }) {
  const status = STATUS[caseView.status];
  const revision = caseView.revision;
  return (
    <div className="case-header">
      <div className="case-title">
        <h1>{title ?? caseView.fixture_id}</h1>
        <span key={caseView.status} className={`status status-${status.tone}`}>
          <Icon name={status.icon} size={13} />
          Status: {status.label}
        </span>
        {caseView.failure_reason && <code className="code-chip">{caseView.failure_reason}</code>}
      </div>
      {revision && (
        <dl className="case-meta">
          <div>
            <dt>Revision</dt>
            <dd>{revision.number}</dd>
          </div>
          <div>
            <dt>Origin</dt>
            <dd>{revision.origin === "model" ? "Model output" : "Reviewer edit"}</dd>
          </div>
          <div>
            <dt>Prompt</dt>
            <dd>{revision.prompt_version}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
