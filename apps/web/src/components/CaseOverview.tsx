import type { CSSProperties } from "react";

import type { Revision } from "../api";
import { citationStats, EVIDENCE_STATES, evidenceCounts, formatDuration, listFields } from "../lib/caseStats";
import { EVIDENCE, EvidenceBadge } from "./EvidenceBadge";
import { Icon, type IconName } from "./Icon";

type Tile = { icon: IconName; value: string; label: string; tone?: string };

/** Case figures, all computed from this revision's API response. */
export function CaseOverview({ revision }: { revision: Revision }) {
  const fields = listFields(revision);
  const counts = evidenceCounts(fields);
  const quotes = citationStats(fields, revision.gate);
  const flagged = counts.conflicting + counts.ambiguous;
  const tiles: Tile[] = [
    { icon: "pill", value: String(revision.extracted_fields.medications.length), label: "Medications extracted" },
    {
      icon: "quote",
      value: `${quotes.verified}/${quotes.total}`,
      label: "Quotes found on their page",
      tone: quotes.verified === quotes.total ? "success" : "danger",
    },
    {
      icon: "alert",
      value: String(flagged),
      label: "Fields conflicting or ambiguous",
      tone: flagged ? "warning" : "success",
    },
    { icon: "zap", value: formatDuration(revision.timings.total_ms), label: "Processing time, this case" },
  ];

  return (
    <section className="overview" aria-label="Case overview">
      <div className="tiles">
        {tiles.map((tile, index) => (
          <div
            key={tile.label}
            className={`tile${tile.tone ? ` tile-${tile.tone}` : ""}`}
            style={{ "--i": index } as CSSProperties}
          >
            <span className="tile-icon">
              <Icon name={tile.icon} size={18} />
            </span>
            <span className="tile-value">{tile.value}</span>
            <span className="tile-label">{tile.label}</span>
          </div>
        ))}
      </div>
      <div className="evidence-mix">
        <p className="evidence-mix-title">
          Evidence across {fields.length} fields
        </p>
        <div className="evidence-bar" aria-hidden="true">
          {EVIDENCE_STATES.filter((state) => counts[state] > 0).map((state) => (
            <span
              key={state}
              className={`evidence-bar-segment segment-${state}`}
              style={{ flexGrow: counts[state] }}
              title={`${EVIDENCE[state].label}: ${counts[state]}`}
            />
          ))}
        </div>
        <ul className="evidence-legend">
          {EVIDENCE_STATES.map((state) => (
            <li key={state}>
              <EvidenceBadge state={state} count={counts[state]} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
