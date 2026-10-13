import type { Citation, EvidenceState } from "../api";

/** The citation currently shown in the source pane. `nonce` restarts the scroll and glow. */
export type Selection = {
  fieldKey: string;
  citations: Citation[];
  index: number;
  state: EvidenceState;
  nonce: number;
};

export type SelectField = (fieldKey: string, citations: Citation[], index: number, state: EvidenceState) => void;

export function chipId(fieldKey: string, index: number) {
  return `chip-${fieldKey.replace(/[^a-z0-9_]/gi, "-")}-${index}`;
}

export function selectedCitation(selection: Selection | null): Citation | null {
  return selection ? (selection.citations[selection.index] ?? null) : null;
}
