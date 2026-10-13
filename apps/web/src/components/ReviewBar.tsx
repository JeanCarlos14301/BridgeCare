import type { CaseView, Revision, Role } from "../api";

type Decision = "approve" | "reject";

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
  return (
    <section className="card review-bar" aria-labelledby="review-title">
      <p className="eyebrow">Reviewer decision</p>
      <h2 id="review-title">Review. Verify. Approve.</h2>
      {currentReview && (
        <p className={`decision decision-${currentReview.decision}`}>
          <span aria-hidden="true">{currentReview.decision === "approve" ? "✓ " : "✕ "}</span>
          Revision {props.revision.number} was {currentReview.decision === "approve" ? "approved" : "rejected"}.
        </p>
      )}
      {props.role === "reviewer" ? (
        <>
          <label className="field-label" htmlFor="resolution-note">
            Resolution note
            {gate.requires_resolution_note && <span className="required"> (required, 10+ characters)</span>}
          </label>
          <textarea
            id="resolution-note"
            placeholder="Explain how each conflict was resolved"
            value={props.note}
            onChange={(event) => props.onNoteChange(event.target.value)}
          />
          <div className="button-row">
            <button
              type="button"
              className="button button-danger"
              disabled={props.busy}
              onClick={() => props.onDecide("reject")}
            >
              Reject revision
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={props.busy || !gate.approvable}
              onClick={() => props.onDecide("approve")}
            >
              Approve revision {props.revision.number}
            </button>
          </div>
          {!gate.approvable && <p className="muted">Approval is blocked until the gate reasons are resolved.</p>}
        </>
      ) : (
        <p className="muted">Log in as a reviewer to make a decision.</p>
      )}
    </section>
  );
}
