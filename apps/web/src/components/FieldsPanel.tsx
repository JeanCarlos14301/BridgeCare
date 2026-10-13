import type { Citation, EvidenceState, Revision } from "../api";
import { EvidenceBadge } from "./EvidenceBadge";

type SelectCitation = (citation: Citation) => void;

const MEDICATION_KEYS = ["dose", "unit", "route", "frequency", "duration"] as const;

function sameCitation(a: Citation | null, b: Citation) {
  return a !== null && a.document_id === b.document_id && a.page === b.page && a.quote === b.quote;
}

function CitationChips(props: { citations?: Citation[]; selected: Citation | null; onSelect: SelectCitation }) {
  if (!props.citations?.length) return <span className="no-citation">No citation</span>;
  return (
    <span className="citation-chips">
      {props.citations.map((citation, index) => (
        <button
          type="button"
          className="citation"
          key={`${citation.document_id}-${citation.page}-${index}`}
          aria-pressed={sameCitation(props.selected, citation)}
          aria-label={`Show quote on page ${citation.page}`}
          onClick={() => props.onSelect(citation)}
        >
          p. {citation.page}
        </button>
      ))}
    </span>
  );
}

function TextField(props: {
  state: EvidenceState;
  text: string;
  citations?: Citation[];
  selected: Citation | null;
  onSelect: SelectCitation;
}) {
  return (
    <li className={`compact-field state-${props.state}`}>
      <EvidenceBadge state={props.state} />
      <span className="compact-text">{props.text}</span>
      <CitationChips citations={props.citations} selected={props.selected} onSelect={props.onSelect} />
    </li>
  );
}

export function FieldsPanel(props: { revision: Revision; selected: Citation | null; onSelect: SelectCitation }) {
  const { extracted_fields: fields, uncertainties } = props.revision;
  const chipProps = { selected: props.selected, onSelect: props.onSelect };
  return (
    <section className="card fields-panel" aria-labelledby="fields-title">
      <p className="eyebrow">Extracted fields</p>
      <h2 id="fields-title">Check every value against its source.</h2>

      <h3>Medications</h3>
      {fields.medications.length === 0 && <p className="muted">No medications extracted.</p>}
      <div className="field-list">
        {fields.medications.map((medication, index) => (
          <article className={`field-card state-${medication.evidence_state}`} key={index}>
            <div className="field-heading">
              <strong>{medication.name ?? "Unnamed medication"}</strong>
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
            <CitationChips citations={medication.citations} {...chipProps} />
          </article>
        ))}
      </div>

      <h3>Follow-up</h3>
      <ul className="compact-list">
        {fields.follow_up.map((item, index) => (
          <TextField
            key={index}
            state={item.evidence_state}
            text={`${item.instruction ?? "Not stated"}${item.timeframe ? ` (${item.timeframe})` : ""}`}
            citations={item.citations}
            {...chipProps}
          />
        ))}
      </ul>

      <h3>Warning signs</h3>
      <ul className="compact-list">
        {fields.warning_signs.map((item, index) => (
          <TextField
            key={index}
            state={item.evidence_state}
            text={item.text ?? "Not stated"}
            citations={item.citations}
            {...chipProps}
          />
        ))}
      </ul>

      <h3>Activity and diet</h3>
      <ul className="compact-list">
        <TextField
          state={fields.activity.evidence_state}
          text={`Activity: ${fields.activity.text ?? "Not stated"}`}
          citations={fields.activity.citations}
          {...chipProps}
        />
        <TextField
          state={fields.diet.evidence_state}
          text={`Diet: ${fields.diet.text ?? "Not stated"}`}
          citations={fields.diet.citations}
          {...chipProps}
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
