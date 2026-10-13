import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { GatePanel } from "./components/GatePanel";
import { PatientSheet } from "./components/PatientSheet";
import { SourcePanel } from "./components/SourcePanel";

function render(element: React.ReactNode) {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  act(() => root.render(element));
  return { node, root };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("review UI", () => {
  it("lists gate blocking reasons", async () => {
    const view = render(
      <GatePanel
        gate={{
          approvable: false,
          requires_resolution_note: false,
          blocking_reasons: [{ code: "citation_not_found", field: "medications[0]", message: "Citation missing" }],
        }}
      />,
    );
    await act(async () => {});
    expect(view.node.textContent).toContain("citation_not_found");
    view.root.unmount();
  });

  it("highlights the selected citation on its source page", async () => {
    const view = render(
      <SourcePanel
        documents={[{ document_id: "d", title: "Source", pages: [{ page: 1, text: "Before exact quote after" }] }]}
        selection={{
          fieldKey: "medications[0]",
          citations: [{ document_id: "d", page: 1, quote: "exact quote" }],
          index: 0,
          state: "supported",
          nonce: 1,
        }}
      />,
    );
    await act(async () => {});
    expect(view.node.querySelector("mark")?.textContent).toBe("exact quote");
    view.root.unmount();
  });

  it("shows a clear blocked state for a 409 patient view", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("blocked", { status: 409 }))));
    const view = render(<PatientSheet caseId="case-1" />);
    await act(async () => {
      (view.node.querySelector("button") as HTMLButtonElement).click();
    });
    expect(view.node.textContent).toContain("blocked until the current revision");
    view.root.unmount();
  });
});
