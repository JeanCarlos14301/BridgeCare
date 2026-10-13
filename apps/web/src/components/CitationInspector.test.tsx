import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { Citation, Revision, SourceDocument } from "../api";
import { CitationInspector } from "./CitationInspector";

const DOC = "discharge_summary";

const documents: SourceDocument[] = [
  {
    document_id: DOC,
    title: "Synthetic discharge instructions",
    pages: [
      { page: 1, text: "Discharge instructions\n\nTake Lisinopril 10 mg by mouth\n  once a day for 14 days." },
      { page: 2, text: "Medication note\n\nContinue Lisinopril 20 mg by mouth once a day for 14 days." },
    ],
  },
];

const cite = (page: number, quote: string): Citation => ({ document_id: DOC, page, quote });
const missingItem = { text: null, evidence_state: "missing" as const, citations: [] };

function makeRevision(medicationCitations: Citation[]): Revision {
  return {
    revision_id: "rev-1",
    number: 1,
    origin: "model",
    content_hash: "hash",
    created_at: "2026-10-12T00:00:00Z",
    model: "mock-model",
    prompt_version: "extraction-v2",
    provider_mode: "mock",
    timings: { model_ms: null, total_ms: 1 },
    source_documents: documents,
    patient_draft: { summary: null },
    uncertainties: [],
    gate: { approvable: true, requires_resolution_note: true, blocking_reasons: [] },
    extracted_fields: {
      medications: [
        {
          name: "Lisinopril",
          dose: null,
          unit: "mg",
          route: "by mouth",
          frequency: "once a day",
          duration: "14 days",
          evidence_state: "conflicting",
          citations: medicationCitations,
        },
      ],
      follow_up: [],
      warning_signs: [],
      activity: missingItem,
      diet: missingItem,
    },
  };
}

function render(element: ReactNode) {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  act(() => root.render(element));
  return { node, root };
}

function click(element: Element | null) {
  act(() => (element as HTMLElement).click());
}

const marks = (node: HTMLElement) => node.querySelectorAll('mark[data-testid="citation-highlight"]');
const status = (node: HTMLElement) => node.querySelector('[data-testid="inspector-status"]')?.textContent;

afterEach(() => {
  document.body.replaceChildren();
});

describe("citation inspector", () => {
  const conflicting = [
    cite(1, "Take Lisinopril 10 mg by mouth once a day for 14 days."),
    cite(2, "Continue Lisinopril 20 mg by mouth once a day for 14 days."),
  ];

  it("highlights exactly one quote on the cited page when a chip is clicked", () => {
    const view = render(<CitationInspector documents={documents} revision={makeRevision(conflicting)} />);
    expect(marks(view.node)).toHaveLength(0);

    click(view.node.querySelector('button[aria-label="Show quote on page 2"]'));

    const found = marks(view.node);
    expect(found).toHaveLength(1);
    expect(found[0].textContent).toBe("Continue Lisinopril 20 mg by mouth once a day for 14 days.");
    expect(found[0].closest("[data-page]")?.getAttribute("data-page")).toBe("2");
    expect(found[0].className).toContain("mark-warning");
    expect(document.activeElement).toBe(found[0]);
    expect(status(view.node)).toBe("Showing quote on page 2 (2 of 2).");
    view.root.unmount();
  });

  it("highlights the real characters when the quote's whitespace differs from the page", () => {
    const view = render(<CitationInspector documents={documents} revision={makeRevision(conflicting)} />);

    click(view.node.querySelector('button[aria-label="Show quote on page 1"]'));

    const found = marks(view.node);
    expect(found).toHaveLength(1);
    expect(found[0].textContent).toBe("Take Lisinopril 10 mg by mouth\n  once a day for 14 days.");
    expect(found[0].closest("[data-page]")?.getAttribute("data-page")).toBe("1");
    view.root.unmount();
  });

  it("says when a quote cannot be located instead of highlighting something else", () => {
    const revision = makeRevision([cite(1, "Take Lisinopril 40 mg by mouth")]);
    const view = render(<CitationInspector documents={documents} revision={revision} />);

    click(view.node.querySelector('button[aria-label="Show quote on page 1"]'));

    expect(marks(view.node)).toHaveLength(0);
    expect(status(view.node)).toBe("Quote not located in this view.");
    view.root.unmount();
  });

  it("selects the first citation from the field name and cycles with ] and [", () => {
    const view = render(<CitationInspector documents={documents} revision={makeRevision(conflicting)} />);
    const page = () => marks(view.node)[0]?.closest("[data-page]")?.getAttribute("data-page");

    click(view.node.querySelector(".field-name-button"));
    expect(page()).toBe("1");

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "]" }));
    });
    expect(page()).toBe("2");
    expect(marks(view.node)).toHaveLength(1);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "[" }));
    });
    expect(page()).toBe("1");
    view.root.unmount();
  });
});
