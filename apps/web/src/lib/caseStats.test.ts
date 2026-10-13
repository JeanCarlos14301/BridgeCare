import { describe, expect, it } from "vitest";

import type { Gate } from "../api";
import { citationStats, evidenceCounts, fieldKeyOf, type FieldRef, formatDuration, gateChecks } from "./caseStats";

const cite = (page: number) => ({ document_id: "d", page, quote: "q" });

const fields: FieldRef[] = [
  { key: "medications[0]", label: "Lisinopril", state: "conflicting", citations: [cite(1), cite(2)] },
  { key: "follow_up[0]", label: "Follow-up 1", state: "supported", citations: [cite(1)] },
  { key: "activity", label: "Activity", state: "missing", citations: [] },
];

const gate = (reasons: Gate["blocking_reasons"]): Gate => ({
  approvable: false,
  requires_resolution_note: false,
  blocking_reasons: reasons,
});

describe("case statistics", () => {
  it("maps gate paths to field keys", () => {
    expect(fieldKeyOf("medications[0].citations[1]")).toBe("medications[0]");
    expect(fieldKeyOf("medications[2].dose")).toBe("medications[2]");
    expect(fieldKeyOf("activity")).toBe("activity");
  });

  it("counts evidence states", () => {
    expect(evidenceCounts(fields)).toEqual({ supported: 1, ambiguous: 0, conflicting: 1, missing: 1 });
  });

  it("counts only per-citation failures as unverified quotes", () => {
    const stats = citationStats(
      fields,
      gate([
        { code: "citation_not_found", field: "medications[0].citations[1]", message: "not on page" },
        // An item with no citation at all does not reduce the verified count.
        { code: "citation_not_found", field: "warning_signs[0]", message: "no citation" },
        { code: "conflicting_field", field: "medications[0]", message: "conflict" },
      ]),
    );
    expect(stats).toEqual({ total: 3, verified: 2 });
  });

  it("marks each automated check as passed or failed from the reason codes", () => {
    const checks = gateChecks(
      gate([
        { code: "conflicting_field", field: "medications[0]", message: "conflict" },
        { code: "truncated_output", field: null, message: "cut" },
      ]),
    );
    const failures = Object.fromEntries(checks.map((check) => [check.id, check.failures]));
    expect(failures).toEqual({ quotes: 0, verbatim: 0, conflicts: 1, schema: 1, text: 0 });
  });

  it("formats durations without inventing precision", () => {
    expect(formatDuration(42.4)).toBe("42 ms");
    expect(formatDuration(7940)).toBe("7.9 s");
  });
});
