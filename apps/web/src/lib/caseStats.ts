import type { BlockingReason, CaseView, Citation, EvidenceState, Gate, Revision } from "../api";

/** Every reviewable field of a revision, keyed by the same paths the backend gate uses. */
export type FieldRef = {
  key: string;
  label: string;
  state: EvidenceState;
  citations: Citation[];
};

export const EVIDENCE_STATES: EvidenceState[] = ["supported", "ambiguous", "conflicting", "missing"];

export function listFields(revision: Revision): FieldRef[] {
  const fields = revision.extracted_fields;
  return [
    ...fields.medications.map((item, index) => ({
      key: `medications[${index}]`,
      label: item.name ?? `Medication ${index + 1}`,
      state: item.evidence_state,
      citations: item.citations ?? [],
    })),
    ...fields.follow_up.map((item, index) => ({
      key: `follow_up[${index}]`,
      label: `Follow-up ${index + 1}`,
      state: item.evidence_state,
      citations: item.citations ?? [],
    })),
    ...fields.warning_signs.map((item, index) => ({
      key: `warning_signs[${index}]`,
      label: item.text ?? `Warning sign ${index + 1}`,
      state: item.evidence_state,
      citations: item.citations ?? [],
    })),
    {
      key: "activity",
      label: "Activity",
      state: fields.activity.evidence_state,
      citations: fields.activity.citations ?? [],
    },
    { key: "diet", label: "Diet", state: fields.diet.evidence_state, citations: fields.diet.citations ?? [] },
  ];
}

/** "medications[0].citations[1]" and "medications[0].dose" both belong to field "medications[0]". */
export function fieldKeyOf(path: string): string {
  return path.split(".")[0];
}

export function evidenceCounts(fields: FieldRef[]): Record<EvidenceState, number> {
  const counts: Record<EvidenceState, number> = { supported: 0, ambiguous: 0, conflicting: 0, missing: 0 };
  for (const field of fields) counts[field.state] += 1;
  return counts;
}

/**
 * Quotes the backend could not find on their cited page are reported as `citation_not_found` on a
 * `...citations[i]` path; every other citation was verified.
 */
export function citationStats(fields: FieldRef[], gate: Gate): { total: number; verified: number } {
  const total = fields.reduce((sum, field) => sum + field.citations.length, 0);
  const unverified = gate.blocking_reasons.filter(
    (reason) => reason.code === "citation_not_found" && /\.citations\[\d+\]$/.test(reason.field ?? ""),
  ).length;
  return { total, verified: Math.max(0, total - unverified) };
}

type Code = BlockingReason["code"];

const CHECKS: { id: string; label: string; codes: Code[] }[] = [
  { id: "quotes", label: "Every quote is found on its cited page", codes: ["citation_not_found"] },
  { id: "verbatim", label: "Medication values appear verbatim in a quote", codes: ["medication_not_verbatim"] },
  { id: "conflicts", label: "No conflicting values in the document", codes: ["conflicting_field"] },
  {
    id: "schema",
    label: "Model output is complete and matches the schema",
    codes: ["schema_invalid", "truncated_output", "provider_error"],
  },
  { id: "text", label: "The document has enough readable text", codes: ["insufficient_text"] },
];

export function gateChecks(gate: Gate): { id: string; label: string; failures: number }[] {
  return CHECKS.map((check) => ({
    id: check.id,
    label: check.label,
    failures: gate.blocking_reasons.filter((reason) => check.codes.includes(reason.code)).length,
  }));
}

export function pageCount(caseView: CaseView): number {
  return caseView.source_documents.reduce((sum, document) => sum + document.pages.length, 0);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/**
 * Fields a reviewer must look at: anything not plainly supported, plus any field the gate names.
 */
export function attentionKeys(fields: FieldRef[], gate: Gate): Set<string> {
  const keys = new Set(fields.filter((field) => field.state !== "supported").map((field) => field.key));
  for (const reason of gate.blocking_reasons) {
    if (reason.field) keys.add(fieldKeyOf(reason.field));
  }
  return keys;
}

export function shortHash(value: string, length = 10): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
