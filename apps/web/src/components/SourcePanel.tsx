import { type HTMLAttributes, useEffect, useRef } from "react";

import type { EvidenceState, SourceDocument } from "../api";
import { locateQuote } from "../lib/normalize";
import { type Selection, selectedCitation } from "./selection";

const MARK_TONE: Record<EvidenceState, string> = {
  supported: "success",
  ambiguous: "warning",
  conflicting: "warning",
  missing: "neutral",
};

// Named in the status line so the highlight never relies on colour alone.
const STATE_LABEL: Record<EvidenceState, string> = {
  supported: "Supported",
  ambiguous: "Ambiguous",
  conflicting: "Conflicting",
  missing: "Missing",
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
  return `Showing quote on page ${located.page}${position}. ${STATE_LABEL[selection.state]} evidence.`;
}

/**
 * Centre the mark inside the pane's own scroll box, then bring the pane into view only if needed,
 * so selecting a chip never scrolls the field the reviewer is working on out of sight.
 */
function revealMark(mark: HTMLElement) {
  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
  const box = mark.closest<HTMLElement>(".window-body");
  if (box && typeof box.scrollTo === "function") {
    const offset = mark.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTo({ top: box.scrollTop + offset - box.clientHeight / 2 + mark.offsetHeight / 2, behavior });
  }
  const pane = mark.closest<HTMLElement>(".source-panel");
  if (pane && typeof pane.scrollIntoView === "function") pane.scrollIntoView({ block: "nearest", behavior });
}

type SectionProps = Omit<HTMLAttributes<HTMLElement>, "children">;

export function SourcePanel({
  documents,
  selection,
  onBack,
  className,
  ...section
}: SectionProps & {
  documents: SourceDocument[];
  selection: Selection | null;
  onBack?: () => void;
}) {
  const markRef = useRef<HTMLElement>(null);
  const located = locate(documents, selection);

  useEffect(() => {
    const mark = markRef.current;
    if (!selection || !mark) return;
    revealMark(mark);
    mark.focus({ preventScroll: true });
  }, [selection]);

  return (
    <section {...section} className={`window source-panel ${className ?? ""}`} aria-labelledby="source-title">
      <div className="window-bar">
        <span className="window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <h2 id="source-title" className="window-title">
          Source document
        </h2>
        {onBack && selection && (
          <button type="button" className="button button-sm back-to-fields" onClick={onBack}>
            Back to field
          </button>
        )}
      </div>
      <p
        className={`inspector-status${selection && !located ? " is-missing" : ""}`}
        aria-live="polite"
        data-testid="inspector-status"
      >
        {statusText(selection, located)}
      </p>
      <div className="window-body">
        {documents.map((document) => (
          <article key={document.document_id} className="source-document">
            <h3>{document.title}</h3>
            {document.pages.map((page) => {
              const hit = located?.documentId === document.document_id && located.page === page.page ? located : null;
              return (
                <div className="source-page" key={page.page} data-page={page.page}>
                  <span className="page-label">Page {page.page}</span>
                  <p>
                    {hit && selection ? (
                      <>
                        {page.text.slice(0, hit.start)}
                        <mark
                          key={selection.nonce}
                          ref={markRef}
                          tabIndex={-1}
                          data-testid="citation-highlight"
                          className={`citation-mark mark-${MARK_TONE[selection.state]} mark-${selection.state}`}
                          onKeyDown={(event) => event.key === "Escape" && onBack?.()}
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
