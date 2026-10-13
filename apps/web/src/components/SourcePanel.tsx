import { useEffect, useRef } from "react";

import type { EvidenceState, SourceDocument } from "../api";
import { locateQuote } from "../lib/normalize";
import { type Selection, selectedCitation } from "./selection";

const MARK_TONE: Record<EvidenceState, string> = {
  supported: "success",
  ambiguous: "warning",
  conflicting: "warning",
  missing: "neutral",
};

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Located = { documentId: string; page: number; start: number; end: number };

function locate(documents: SourceDocument[], selection: Selection | null): Located | null {
  const citation = selectedCitation(selection);
  if (!citation) return null;
  const page = documents
    .find((document) => document.document_id === citation.document_id)
    ?.pages.find((candidate) => candidate.page === citation.page);
  const range = page ? locateQuote(page.text, citation.quote) : null;
  return page && range ? { documentId: citation.document_id, page: page.page, ...range } : null;
}

function statusText(selection: Selection | null, located: Located | null) {
  const citation = selectedCitation(selection);
  if (!selection || !citation) return "Select a citation to see its quote.";
  if (!located) return "Quote not located in this view.";
  const position = selection.citations.length > 1 ? ` (${selection.index + 1} of ${selection.citations.length})` : "";
  return `Showing quote on page ${located.page}${position}.`;
}

export function SourcePanel(props: {
  documents: SourceDocument[];
  selection: Selection | null;
  onBack?: () => void;
  id?: string;
  className?: string;
}) {
  const markRef = useRef<HTMLElement>(null);
  const located = locate(props.documents, props.selection);

  useEffect(() => {
    const mark = markRef.current;
    if (!props.selection || !mark) return;
    if (typeof mark.scrollIntoView === "function") {
      mark.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    }
    mark.focus({ preventScroll: true });
  }, [props.selection]);

  return (
    <section
      id={props.id}
      className={`window source-panel ${props.className ?? ""}`}
      aria-labelledby="source-title"
    >
      <div className="window-bar">
        <span className="window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <h2 id="source-title" className="window-title">
          Source document
        </h2>
        {props.onBack && props.selection && (
          <button type="button" className="button button-sm back-to-fields" onClick={props.onBack}>
            Back to field
          </button>
        )}
      </div>
      <p
        className={`inspector-status${props.selection && !located ? " is-missing" : ""}`}
        aria-live="polite"
        data-testid="inspector-status"
      >
        {statusText(props.selection, located)}
      </p>
      <div className="window-body">
        {props.documents.map((document) => (
          <article key={document.document_id} className="source-document">
            <h3>{document.title}</h3>
            {document.pages.map((page) => {
              const hit = located?.documentId === document.document_id && located.page === page.page ? located : null;
              return (
                <div className="source-page" key={page.page} data-page={page.page}>
                  <span className="page-label">Page {page.page}</span>
                  <p>
                    {hit && props.selection ? (
                      <>
                        {page.text.slice(0, hit.start)}
                        <mark
                          key={props.selection.nonce}
                          ref={markRef}
                          tabIndex={-1}
                          data-testid="citation-highlight"
                          className={`citation-mark mark-${MARK_TONE[props.selection.state]}`}
                        >
                          {page.text.slice(hit.start, hit.end)}
                        </mark>
                        {page.text.slice(hit.end)}
                      </>
                    ) : (
                      page.text
                    )}
                  </p>
                </div>
              );
            })}
          </article>
        ))}
      </div>
    </section>
  );
}
