import type { CSSProperties, MouseEvent, ReactNode } from "react";

import type { Citation, EvidenceState, Revision } from "../api";
import { EVIDENCE_STATES, evidenceCounts, fieldKeyOf, listFields } from "../lib/caseStats";
import { EVIDENCE, EvidenceBadge } from "./EvidenceBadge";
import { Icon, type IconName } from "./Icon";
import { chipId, type SelectField, type Selection } from "./selection";

const MEDICATION_KEYS = ["dose", "unit", "route", "frequency", "duration"] as const;

export type FieldFilter = "attention" | "all";

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

function Section(props: { icon: IconName; title: string; count: number; children: ReactNode }) {
  if (props.count === 0) return null;
  return (
    <section className="field-section">
      <h3 className="section-title">
        <span className="section-icon">
          <Icon name={props.icon} size={14} />
        </span>
        {props.title}
        <span className="section-count">{props.count}</span>
      </h3>
      {props.children}
    </section>
  );
}

export function FieldsPanel(props: {
  revision: Revision;
  selection: Selection | null;
  flashKey?: string | null;
  attention: Set<string>;
  filter: FieldFilter;
  onFilterChange: (filter: FieldFilter) => void;
  onSelect: SelectField;
}) {
  const { extracted_fields: fields, uncertainties } = props.revision;
  const all = listFields(props.revision);
  const counts = evidenceCounts(all);
  const shown = (key: string) => props.filter === "all" || props.attention.has(key);
  const notesFor = (key: string) =>
    uncertainties.filter((item) => fieldKeyOf(item.field) === key).map((item) => item.note);
  const knownKeys = new Set(all.map((field) => field.key));
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

  const medications = fields.medications.map((item, index) => ({ item, key: `medications[${index}]` }));
  const followUp = fields.follow_up.map((item, index) => ({ item, key: `follow_up[${index}]` }));
  const warnings = fields.warning_signs.map((item, index) => ({ item, key: `warning_signs[${index}]` }));
  const visibleMeds = medications.filter(({ key }) => shown(key));
  const visibleFollowUp = followUp.filter(({ key }) => shown(key));
  const visibleWarnings = warnings.filter(({ key }) => shown(key));
  const showActivity = shown("activity");
  const showDiet = shown("diet");
  const nothingShown =
    !visibleMeds.length && !visibleFollowUp.length && !visibleWarnings.length && !showActivity && !showDiet;

  return (
    <section className="card fields-panel" aria-labelledby="fields-title">
      <header className="fields-head">
        <h2 id="fields-title">Extracted fields</h2>
        <div className="filter" role="group" aria-label="Show fields">
          <button
            type="button"
            className="filter-option"
            aria-pressed={props.filter === "attention"}
            onClick={() => props.onFilterChange("attention")}
          >
            Needs attention <span className="filter-count">{props.attention.size}</span>
          </button>
          <button
            type="button"
            className="filter-option"
            aria-pressed={props.filter === "all"}
            onClick={() => props.onFilterChange("all")}
          >
            All fields <span className="filter-count">{all.length}</span>
          </button>
        </div>
      </header>
      <ul className="state-summary" aria-label="Fields by evidence state">
        {EVIDENCE_STATES.map((state) => (
          <li key={state} className={`state-count state-count-${state}`} title={EVIDENCE[state].label}>
            <Icon name={EVIDENCE[state].icon} size={12} />
            {EVIDENCE[state].label} {counts[state]}
          </li>
        ))}
      </ul>

      {nothingShown && (
        <div className="fields-empty">
          <Icon name="shieldCheck" size={20} />
          <p>Nothing needs attention. Every field is supported by a quote on its page.</p>
          <button type="button" className="button button-sm" onClick={() => props.onFilterChange("all")}>
            Show all fields
          </button>
        </div>
      )}

      <Section icon="pill" title="Medications" count={visibleMeds.length}>
        <div className="field-list">
          {visibleMeds.map(({ item: medication, key }, index) => {
            const card = field(key, medication.evidence_state, medication.citations);
            return (
              <article
                className={cardClass("field-card", card)}
                data-field-key={key}
                key={key}
                style={{ "--i": index } as CSSProperties}
                onClick={cardClick(card)}
              >
                <div className="field-heading">
                  <span className="med-icon">
                    <Icon name="pill" size={16} />
                  </span>
                  <FieldLabel field={card}>
                    <strong className="med-name">{medication.name ?? "Unnamed medication"}</strong>
                  </FieldLabel>
                  <EvidenceBadge state={medication.evidence_state} />
                </div>
                <dl className="spec-grid">
                  {MEDICATION_KEYS.map((name) => (
                    <div key={name} className={medication[name] ? "spec" : "spec spec-missing"}>
                      <dt>{name}</dt>
                      <dd>{medication[name] ?? "Not stated"}</dd>
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
      </Section>

      <Section icon="calendar" title="Follow-up" count={visibleFollowUp.length}>
        <ul className="compact-list">
          {visibleFollowUp.map(({ item, key }, index) => (
            <TextField
              key={key}
              index={index}
              text={`${item.instruction ?? "Not stated"}${item.timeframe ? ` (${item.timeframe})` : ""}`}
              {...field(key, item.evidence_state, item.citations)}
            />
          ))}
        </ul>
      </Section>

      <Section icon="alert" title="Warning signs" count={visibleWarnings.length}>
        <ul className="compact-list">
          {visibleWarnings.map(({ item, key }, index) => (
            <TextField
              key={key}
              index={index}
              text={item.text ?? "Not stated"}
              {...field(key, item.evidence_state, item.citations)}
            />
          ))}
        </ul>
      </Section>

      <Section icon="pulse" title="Activity and diet" count={Number(showActivity) + Number(showDiet)}>
        <ul className="compact-list">
          {showActivity && (
            <TextField
              index={0}
              text={`Activity: ${fields.activity.text ?? "Not stated"}`}
              {...field("activity", fields.activity.evidence_state, fields.activity.citations)}
            />
          )}
          {showDiet && (
            <TextField
              index={1}
              text={`Diet: ${fields.diet.text ?? "Not stated"}`}
              {...field("diet", fields.diet.evidence_state, fields.diet.citations)}
            />
          )}
        </ul>
      </Section>

      <Section icon="help" title="Other uncertainties" count={otherUncertainties.length}>
        <ul className="uncertainties">
          {otherUncertainties.map((item) => (
            <li key={item.field}>
              <code className="code-chip">{item.field}</code> {item.note}
            </li>
          ))}
        </ul>
      </Section>

      <p className="fields-tip muted">
        Select a field or a <span className="kbd-chip">p. N</span> chip to see its quote. Press <kbd>[</kbd> and{" "}
        <kbd>]</kbd> to move between several citations.
      </p>
    </section>
  );
}
