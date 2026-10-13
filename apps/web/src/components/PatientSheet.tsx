import { type ReactNode, useEffect, useRef, useState } from "react";

import { api, isConflict, type PatientView } from "../api";
import { shortHash } from "../lib/caseStats";
import { Icon, type IconName } from "./Icon";

const MEDICATION_COLUMNS = [
  ["name", "Medication"],
  ["dose", "Dose"],
  ["unit", "Unit"],
  ["route", "Route"],
  ["frequency", "Frequency"],
  ["duration", "Duration"],
] as const;

function SheetSection({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="sheet-section">
      <h4>
        <Icon name={icon} size={16} />
        {title}
      </h4>
      {children}
    </section>
  );
}

function Sheet({ view }: { view: PatientView }) {
  const approvedAt = new Date(view.approved_at);
  return (
    <article className="printable" lang="en">
      <header className="sheet-header">
        <div>
          <p className="sheet-brand">
            <span className="wordmark-mark" aria-hidden="true" />
            BridgeCare
          </p>
          <h3>Your discharge instructions</h3>
        </div>
        <p className="sheet-meta">
          Approved {Number.isNaN(approvedAt.getTime()) ? view.approved_at : approvedAt.toLocaleDateString()}
          <br />
          Revision <code>{shortHash(view.revision_id, 8)}</code>
        </p>
      </header>
      {view.summary && <p className="sheet-summary">{view.summary}</p>}

      <SheetSection icon="pill" title="Medications">
        {view.medications.length ? (
          <table className="sheet-table">
            <thead>
              <tr>
                {MEDICATION_COLUMNS.map(([key, heading]) => (
                  <th key={key} scope="col">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.medications.map((medication, index) => (
                <tr key={index}>
                  {MEDICATION_COLUMNS.map(([key, heading]) => (
                    <td key={key} data-label={heading}>
                      {medication[key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No medications listed.</p>
        )}
      </SheetSection>

      {view.follow_up.length > 0 && (
        <SheetSection icon="calendar" title="Follow-up">
          <ul>
            {view.follow_up.map((item, index) => (
              <li key={index}>
                {item.instruction}
                {item.timeframe ? ` (${item.timeframe})` : ""}
              </li>
            ))}
          </ul>
        </SheetSection>
      )}
      {view.warning_signs.length > 0 && (
        <SheetSection icon="alert" title="Warning signs">
          <ul>
            {view.warning_signs.map((sign, index) => (
              <li key={index}>{sign}</li>
            ))}
          </ul>
        </SheetSection>
      )}
      {view.activity && (
        <SheetSection icon="pulse" title="Activity">
          <p>{view.activity}</p>
        </SheetSection>
      )}
      {view.diet && (
        <SheetSection icon="utensils" title="Diet">
          <p>{view.diet}</p>
        </SheetSection>
      )}
      <p className="sheet-notice">
        <Icon name="info" size={14} />
        {view.notice}
      </p>
    </article>
  );
}

export function PatientSheet({ caseId, approved = false }: { caseId: string; approved?: boolean }) {
  const [view, setView] = useState<PatientView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!view || !element || element.open) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
  }, [view]);

  const load = async () => {
    try {
      setView(await api<PatientView>(`/cases/${caseId}/patient-view`));
      setMessage(null);
    } catch (error) {
      setView(null);
      setMessage(
        isConflict(error)
          ? "Patient view is blocked until the current revision has a valid approval."
          : "Patient view could not be loaded.",
      );
    }
  };

  const close = () => {
    dialog.current?.close();
    setView(null);
  };

  return (
    <section className={`card patient-panel${approved ? " is-unlocked" : ""}`} aria-labelledby="patient-title">
      <div className="patient-head">
        <span className="lock-badge">
          <Icon name={approved ? "unlock" : "lock"} size={18} />
        </span>
        <div>
          <h2 id="patient-title">Patient sheet</h2>
          <p className="muted">
            {approved
              ? "Unlocked: this revision has a valid approval."
              : "Locked until a reviewer approves the current revision."}
          </p>
        </div>
      </div>
      <div className="button-row">
        <button type="button" className={approved ? "button button-primary" : "button"} onClick={load}>
          Open patient sheet
        </button>
      </div>
      {message && (
        <p className="alert" role="alert">
          {message}
        </p>
      )}
      {view && (
        <dialog ref={dialog} className="dialog sheet-dialog" aria-label="Patient sheet" onClose={() => setView(null)}>
          <div className="sheet-dialog-bar">
            <p className="sheet-dialog-title">Patient sheet preview</p>
            <div className="button-row">
              <button type="button" className="button button-primary" onClick={() => window.print()}>
                <Icon name="printer" size={16} />
                Print
              </button>
              <button type="button" className="button" onClick={close}>
                Close
              </button>
            </div>
          </div>
          <Sheet view={view} />
        </dialog>
      )}
    </section>
  );
}
