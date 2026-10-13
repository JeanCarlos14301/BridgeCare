import type { Citation, SourceDocument } from "../api";

function highlight(text: string, citation: Citation | null, documentId: string, page: number) {
  if (!citation || citation.document_id !== documentId || citation.page !== page) return text;
  if (!text.includes(citation.quote)) return text;
  const [before, after] = text.split(citation.quote, 2);
  return (
    <>
      {before}
      <mark data-testid="citation-highlight">{citation.quote}</mark>
      {after}
    </>
  );
}

export function SourcePanel({ documents, selected }: { documents: SourceDocument[]; selected: Citation | null }) {
  return (
    <section className="window source-panel" aria-labelledby="source-title">
      <div className="window-bar">
        <span className="window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <h2 id="source-title" className="window-title">
          Source document
        </h2>
      </div>
      <div className="window-body">
        {documents.map((document) => (
          <article key={document.document_id} className="source-document">
            <h3>{document.title}</h3>
            {document.pages.map((page) => (
              <div className="source-page" key={page.page}>
                <span className="page-label">Page {page.page}</span>
                <p>{highlight(page.text, selected, document.document_id, page.page)}</p>
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
