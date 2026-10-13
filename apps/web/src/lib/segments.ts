import type { EvidenceState } from "../api";

export type Range = { start: number; end: number };

/** A cited quote located on a page, drawn as part of the citation map. */
export type Trace = Range & { fieldKey: string; index: number; state: EvidenceState; label: string };

export type Segment =
  | { kind: "plain"; text: string }
  | { kind: "mark"; text: string }
  | { kind: "trace"; text: string; trace: Trace };

const overlaps = (a: Range, b: Range) => a.start < b.end && b.start < a.end;

/**
 * Split page text into plain text, citation-map traces, and the selected quote (the mark).
 * The mark wins over traces; among traces, earlier and then longer quotes win, and a trace that
 * overlaps one already placed is dropped rather than drawn on top of it.
 */
export function buildSegments(text: string, mark: Range | null, traces: Trace[]): Segment[] {
  const placed: ({ kind: "mark" } & Range | { kind: "trace"; trace: Trace } & Range)[] = [];
  if (mark) placed.push({ kind: "mark", ...mark });
  const ordered = [...traces].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  for (const trace of ordered) {
    if (!placed.some((range) => overlaps(range, trace))) placed.push({ kind: "trace", trace, ...trace });
  }
  placed.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const range of placed) {
    if (range.start > cursor) segments.push({ kind: "plain", text: text.slice(cursor, range.start) });
    const slice = text.slice(range.start, range.end);
    segments.push(
      range.kind === "mark" ? { kind: "mark", text: slice } : { kind: "trace", text: slice, trace: range.trace },
    );
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ kind: "plain", text: text.slice(cursor) });
  return segments;
}
