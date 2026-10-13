import type { CSSProperties, MouseEvent, ReactNode } from "react";

import type { Citation, EvidenceState, Revision } from "../api";
import { fieldKeyOf } from "../lib/caseStats";
import { EvidenceBadge } from "./EvidenceBadge";
import { Icon, type IconName } from "./Icon";
import { chipId, type SelectField, type Selection } from "./selection";

const MEDICATION_KEYS = ["dose", "unit", "route", "frequency", "duration"] as const;

type FieldProps = {
  fieldKey: string;
  state: EvidenceState;
  citations?: Citation[];
  selection: Selection | null;
  flashKey: string | null;
  notes: string[];
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
          <Icon name="quote" size={12} />
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

function cardClass(base: string, field: FieldProps) {
  const selected = field.selection?.fieldKey === field.fieldKey ? " is-selected" : "";
  const flashing = field.flashKey === field.fieldKey ? " is-flashing" : "";
  return `${base} state-${field.state}${selected}${flashing}`;
}

function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <ul className="field-notes">
      {notes.map((note, index) => (
        <li key={index}>
          <Icon name="info" size={14} />
          {note}
        </li>
      ))}
    </ul>
  );
}

function TextField(props: FieldProps & { text: string; index: number }) {
  return (
    <li
      className={cardClass("compact-field", props)}
      data-field-key={props.fieldKey}
      style={{ "--i": props.index } as CSSProperties}
      onClick={cardClick(props)}
    >
      <div className="compact-row">
        <EvidenceBadge state={props.state} />
        <span className="compact-text">
          <FieldLabel field={props}>{props.text}</FieldLabel>
        </span>
        <CitationChips {...props} />
      </div>
      <Notes notes={props.notes} />
    </li>
  );
}

function SectionTitle({ icon, title, count }: { icon: IconName; title: string; count?: number }) {
  return (
    <h3 className="section-title">
      <span className="section-icon">
        <Icon name={icon} size={15} />
      </span>
      {title}
      {count !== undefined && <span className="section-count">{count}</span>}
    </h3>
  );
}

export function FieldsPanel(props: {
  revision: Revision;
  selection: Selection | null;
  flashKey?: string | null;
  onSelect: SelectField;
}) {
  const { extracted_fields: fields, uncertainties } = props.revision;
  const notesFor = (key: string) =>
    uncertainties.filter((item) => fieldKeyOf(item.field) === key).map((item) => item.note);
  const knownKeys = new Set([
    ...fields.medications.map((_, index) => `medications[${index}]`),
    ...fields.follow_up.map((_, index) => `follow_up[${index}]`),
    ...fields.warning_signs.map((_, index) => `warning_signs[${index}]`),
    "activity",
    "diet",
  ]);
  const otherUncertainties = uncertainties.filter((item) => !knownKeys.has(fieldKeyOf(item.field)));
  const field = (fieldKey: string, state: EvidenceState, citations?: Citation[]): FieldProps => ({
    fieldKey,
    state,
    citations,
    selection: props.selection,
    flashKey: props.flashKey ?? null,
    notes: notesFor(fieldKey),
    onSelect: props.onSelect,
  });

  return (
    <section className="card fields-panel" aria-labelledby="fields-title">
      <p className="eyebrow">Extracted fields</p>
      <h2 id="fields-title">Check every value against its source.</h2>
      <p className="muted hint">
        Select a field or a <span className="kbd-chip">p. N</span> chip to jump to its quote. With several citations,
        press <kbd>[</kbd> and <kbd>]</kbd> to move between them.
      </p>

      <SectionTitle icon="pill" title="Medications" count={fields.medications.length} />
      {fields.medications.length === 0 && <p className="muted">No medications extracted.</p>}
      <div className="field-list">
        {fields.medications.map((medication, index) => {
          const card = field(`medications[${index}]`, medication.evidence_state, medication.citations);
          return (
            <article
              className={cardClass("field-card", card)}
              data-field-key={card.fieldKey}
              key={index}
              style={{ "--i": index } as CSSProperties}
              onClick={cardClick(card)}
            >
              <div className="field-heading">
                <span className="med-icon">
                  <Icon name="pill" size={18} />
                </span>
                <FieldLabel field={card}>
                  <strong className="med-name">{medication.name ?? "Unnamed medication"}</strong>
                </FieldLabel>
                <EvidenceBadge state={medication.evidence_state} />
              </div>
              <dl className="spec-grid">
                {MEDICATION_KEYS.map((key) => (
                  <div key={key} className={medication[key] ? "spec" : "spec spec-missing"}>
                    <dt>{key}</dt>
                    <dd>{medication[key] ?? "Not stated"}</dd>
                  </div>
                ))}
              </dl>
              <Notes notes={card.notes} />
              <div className="field-footer">
                <span className="field-footer-label">Evidence</span>
                <CitationChips {...card} />
              </div>
            </article>
          );
        })}
      </div>

      <SectionTitle icon="calendar" title="Follow-up" count={fields.follow_up.length} />
      <ul className="compact-list">
        {fields.follow_up.map((item, index) => (
          <TextField
            key={index}
            index={index}
            text={`${item.instruction ?? "Not stated"}${item.timeframe ? ` (${item.timeframe})` : ""}`}
            {...field(`follow_up[${index}]`, item.evidence_state, item.citations)}
          />
        ))}
      </ul>

      <SectionTitle icon="alert" title="Warning signs" count={fields.warning_signs.length} />
      <ul className="compact-list">
        {fields.warning_signs.map((item, index) => (
          <TextField
            key={index}
            index={index}
            text={item.text ?? "Not stated"}
            {...field(`warning_signs[${index}]`, item.evidence_state, item.citations)}
          />
        ))}
      </ul>

      <SectionTitle icon="pulse" title="Activity and diet" />
      <ul className="compact-list">
        <TextField
          index={0}
          text={`Activity: ${fields.activity.text ?? "Not stated"}`}
          {...field("activity", fields.activity.evidence_state, fields.activity.citations)}
        />
        <TextField
          index={1}
          text={`Diet: ${fields.diet.text ?? "Not stated"}`}
          {...field("diet", fields.diet.evidence_state, fields.diet.citations)}
        />
      </ul>

      {(uncertainties.length === 0 || otherUncertainties.length > 0) && (
        <>
          <SectionTitle icon="help" title="Uncertainties" />
          <ul className="uncertainties">
            {otherUncertainties.length ? (
              otherUncertainties.map((item) => (
                <li key={item.field}>
                  <code className="code-chip">{item.field}</code> {item.note}
                </li>
              ))
            ) : (
              <li className="muted">None recorded.</li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
