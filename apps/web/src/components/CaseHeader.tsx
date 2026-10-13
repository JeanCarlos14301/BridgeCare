import type { ReactNode } from "react";

import type { CaseView } from "../api";
import { formatDuration } from "../lib/caseStats";
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
export function CaseHeader({
  caseView,
  title,
  description = null,
  actions,
}: {
  caseView: CaseView;
  title: string | null;
  description?: string | null;
  actions?: ReactNode;
}) {
  const status = STATUS[caseView.status];
  const revision = caseView.revision;
  return (
    <div className="case-header">
      <div className="case-title">
        <div className="case-name">
          <h1>{title ?? caseView.fixture_id}</h1>
          {description && <p className="case-description">{description}</p>}
        </div>
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
            <dt>Prompt</dt>
            <dd>{revision.prompt_version}</dd>
          </div>
          <div>
            <dt>Processing</dt>
            <dd>{formatDuration(revision.timings.total_ms)}</dd>
          </div>
          {caseView.review?.revision_id === revision.revision_id && caseView.review.duration_ms != null && (
            <div>
              <dt>Review time</dt>
              <dd>{formatDuration(caseView.review.duration_ms)}</dd>
            </div>
          )}
        </dl>
      )}
      {actions && <div className="case-actions">{actions}</div>}
    </div>
  );
}
