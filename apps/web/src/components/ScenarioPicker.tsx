import type { CSSProperties } from "react";

import type { Fixture } from "../api";
import { Icon, type IconName } from "./Icon";

const SCENARIO: Record<Fixture["scenario"], { icon: IconName; label: string; tone: string }> = {
  clear: { icon: "shieldCheck", label: "Clear", tone: "success" },
  missing_fields: { icon: "dashedCircle", label: "Missing fields", tone: "neutral" },
  contradictory: { icon: "notEqual", label: "Contradictory", tone: "danger" },
  prompt_injection: { icon: "shieldAlert", label: "Prompt injection", tone: "warning" },
  provider_failure: { icon: "cloudOff", label: "Provider failure", tone: "danger" },
};

export function ScenarioPicker(props: {
  fixtures: Fixture[];
  activeId: string | null;
  processingId: string | null;
  onPick: (fixtureId: string) => void;
}) {
  if (props.fixtures.length === 0) {
    return (
      <div className="scenario-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="scenario-card skeleton-block" />
        ))}
      </div>
    );
  }
  return (
    <div className="scenario-grid" role="group" aria-label="Synthetic discharge documents">
      {props.fixtures.map((fixture, index) => {
        const scenario = SCENARIO[fixture.scenario];
        const processing = props.processingId === fixture.id;
        return (
          <button
            type="button"
            key={fixture.id}
            className={`scenario-card tone-${scenario.tone}${processing ? " is-processing" : ""}`}
            style={{ "--i": index } as CSSProperties}
            aria-pressed={fixture.id === props.activeId}
            aria-busy={processing}
            disabled={props.processingId !== null}
            onClick={() => props.onPick(fixture.id)}
          >
            <span className="scenario-top">
              <span className="scenario-icon">
                <Icon name={scenario.icon} size={20} />
              </span>
              <span className="scenario-number">{String(index + 1).padStart(2, "0")}</span>
            </span>
            <span className="scenario-title">{fixture.title}</span>
            <span className="scenario-description">{fixture.description}</span>
            <span className="scenario-footer">
              <span className="scenario-tag">{scenario.label}</span>
              <span className="scenario-go">
                {processing ? "Processing…" : "Open"}
                <Icon name="arrowRight" size={14} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
