import type { CSSProperties } from "react";

import type { Gate } from "../api";
import { fieldKeyOf, gateChecks } from "../lib/caseStats";
import { Icon, type IconName } from "./Icon";

type Tone = "ok" | "warn" | "blocked";

function gateSummary(gate: Gate, approved: boolean): { tone: Tone; icon: IconName; title: string; detail: string } {
  const count = gate.blocking_reasons.length;
  const reasons = `${count} reason${count === 1 ? "" : "s"}`;
  if (count === 0) {
    return {
      tone: "ok",
      icon: "shieldCheck",
      title: "No blocking reasons",
      detail: "Every automated check passed. A reviewer still makes the decision.",
    };
  }
  if (gate.approvable) {
    return {
      tone: "warn",
      icon: "shieldAlert",
      title: `Resolution note required (${reasons})`,
      detail: approved
        ? "Resolved in the reviewer's note when this revision was approved."
        : "A reviewer resolution note is required to approve.",
    };
  }
  return {
    tone: "blocked",
    icon: "shieldAlert",
    title: `Approval blocked (${reasons})`,
    detail: "This revision cannot be approved until the reasons below are fixed.",
  };
}

export function GatePanel(props: {
  gate: Gate;
  approved?: boolean;
  fieldLabel?: (fieldKey: string) => string | null;
  onGoToField?: (fieldKey: string) => void;
}) {
  const { gate } = props;
  const summary = gateSummary(gate, props.approved ?? false);
  return (
    <section className={`card gate gate-${summary.tone}`} aria-labelledby="gate-title">
      <div className="gate-head">
        <span className="gate-icon">
          <Icon name={summary.icon} size={26} />
        </span>
        <div>
          <p className="eyebrow">Safety gate</p>
          <h2 id="gate-title">{summary.title}</h2>
          <p className="muted gate-detail">{summary.detail}</p>
        </div>
      </div>

      <ul className="checklist" aria-label="Automated checks">
        {gateChecks(gate).map((check, index) => (
          <li
            key={check.id}
            className={check.failures ? "check-fail" : "check-pass"}
            style={{ "--i": index } as CSSProperties}
          >
            <span className="check-icon">
              <Icon name={check.failures ? "x" : "check"} size={14} />
            </span>
            <span>{check.label}</span>
            <span className="sr-only">{check.failures ? ", failed" : ", passed"}</span>
            {check.failures > 0 && <span className="check-count">{check.failures}</span>}
          </li>
        ))}
      </ul>

      {gate.blocking_reasons.length > 0 && (
        <ul className="gate-reasons">
          {gate.blocking_reasons.map((reason, index) => {
            const fieldKey = reason.field ? fieldKeyOf(reason.field) : null;
            const label = fieldKey ? (props.fieldLabel?.(fieldKey) ?? null) : null;
            return (
              <li key={`${reason.code}-${reason.field ?? ""}-${index}`}>
                <div className="reason-main">
                  <code className="code-chip">{reason.code}</code>
                  {reason.field && <span className="gate-field">{reason.field}</span>}
                  <span className="reason-message">{reason.message}</span>
                </div>
                {fieldKey && props.onGoToField && (
                  <button
                    type="button"
                    className="button button-sm button-ghost reason-go"
                    onClick={() => props.onGoToField?.(fieldKey)}
                  >
                    Go to {label ?? "field"}
                    <Icon name="arrowRight" size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
