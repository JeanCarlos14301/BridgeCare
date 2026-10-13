import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { CaseView, Revision } from "../api";
import { ReviewBar } from "./ReviewBar";

const revision = {
  revision_id: "rev-1",
  number: 1,
  content_hash: "abcdef0123456789",
  gate: { approvable: true, requires_resolution_note: false, blocking_reasons: [] },
} as unknown as Revision;

const review = (duration: number | null): NonNullable<CaseView["review"]> => ({
  revision_id: "rev-1",
  content_hash: "abcdef0123456789",
  decision: "approve",
  resolution_note: null,
  reviewed_at: "2026-10-13T10:00:00Z",
  opened_at: "2026-10-13T09:58:18Z",
  duration_ms: duration,
});

function renderBar(record: CaseView["review"]) {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  act(() =>
    root.render(
      <ReviewBar
        role="reviewer"
        revision={revision}
        review={record}
        note=""
        onNoteChange={() => {}}
        onDecide={() => {}}
        busy={false}
      />,
    ),
  );
  return { node, root };
}

afterEach(() => document.body.replaceChildren());

describe("review decision", () => {
  it("shows the server-measured review time", () => {
    const view = renderBar(review(102_400));
    expect(view.node.textContent).toContain("Review time1 min 42 s");
    view.root.unmount();
  });

  it("says when the review time was not measured instead of inventing one", () => {
    const view = renderBar(review(null));
    expect(view.node.textContent).toContain("Not measured for this revision");
    view.root.unmount();
  });
});
