import type { EvidenceState } from "../api";

// Evidence never relies on colour alone: every state has its own glyph and word.
const EVIDENCE: Record<EvidenceState, { glyph: string; label: string }> = {
  supported: { glyph: "✓", label: "Supported" },
  missing: { glyph: "–", label: "Missing" },
  ambiguous: { glyph: "?", label: "Ambiguous" },
  conflicting: { glyph: "!", label: "Conflicting" },
};

export function EvidenceBadge({ state }: { state: EvidenceState }) {
  const { glyph, label } = EVIDENCE[state];
  return (
    <span className={`evidence evidence-${state}`}>
      <span className="evidence-glyph" aria-hidden="true">
        {glyph}
      </span>
      {label}
    </span>
  );
}
