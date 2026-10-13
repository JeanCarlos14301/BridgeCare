import { useState } from "react";

import { api, isConflict, type PatientView } from "../api";

const MEDICATION_COLUMNS = [
  ["name", "Medication"],
  ["dose", "Dose"],
  ["unit", "Unit"],
  ["route", "Route"],
  ["frequency", "Frequency"],
  ["duration", "Duration"],
] as const;

function Sheet({ view }: { view: PatientView }) {
  return (
    <article className="printable" lang="en">
      <header className="sheet-header">
        <p className="sheet-brand">BridgeCare</p>
        <h3>Your discharge instructions</h3>
      </header>
      {view.summary && <p>{view.summary}</p>}

      <h4>Medications</h4>
      {view.medications.length ? (
        <div className="table-scroll">
          <table>
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
                  {MEDICATION_COLUMNS.map(([key]) => (
                    <td key={key}>{medication[key] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No medications listed.</p>
      )}

      {view.follow_up.length > 0 && (
        <>
          <h4>Follow-up</h4>
          <ul>
            {view.follow_up.map((item, index) => (
              <li key={index}>
                {item.instruction}
                {item.timeframe ? ` (${item.timeframe})` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
      {view.warning_signs.length > 0 && (
        <>
          <h4>Warning signs</h4>
          <ul>
            {view.warning_signs.map((sign, index) => (
              <li key={index}>{sign}</li>
            ))}
          </ul>
        </>
      )}
      {view.activity && (
        <>
          <h4>Activity</h4>
          <p>{view.activity}</p>
        </>
      )}
      {view.diet && (
        <>
          <h4>Diet</h4>
          <p>{view.diet}</p>
        </>
      )}
      <p className="sheet-notice">{view.notice}</p>
    </article>
  );
}

export function PatientSheet({ caseId }: { caseId: string }) {
  const [view, setView] = useState<PatientView | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <section className="card patient-panel" aria-labelledby="patient-title">
      <p className="eyebrow">Patient sheet</p>
      <h2 id="patient-title">Printable patient view</h2>
      <div className="button-row">
        <button type="button" className="button" onClick={load}>
          Open patient sheet
        </button>
        {view && (
          <button type="button" className="button button-primary" onClick={() => window.print()}>
            Print
          </button>
        )}
      </div>
      {message && (
        <p className="alert" role="alert">
          {message}
        </p>
      )}
      {view && <Sheet view={view} />}
    </section>
  );
}
