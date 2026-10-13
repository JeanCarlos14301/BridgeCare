import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { api, isConflict, type PatientView, type Role } from "../api";
import { shortHash } from "../lib/caseStats";
import { Icon, type IconName } from "./Icon";

type Language = PatientView["language"];
type Mode = "approved" | "preview";

/*
 * Fixed labels of the patient sheet. Patient-facing translations are data, not UI copy; every value
 * on the sheet (summary, medications, instructions, notice) comes from the API in the chosen language.
 */
const LABELS: Record<Language, Record<string, string>> = {
  en: {
    title: "Your discharge instructions",
    approved: "Approved",
    revision: "Revision",
    medications: "Medications",
    none: "No medications listed.",
    followUp: "Follow-up",
    warnings: "Warning signs",
    activity: "Activity",
    diet: "Diet",
    name: "Medication",
    dose: "Dose",
    unit: "Unit",
    route: "Route",
    frequency: "Frequency",
    duration: "Duration",
  },
  es: {
    title: "Sus instrucciones de alta",
    approved: "Aprobado",
    revision: "Revisión",
    medications: "Medicamentos",
    none: "No hay medicamentos indicados.",
    followUp: "Seguimiento",
    warnings: "Señales de alarma",
    activity: "Actividad",
    diet: "Dieta",
    name: "Medicamento",
    dose: "Dosis",
    unit: "Unidad",
    route: "Vía",
    frequency: "Frecuencia",
    duration: "Duración",
  },
};

const MEDICATION_COLUMNS = ["name", "dose", "unit", "route", "frequency", "duration"] as const;

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

function Sheet({ view, mode }: { view: PatientView; mode: Mode }) {
  const text = LABELS[view.language];
  const approvedAt = new Date(view.approved_at);
  return (
    <article className="printable" lang={view.language}>
      <header className="sheet-header">
        <div>
          <p className="sheet-brand">
            <span className="wordmark-mark" aria-hidden="true" />
            BridgeCare
          </p>
          <h3>{text.title}</h3>
        </div>
        {mode === "approved" && (
          <p className="sheet-meta">
            {text.approved}{" "}
            {Number.isNaN(approvedAt.getTime()) ? view.approved_at : approvedAt.toLocaleDateString(view.language)}
            <br />
            {text.revision} <code>{shortHash(view.revision_id, 8)}</code>
          </p>
        )}
      </header>
      {view.summary && <p className="sheet-summary">{view.summary}</p>}

      <SheetSection icon="pill" title={text.medications}>
        {view.medications.length ? (
          <table className="sheet-table">
            <thead>
              <tr>
                {MEDICATION_COLUMNS.map((key) => (
                  <th key={key} scope="col">
                    {text[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.medications.map((medication, index) => (
                <tr key={index}>
                  {MEDICATION_COLUMNS.map((key) => (
                    <td key={key} data-label={text[key]}>
                      {medication[key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>{text.none}</p>
        )}
      </SheetSection>

      {view.follow_up.length > 0 && (
        <SheetSection icon="calendar" title={text.followUp}>
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
        <SheetSection icon="alert" title={text.warnings}>
          <ul>
            {view.warning_signs.map((sign, index) => (
              <li key={index}>{sign}</li>
            ))}
          </ul>
        </SheetSection>
      )}
      {view.activity && (
        <SheetSection icon="pulse" title={text.activity}>
          <p>{view.activity}</p>
        </SheetSection>
      )}
      {view.diet && (
        <SheetSection icon="utensils" title={text.diet}>
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

export function PatientSheet({
  caseId,
  approved = false,
  role = "visitor",
}: {
  caseId: string;
  approved?: boolean;
  role?: Role;
}) {
  const [view, setView] = useState<PatientView | null>(null);
  const [mode, setMode] = useState<Mode>("approved");
  const [language, setLanguage] = useState<Language>("en");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!view || !element || element.open) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
  }, [view]);

  const load = async (nextMode: Mode, nextLanguage: Language) => {
    setLoading(true);
    // Only an approved revision reaches the patient view; the preview is reviewer-only and never printed.
    const path = nextMode === "approved" ? "patient-view" : "preview";
    try {
      setView(await api<PatientView>(`/cases/${caseId}/${path}?lang=${nextLanguage}`));
      setMode(nextMode);
      setLanguage(nextLanguage);
      setMessage(null);
    } catch (error) {
      setMessage(
        isConflict(error)
          ? nextMode === "approved"
            ? "Patient view is blocked until the current revision has a valid approval."
            : "There is no revision to preview yet."
          : "Patient view could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    dialog.current?.close();
    setView(null);
  };

  const canPreview = role === "reviewer" && !approved;

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
              ? "Unlocked: this revision has a valid approval. Available in English and Spanish."
              : "Locked until a reviewer approves the current revision."}
          </p>
        </div>
      </div>
      <div className="button-row">
        {canPreview ? (
          <button type="button" className="button" disabled={loading} onClick={() => load("preview", "en")}>
            <Icon name="eye" size={16} />
            Preview before approval
          </button>
        ) : (
          <button
            type="button"
            className={approved ? "button button-primary" : "button"}
            disabled={loading}
            onClick={() => load("approved", "en")}
          >
            Open patient sheet
          </button>
        )}
      </div>
      {message && (
        <p className="alert" role="alert">
          {message}
        </p>
      )}
      {view &&
        createPortal(
          <dialog
            ref={dialog}
            className={`dialog sheet-dialog${mode === "preview" ? " is-preview" : ""}`}
            aria-label={mode === "preview" ? "Patient sheet preview" : "Patient sheet"}
            onClose={() => setView(null)}
          >
            <div className="sheet-dialog-bar">
              <div className="language-toggle" role="group" aria-label="Sheet language">
                {(["en", "es"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="filter-option"
                    aria-pressed={language === option}
                    disabled={loading}
                    onClick={() => option !== language && load(mode, option)}
                  >
                    {option === "en" ? "English" : "Español"}
                  </button>
                ))}
              </div>
              <div className="button-row">
                {mode === "approved" && (
                  <button type="button" className="button button-primary" onClick={() => window.print()}>
                    <Icon name="printer" size={16} />
                    Print
                  </button>
                )}
                <button type="button" className="button" onClick={close}>
                  Close
                </button>
              </div>
            </div>
            {mode === "preview" && (
              <p className="preview-banner" role="note">
                <Icon name="alert" size={14} />
                Preview of revision content that is not approved yet. Not for the patient; printing is disabled.
              </p>
            )}
            <Sheet view={view} mode={mode} />
          </dialog>,
          document.body,
        )}
    </section>
  );
}
