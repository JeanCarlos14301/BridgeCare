import type { CaseView, Revision, Role } from "../api";
import { shortHash } from "../lib/caseStats";
import { Icon } from "./Icon";

type Decision = "approve" | "reject";
const NOTE_MINIMUM = 10;

function DecisionMark({ approved }: { approved: boolean }) {
  return (
    <svg className={`decision-mark ${approved ? "is-approved" : "is-rejected"}`} viewBox="0 0 52 52" aria-hidden="true">
      <circle className="decision-ring" cx="26" cy="26" r="23" />
      <path className="decision-stroke" d={approved ? "M15 27l7.5 7.5L37.5 19" : "M18 18l16 16M34 18L18 34"} />
    </svg>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ReviewBar(props: {
  role: Role;
  revision: Revision;
  review: CaseView["review"];
  note: string;
  onNoteChange: (note: string) => void;
  onDecide: (decision: Decision) => void;
  busy: boolean;
}) {
  const { gate } = props.revision;
  const currentReview = props.review?.revision_id === props.revision.revision_id ? props.review : null;
  const noteLength = props.note.trim().length;
  const noteReady = !gate.requires_resolution_note || noteLength >= NOTE_MINIMUM;

  return (
    <section className="card review-bar" aria-labelledby="review-title">
      <h2 id="review-title">Reviewer decision</h2>

      {currentReview ? (
        <div className={`decision-panel decision-${currentReview.decision}`}>
          <DecisionMark approved={currentReview.decision === "approve"} />
          <div>
            <p className="decision">
              Revision {props.revision.number} was {currentReview.decision === "approve" ? "approved" : "rejected"}.
            </p>
            <p className="muted decision-meta">
              {formatTime(currentReview.reviewed_at)} · content hash{" "}
              <code title={currentReview.content_hash}>{shortHash(currentReview.content_hash)}</code>
            </p>
            {currentReview.resolution_note && <p className="decision-note">“{currentReview.resolution_note}”</p>}
            <p className="muted">This case is no longer awaiting a decision.</p>
          </div>
        </div>
      ) : props.role === "reviewer" ? (
        <>
          <ol className="review-steps">
            <li className="is-current">Check every flagged field against its quote</li>
            {gate.requires_resolution_note && (
              <li className={noteReady ? "is-done" : "is-current"}>Explain how each conflict was resolved</li>
            )}
            <li className={noteReady && gate.approvable ? "is-current" : ""}>Approve or reject this exact revision</li>
          </ol>
          <label className="field-label" htmlFor="resolution-note">
            Resolution note
            {gate.requires_resolution_note && <span className="required"> (required, 10+ characters)</span>}
          </label>
          <textarea
            id="resolution-note"
            placeholder="Explain how each conflict was resolved"
            value={props.note}
            aria-describedby="note-count"
            onChange={(event) => props.onNoteChange(event.target.value)}
          />
          <p id="note-count" className={`note-count${noteReady ? " is-ready" : ""}`}>
            {gate.requires_resolution_note
              ? `${noteLength} of ${NOTE_MINIMUM} characters minimum`
              : `${noteLength} characters (optional)`}
          </p>
          <div className="button-row">
            <button
              type="button"
              className="button button-danger"
              disabled={props.busy}
              onClick={() => props.onDecide("reject")}
            >
              <Icon name="x" size={16} />
              Reject revision
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={props.busy || !gate.approvable}
              onClick={() => props.onDecide("approve")}
            >
              <Icon name="check" size={16} />
              Approve revision {props.revision.number}
            </button>
          </div>
          {!gate.approvable && <p className="muted">Approval is blocked until the gate reasons are resolved.</p>}
          <p className="muted fine-print">
            Approval binds to revision <code>{shortHash(props.revision.revision_id, 8)}</code> and content hash{" "}
            <code title={props.revision.content_hash}>{shortHash(props.revision.content_hash)}</code>.
          </p>
        </>
      ) : (
        <div className="locked-callout">
          <Icon name="lock" size={18} />
          <p>Log in as a reviewer to make a decision.</p>
        </div>
      )}
    </section>
  );
}
