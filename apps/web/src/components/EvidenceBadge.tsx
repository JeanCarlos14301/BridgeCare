import type { EvidenceState } from "../api";
import { Icon, type IconName } from "./Icon";

// Evidence never relies on colour alone: every state has its own icon and word.
export const EVIDENCE: Record<EvidenceState, { icon: IconName; label: string }> = {
  supported: { icon: "check", label: "Supported" },
  missing: { icon: "minus", label: "Missing" },
  ambiguous: { icon: "help", label: "Ambiguous" },
  conflicting: { icon: "alert", label: "Conflicting" },
};

export function EvidenceBadge({ state, count }: { state: EvidenceState; count?: number }) {
  const { icon, label } = EVIDENCE[state];
  return (
    <span className={`evidence evidence-${state}`}>
      <Icon name={icon} size={13} />
      {label}
      {count !== undefined && <span className="evidence-count">{count}</span>}
    </span>
  );
}
