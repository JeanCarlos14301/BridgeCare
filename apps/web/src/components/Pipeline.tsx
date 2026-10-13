import type { CSSProperties } from "react";

import type { CaseView } from "../api";
import { citationStats, listFields, pageCount } from "../lib/caseStats";
import { Icon, type IconName } from "./Icon";

type StepState = "idle" | "active" | "done" | "warn" | "blocked";
type Step = { id: string; label: string; detail: string; icon: IconName; state: StepState };

const STATE_TEXT: Record<StepState, string> = {
  idle: "not started",
  active: "in progress",
  done: "done",
  warn: "needs attention",
  blocked: "blocked",
};

const IDLE: Step[] = [
  { id: "source", label: "Source", detail: "Synthetic discharge document", icon: "file", state: "idle" },
  { id: "extract", label: "Extract", detail: "Model drafts fields with quotes", icon: "cpu", state: "idle" },
  { id: "verify", label: "Verify", detail: "Every quote checked on its page", icon: "quote", state: "idle" },
  { id: "gate", label: "Gate", detail: "Unsafe output is blocked", icon: "shield", state: "idle" },
  { id: "review", label: "Review", detail: "A person approves the exact revision", icon: "userCheck", state: "idle" },
  { id: "sheet", label: "Patient sheet", detail: "Released only after approval", icon: "lock", state: "idle" },
];

function steps(caseView: CaseView | null, processing: boolean): Step[] {
  const [source, extract, verify, gate, review, sheet] = IDLE.map((step) => ({ ...step }));
  if (processing) {
    source.state = "done";
    extract.state = "active";
    extract.detail = "Model is extracting…";
    return [source, extract, verify, gate, review, sheet];
  }
  if (!caseView) return IDLE;

  const pages = pageCount(caseView);
  source.state = "done";
  source.detail = `${pages} page${pages === 1 ? "" : "s"} loaded`;
  const revision = caseView.revision;
  if (!revision) {
    extract.state = caseView.status === "failed" ? "blocked" : "active";
    extract.detail = caseView.failure_reason ? `Failed: ${caseView.failure_reason}` : "No revision produced";
    return [source, extract, verify, gate, review, sheet];
  }

  extract.state = "done";
  extract.detail = revision.model;
  const quotes = citationStats(listFields(revision), revision.gate);
  verify.state = quotes.verified === quotes.total ? "done" : "blocked";
  verify.detail = `${quotes.verified} of ${quotes.total} quotes found`;

  const reasons = revision.gate.blocking_reasons.length;
  if (reasons === 0) {
    gate.state = "done";
    gate.detail = "No blocking reasons";
  } else if (revision.gate.approvable && caseView.status === "approved") {
    gate.state = "done";
    gate.detail = "Resolved in the reviewer's note";
  } else if (revision.gate.approvable) {
    gate.state = "warn";
    gate.detail = "Resolution note required";
  } else {
    gate.state = "blocked";
    gate.detail = `Blocked by ${reasons} reason${reasons === 1 ? "" : "s"}`;
  }

  if (caseView.status === "approved") {
    review.state = "done";
    review.detail = "Approved";
    sheet.state = "done";
    sheet.icon = "unlock";
    sheet.detail = "Unlocked for printing";
  } else if (caseView.status === "rejected") {
    review.state = "blocked";
    review.detail = "Rejected";
  } else {
    review.state = "active";
    review.detail = "Awaiting a reviewer";
  }
  return [source, extract, verify, gate, review, sheet];
}

/**
 * The safety pipeline. "strip" is the compact status bar under the toolbar; "guide" explains the
 * flow on the empty start screen. Every state comes from the case response.
 */
export function Pipeline(props: { caseView: CaseView | null; processing: boolean; variant: "strip" | "guide" }) {
  const list = steps(props.caseView, props.processing);
  return (
    <section className={`pipeline-${props.variant}`} aria-labelledby={`pipeline-${props.variant}-title`}>
      <h2 id={`pipeline-${props.variant}-title`} className="sr-only">
        Safety pipeline
      </h2>
      <ol className="pipeline">
        {list.map((step, index) => (
          <li
            key={step.id}
            className={`pipeline-step step-${step.state}`}
            style={{ "--i": index } as CSSProperties}
          >
            <span className="step-icon">
              <Icon name={step.state === "done" && props.variant === "strip" ? "check" : step.icon} size={14} />
            </span>
            <span className="step-text">
              <span className="step-label">
                {step.label}
                <span className="sr-only">, {STATE_TEXT[step.state]}</span>
              </span>
              <span className="step-detail">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
