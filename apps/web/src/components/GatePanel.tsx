import type { Gate } from "../api";

function gateSummary(gate: Gate): { tone: "ok" | "warn" | "blocked"; glyph: string; title: string } {
  if (gate.blocking_reasons.length === 0) return { tone: "ok", glyph: "✓", title: "No blocking reasons" };
  const count = `${gate.blocking_reasons.length} reason${gate.blocking_reasons.length === 1 ? "" : "s"}`;
  if (gate.approvable) return { tone: "warn", glyph: "?", title: `Resolution note required (${count})` };
  return { tone: "blocked", glyph: "✕", title: `Approval blocked (${count})` };
}

export function GatePanel({ gate }: { gate: Gate }) {
  const summary = gateSummary(gate);
  return (
    <section className={`card gate gate-${summary.tone}`} aria-labelledby="gate-title">
      <p className="eyebrow">Review gate</p>
      <h2 id="gate-title" className="gate-title">
        <span className="gate-glyph" aria-hidden="true">
          {summary.glyph}
        </span>
        {summary.title}
      </h2>
      {summary.tone === "warn" && <p className="muted">A reviewer resolution note is required to approve.</p>}
      {gate.blocking_reasons.length > 0 && (
        <ul className="gate-reasons">
          {gate.blocking_reasons.map((reason, index) => (
            <li key={`${reason.code}-${reason.field ?? ""}-${index}`}>
              <code className="code-chip">{reason.code}</code>
              {reason.field && <span className="gate-field">{reason.field}</span>}
              <span>{reason.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
