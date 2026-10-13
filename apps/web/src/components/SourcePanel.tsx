import { type HTMLAttributes, useEffect, useMemo, useRef, useState } from "react";

import type { EvidenceState, SourceDocument } from "../api";
import type { FieldRef } from "../lib/caseStats";
import { locateQuote } from "../lib/normalize";
import { buildSegments, type Range, type Trace } from "../lib/segments";
import { EVIDENCE } from "./EvidenceBadge";
import { Icon } from "./Icon";
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

type Located = Range & { documentId: string; page: number };
const pageKey = (documentId: string, page: number) => `${documentId}#${page}`;

function locate(documents: SourceDocument[], selection: Selection | null): Located | null {
  const citation = selectedCitation(selection);
  if (!citation) return null;
  const page = documents
    .find((document) => document.document_id === citation.document_id)
    ?.pages.find((candidate) => candidate.page === citation.page);
  const range = page ? locateQuote(page.text, citation.quote) : null;
  return page && range ? { documentId: citation.document_id, page: page.page, ...range } : null;
}

/** Every verified-looking quote of every field, grouped by page, for the citation map. */
function traceMap(documents: SourceDocument[], fields: FieldRef[]): Map<string, Trace[]> {
  const pages = new Map<string, string>();
  for (const document of documents) {
    for (const page of document.pages) pages.set(pageKey(document.document_id, page.page), page.text);
  }
  const traces = new Map<string, Trace[]>();
  for (const field of fields) {
    field.citations.forEach((citation, index) => {
      const key = pageKey(citation.document_id, citation.page);
      const text = pages.get(key);
      const range = text === undefined ? null : locateQuote(text, citation.quote);
      if (!range) return;
      const trace = { ...range, fieldKey: field.key, index, state: field.state, label: field.label };
      traces.set(key, [...(traces.get(key) ?? []), trace]);
    });
  }
  return traces;
}

function statusText(selection: Selection | null, located: Located | null) {
  const citation = selectedCitation(selection);
  if (!selection || !citation) return "Select a citation to see its quote.";
  if (!located) return "Quote not located in this view.";
  const position = selection.citations.length > 1 ? ` (${selection.index + 1} of ${selection.citations.length})` : "";
  return `Showing quote on page ${located.page}${position}. ${EVIDENCE[selection.state].label} evidence.`;
}

/**
 * Centre an element inside the pane's own scroll box, then bring the pane into view only if needed,
 * so selecting a chip never scrolls the field the reviewer is working on out of sight.
 */
function reveal(element: HTMLElement, block: "center" | "start") {
  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
  const box = element.closest<HTMLElement>(".window-body");
  if (box && typeof box.scrollTo === "function") {
    const offset = element.getBoundingClientRect().top - box.getBoundingClientRect().top;
    const centre = block === "center" ? box.clientHeight / 2 - element.offsetHeight / 2 : 8;
    box.scrollTo({ top: box.scrollTop + offset - centre, behavior });
  }
  const pane = element.closest<HTMLElement>(".source-panel");
  if (pane && typeof pane.scrollIntoView === "function") pane.scrollIntoView({ block: "nearest", behavior });
}

type SectionProps = Omit<HTMLAttributes<HTMLElement>, "children">;

export function SourcePanel({
  documents,
  selection,
  fields = [],
  onBack,
  onPickTrace,
  className,
  ...section
}: SectionProps & {
  documents: SourceDocument[];
  selection: Selection | null;
  fields?: FieldRef[];
  onBack?: () => void;
  onPickTrace?: (fieldKey: string, index: number) => void;
}) {
  const markRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [showMap, setShowMap] = useState(true);
  const located = locate(documents, selection);
  const traces = useMemo(() => traceMap(documents, fields), [documents, fields]);
  const totalPages = documents.reduce((sum, document) => sum + document.pages.length, 0);

  useEffect(() => {
    const mark = markRef.current;
    if (!selection || !mark) return;
    reveal(mark, "center");
    mark.focus({ preventScroll: true });
  }, [selection]);

  const jumpToPage = (key: string) => {
    const pages = bodyRef.current?.querySelectorAll<HTMLElement>("[data-page-key]") ?? [];
    const page = [...pages].find((element) => element.dataset.pageKey === key);
    if (page) reveal(page, "start");
  };

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
        <div className="window-tools">
          {totalPages > 1 && (
            <span className="page-jump" role="group" aria-label="Jump to page">
              {documents.flatMap((document) =>
                document.pages.map((page) => (
                  <button
                    key={pageKey(document.document_id, page.page)}
                    type="button"
                    className="page-jump-button"
                    aria-label={`Jump to page ${page.page}`}
                    onClick={() => jumpToPage(pageKey(document.document_id, page.page))}
                  >
                    {page.page}
                  </button>
                )),
              )}
            </span>
          )}
          {fields.length > 0 && (
            <button
              type="button"
              className="button button-sm button-ghost map-toggle"
              aria-pressed={showMap}
              onClick={() => setShowMap(!showMap)}
            >
              <Icon name="eye" size={14} />
              Citation map
            </button>
          )}
          {onBack && selection && (
            <button type="button" className="button button-sm back-to-fields" onClick={onBack}>
              Back to field
            </button>
          )}
        </div>
      </div>
      <p
        className={`inspector-status${selection && !located ? " is-missing" : ""}`}
        aria-live="polite"
        data-testid="inspector-status"
      >
        {statusText(selection, located)}
      </p>
      <div className="window-body" ref={bodyRef}>
        {documents.map((document) => (
          <article key={document.document_id} className="source-document">
            <h3>{document.title}</h3>
            {document.pages.map((page) => {
              const key = pageKey(document.document_id, page.page);
              const hit = located?.documentId === document.document_id && located.page === page.page ? located : null;
              const segments = buildSegments(page.text, hit, showMap ? (traces.get(key) ?? []) : []);
              return (
                <div className="source-page" key={page.page} data-page={page.page} data-page-key={key}>
                  <span className="page-label">
                    Page {page.page}
                    <span className="page-of"> of {totalPages}</span>
                  </span>
                  <p>
                    {segments.map((segment, index) => {
                      if (segment.kind === "plain") return segment.text;
                      if (segment.kind === "mark" && selection) {
                        return (
                          <mark
                            key={`mark-${selection.nonce}`}
                            ref={markRef}
                            tabIndex={-1}
                            data-testid="citation-highlight"
                            className={`citation-mark mark-${MARK_TONE[selection.state]} mark-${selection.state}`}
                            onKeyDown={(event) => event.key === "Escape" && onBack?.()}
                          >
                            {segment.text}
                          </mark>
                        );
                      }
                      if (segment.kind === "trace") {
                        const { trace } = segment;
                        return (
                          <span
                            key={`trace-${index}`}
                            className={`trace trace-${trace.state}`}
                            data-testid="citation-trace"
                            title={`${trace.label}: ${EVIDENCE[trace.state].label}. Click to select.`}
                            onClick={() => onPickTrace?.(trace.fieldKey, trace.index)}
                          >
                            {segment.text}
                          </span>
                        );
                      }
                      return segment.text;
                    })}
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
