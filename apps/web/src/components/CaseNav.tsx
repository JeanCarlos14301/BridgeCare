import type { CaseView, Fixture } from "../api";
import { Icon, type IconName } from "./Icon";

const SCENARIO: Record<Fixture["scenario"], { icon: IconName; label: string; tone: string }> = {
  clear: { icon: "shieldCheck", label: "Clear", tone: "success" },
  missing_fields: { icon: "dashedCircle", label: "Missing fields", tone: "neutral" },
  contradictory: { icon: "notEqual", label: "Contradictory", tone: "danger" },
  prompt_injection: { icon: "shieldAlert", label: "Prompt injection", tone: "warning" },
  provider_failure: { icon: "cloudOff", label: "Provider failure", tone: "danger" },
};

const STATUS_LABEL: Partial<Record<CaseView["status"], string>> = {
  needs_review: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
};

/** Sidebar list of the synthetic discharge documents; opening one creates and processes a case. */
export function CaseNav(props: {
  fixtures: Fixture[];
  activeId: string | null;
  statuses: Partial<Record<string, CaseView["status"]>>;
  processingId: string | null;
  openingId: string | null;
  elapsedSeconds: number;
  onPick: (fixtureId: string) => void;
}) {
  return (
    <nav aria-labelledby="nav-title">
      <p id="nav-title" className="sidebar-label">
        Synthetic documents
      </p>
      {props.fixtures.length === 0 ? (
        <div className="nav-skeleton" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className="skeleton-line" />
          ))}
        </div>
      ) : (
        <ul className="nav-list">
          {props.fixtures.map((fixture, index) => {
            const scenario = SCENARIO[fixture.scenario];
            const active = fixture.id === props.activeId;
            const processing = props.processingId === fixture.id;
            const opening = props.openingId === fixture.id;
            const known = props.statuses[fixture.id];
            const status = known ? STATUS_LABEL[known] : undefined;
            const meta = processing
              ? `Processing… ${props.elapsedSeconds} s`
              : opening
                ? "Opening…"
                : (status ?? scenario.label);
            return (
              <li key={fixture.id}>
                <button
                  type="button"
                  className={`nav-item tone-${scenario.tone}`}
                  aria-pressed={active}
                  aria-busy={processing || opening}
                  disabled={props.processingId !== null || props.openingId !== null}
                  title={fixture.description}
                  onClick={() => props.onPick(fixture.id)}
                >
                  <span className="nav-icon">
                    <Icon name={scenario.icon} size={16} />
                  </span>
                  <span className="nav-text">
                    <span className="nav-title">{fixture.title}</span>
                    <span className="nav-meta">
                      {String(index + 1).padStart(2, "0")} · {meta}
                    </span>
                  </span>
                  {(processing || opening) && <span className="spinner" aria-hidden="true" />}
                  {!processing && !opening && known && (
                    <span className="nav-ready" title="Already processed in this session; opens without the model">
                      <Icon name="check" size={12} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
