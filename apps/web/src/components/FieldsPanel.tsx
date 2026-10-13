import type { MouseEvent, ReactNode } from "react";

import type { Citation, EvidenceState, Revision } from "../api";
import { EvidenceBadge } from "./EvidenceBadge";
import { chipId, type SelectField, type Selection } from "./selection";

const MEDICATION_KEYS = ["dose", "unit", "route", "frequency", "duration"] as const;

type FieldProps = {
  fieldKey: string;
  state: EvidenceState;
  citations?: Citation[];
  selection: Selection | null;
  onSelect: SelectField;
};

function CitationChips({ fieldKey, state, citations = [], selection, onSelect }: FieldProps) {
  if (citations.length === 0) return <span className="no-citation">No citation</span>;
  return (
    <span className="citation-chips">
      {citations.map((citation, index) => (
        <button
          type="button"
          id={chipId(fieldKey, index)}
          className="citation"
          key={`${citation.document_id}-${citation.page}-${index}`}
          aria-pressed={selection?.fieldKey === fieldKey && selection.index === index}
          aria-label={`Show quote on page ${citation.page}`}
          onClick={() => onSelect(fieldKey, citations, index, state)}
        >
          p. {citation.page}
        </button>
      ))}
    </span>
  );
}

/** Activating a field card shows its first citation. Chips inside handle their own clicks. */
function cardClick(field: FieldProps) {
  return (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest("button")) return;
    if (field.citations?.length) field.onSelect(field.fieldKey, field.citations, 0, field.state);
  };
}

function FieldLabel({ field, children }: { field: FieldProps; children: ReactNode }) {
  if (!field.citations?.length) return <span className="field-name">{children}</span>;
  return (
    <button
      type="button"
      className="field-name field-name-button"
      onClick={() => field.onSelect(field.fieldKey, field.citations ?? [], 0, field.state)}
    >
      {children}
    </button>
  );
}

function selectedClass(field: FieldProps) {
  return field.selection?.fieldKey === field.fieldKey ? " is-selected" : "";
}

function TextField(props: FieldProps & { text: string }) {
  return (
    <li className={`compact-field state-${props.state}${selectedClass(props)}`} onClick={cardClick(props)}>
      <EvidenceBadge state={props.state} />
      <span className="compact-text">
        <FieldLabel field={props}>{props.text}</FieldLabel>
      </span>
      <CitationChips {...props} />
    </li>
  );
}

export function FieldsPanel(props: { revision: Revision; selection: Selection | null; onSelect: SelectField }) {
  const { extracted_fields: fields, uncertainties } = props.revision;
  const shared = { selection: props.selection, onSelect: props.onSelect };
  return (
    <section className="card fields-panel" aria-labelledby="fields-title">
      <p className="eyebrow">Extracted fields</p>
      <h2 id="fields-title">Check every value against its source.</h2>
      <p className="muted hint">
        Select a field or a <span className="kbd-chip">p. N</span> chip to jump to its quote. With several citations,
        press <kbd>[</kbd> and <kbd>]</kbd> to move between them.
      </p>

      <h3>Medications</h3>
      {fields.medications.length === 0 && <p className="muted">No medications extracted.</p>}
      <div className="field-list">
        {fields.medications.map((medication, index) => {
          const field: FieldProps = {
            fieldKey: `medications[${index}]`,
            state: medication.evidence_state,
            citations: medication.citations,
            ...shared,
          };
          return (
            <article
              className={`field-card state-${medication.evidence_state}${selectedClass(field)}`}
              key={index}
              onClick={cardClick(field)}
            >
              <div className="field-heading">
                <FieldLabel field={field}>
                  <strong>{medication.name ?? "Unnamed medication"}</strong>
                </FieldLabel>
                <EvidenceBadge state={medication.evidence_state} />
              </div>
              <dl className="field-values">
                {MEDICATION_KEYS.map((key) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd className={medication[key] ? undefined : "not-stated"}>{medication[key] ?? "Not stated"}</dd>
                  </div>
                ))}
              </dl>
              <CitationChips {...field} />
            </article>
          );
        })}
      </div>

      <h3>Follow-up</h3>
      <ul className="compact-list">
        {fields.follow_up.map((item, index) => (
          <TextField
            key={index}
            fieldKey={`follow_up[${index}]`}
            state={item.evidence_state}
            text={`${item.instruction ?? "Not stated"}${item.timeframe ? ` (${item.timeframe})` : ""}`}
            citations={item.citations}
            {...shared}
          />
        ))}
      </ul>

      <h3>Warning signs</h3>
      <ul className="compact-list">
        {fields.warning_signs.map((item, index) => (
          <TextField
            key={index}
            fieldKey={`warning_signs[${index}]`}
            state={item.evidence_state}
            text={item.text ?? "Not stated"}
            citations={item.citations}
            {...shared}
          />
        ))}
      </ul>

      <h3>Activity and diet</h3>
      <ul className="compact-list">
        <TextField
          fieldKey="activity"
          state={fields.activity.evidence_state}
          text={`Activity: ${fields.activity.text ?? "Not stated"}`}
          citations={fields.activity.citations}
          {...shared}
        />
        <TextField
          fieldKey="diet"
          state={fields.diet.evidence_state}
          text={`Diet: ${fields.diet.text ?? "Not stated"}`}
          citations={fields.diet.citations}
          {...shared}
        />
      </ul>

      <h3>Uncertainties</h3>
      <ul className="uncertainties">
        {uncertainties.length ? (
          uncertainties.map((item) => (
            <li key={item.field}>
              <code className="code-chip">{item.field}</code> {item.note}
            </li>
          ))
        ) : (
          <li className="muted">None recorded.</li>
        )}
      </ul>
    </section>
  );
}
