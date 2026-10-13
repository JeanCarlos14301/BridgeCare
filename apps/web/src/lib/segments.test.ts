import { describe, expect, it } from "vitest";

import { buildSegments, type Trace } from "./segments";

const trace = (start: number, end: number, fieldKey = "f"): Trace => ({
  start,
  end,
  fieldKey,
  index: 0,
  state: "supported",
  label: fieldKey,
});

const text = "0123456789abcdefghij";

describe("buildSegments", () => {
  it("keeps every character exactly once, in order", () => {
    const segments = buildSegments(text, { start: 4, end: 8 }, [trace(0, 3), trace(10, 15)]);
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
    expect(segments.map((segment) => segment.kind)).toEqual(["trace", "plain", "mark", "plain", "trace", "plain"]);
  });

  it("lets the selected quote win over an overlapping trace", () => {
    const segments = buildSegments(text, { start: 2, end: 6 }, [trace(0, 4, "a"), trace(5, 9, "b")]);
    expect(segments.filter((segment) => segment.kind === "mark")).toHaveLength(1);
    expect(segments.filter((segment) => segment.kind === "trace")).toHaveLength(0);
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
  });

  it("drops a trace that overlaps an earlier one instead of nesting it", () => {
    const segments = buildSegments(text, null, [trace(3, 8, "late"), trace(0, 5, "early")]);
    const traces = segments.flatMap((segment) => (segment.kind === "trace" ? [segment.trace.fieldKey] : []));
    expect(traces).toEqual(["early"]);
  });
});
