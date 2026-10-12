import { FormEvent, useEffect, useState } from "react";
import type { components } from "../../../packages/contracts/openapi";

type CaseView = components["schemas"]["CaseView"];
type Citation = components["schemas"]["Citation"];
type Fixture = components["schemas"]["FixtureSummary"];
type Gate = components["schemas"]["Gate"];
type PatientView = components["schemas"]["PatientView"];

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: "same-origin", ...init });
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, body || `Request failed with status ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function evidenceClass(state: string) { return `evidence evidence-${state}`; }

export function GatePanel({ gate }: { gate: Gate }) {
  if (gate.blocking_reasons.length === 0) return <section className="gate ok"><h2>Review gate</h2><p>No blocking reasons.</p></section>;
  return <section className="gate" aria-label="Review gate"><h2>Review gate</h2><p>{gate.approvable ? "A reviewer resolution note is required." : "Approval is blocked."}</p><ul>{gate.blocking_reasons.map((reason) => <li key={`${reason.code}-${reason.field ?? ""}`}><strong>{reason.code}</strong>{reason.field ? ` — ${reason.field}` : ""}: {reason.message}</li>)}</ul></section>;
}

export function SourcePages({ documents, selected }: { documents: components["schemas"]["SourceDocument"][]; selected: Citation | null }) {
  return <section className="source-panel"><h2>Source pages</h2>{documents.map((document) => <article key={document.document_id} className="source-document"><h3>{document.title}</h3>{document.pages.map((page) => <div className="source-page" key={page.page}><span className="page-label">Page {page.page}</span><p>{highlight(page.text, selected, document.document_id, page.page)}</p></div>)}</article>)}</section>;
}

function highlight(text: string, citation: Citation | null, documentId: string, page: number) {
  if (!citation || citation.document_id !== documentId || citation.page !== page || !text.includes(citation.quote)) return text;
  const [before, after] = text.split(citation.quote, 2);
  return <>{before}<mark data-testid="citation-highlight">{citation.quote}</mark>{after}</>;
}

function CitationLinks({ citations, onSelect }: { citations?: Citation[]; onSelect: (citation: Citation) => void }) {
  if (!citations?.length) return <span className="no-citation">No citation</span>;
  return <>{citations.map((citation, index) => <button className="citation" key={`${citation.document_id}-${citation.page}-${index}`} onClick={() => onSelect(citation)}>p. {citation.page}</button>)}</>;
}

function ExtractedFields({ revision, onSelect }: { revision: NonNullable<CaseView["revision"]>; onSelect: (citation: Citation) => void }) {
  return <section className="fields-panel"><h2>Extracted fields</h2><h3>Medications</h3><div className="field-list">{revision.extracted_fields.medications.map((medication, index) => <article className="field-card" key={index}><div className="field-heading"><strong>{medication.name ?? "Unnamed medication"}</strong><span className={evidenceClass(medication.evidence_state)}>{medication.evidence_state}</span></div><dl>{(["dose", "unit", "route", "frequency", "duration"] as const).map((key) => <div key={key}><dt>{key}</dt><dd>{medication[key] ?? "Not stated"}</dd></div>)}</dl><CitationLinks citations={medication.citations} onSelect={onSelect} /></article>)}</div><h3>Follow-up</h3>{revision.extracted_fields.follow_up.map((item, index) => <article className="compact-field" key={index}><span className={evidenceClass(item.evidence_state)}>{item.evidence_state}</span><span>{item.instruction ?? "Not stated"} {item.timeframe ? `(${item.timeframe})` : ""}</span><CitationLinks citations={item.citations} onSelect={onSelect} /></article>)}<h3>Warnings</h3>{revision.extracted_fields.warning_signs.map((item, index) => <article className="compact-field" key={index}><span className={evidenceClass(item.evidence_state)}>{item.evidence_state}</span><span>{item.text ?? "Not stated"}</span><CitationLinks citations={item.citations} onSelect={onSelect} /></article>)}<h3>Uncertainties</h3><ul className="uncertainties">{revision.uncertainties.length ? revision.uncertainties.map((item) => <li key={item.field}><strong>{item.field}</strong>: {item.note}</li>) : <li>None recorded.</li>}</ul></section>;
}

export function PatientViewPanel({ caseId }: { caseId: string }) {
  const [view, setView] = useState<PatientView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = async () => { try { setView(await api<PatientView>(`/cases/${caseId}/patient-view`)); setMessage(null); } catch (error) { setMessage(error instanceof ApiError && error.status === 409 ? "Patient view is blocked until the current revision has a valid approval." : "Patient view could not be loaded."); } };
  return <section className="patient-panel"><h2>Printable patient view</h2><button onClick={load}>Open patient view</button>{message && <p className="error" role="alert">{message}</p>}{view && <article className="printable"><p>{view.summary}</p><table><thead><tr>{["Name", "Dose", "Unit", "Route", "Frequency", "Duration"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{view.medications.map((medication, index) => <tr key={index}><td>{medication.name}</td><td>{medication.dose}</td><td>{medication.unit}</td><td>{medication.route}</td><td>{medication.frequency}</td><td>{medication.duration}</td></tr>)}</tbody></table><button onClick={() => window.print()}>Print</button></article>}</section>;
}

export default function App() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const [selected, setSelected] = useState<Citation | null>(null);
  const [role, setRole] = useState<"visitor" | "reviewer">("visitor");
  const [password, setPassword] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { Promise.all([api<{ role: "visitor" | "reviewer" }>("/session", { method: "POST" }), api<Fixture[]>("/fixtures")]).then(([session, list]) => { setRole(session.role); setFixtures(list); }).catch(() => setMessage("The session or fixture list could not be loaded.")); }, []);
  const createAndProcess = async (fixtureId: string) => { try { setMessage("Processing case…"); const created = await api<CaseView>("/cases/from-fixture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fixture_id: fixtureId }) }); const processed = await api<CaseView>(`/cases/${created.case_id}/process`, { method: "POST" }); setCaseView(processed); setSelected(null); setMessage(null); } catch (error) { setMessage(error instanceof ApiError && error.status === 409 ? "This case is already processing." : "The case could not be processed."); } };
  const login = async (event: FormEvent) => { event.preventDefault(); try { const session = await api<{ role: "visitor" | "reviewer" }>("/session/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); setRole(session.role); setPassword(""); setMessage(null); } catch { setMessage("Reviewer login failed."); } };
  const logout = async () => { await api<void>("/session/logout", { method: "POST" }); setRole("visitor"); };
  const review = async (decision: "approve" | "reject") => { if (!caseView?.revision) return; const gate = caseView.revision.gate; if (decision === "approve" && (!gate.approvable || (gate.requires_resolution_note && resolutionNote.trim().length < 10))) { setMessage(gate.requires_resolution_note ? "A resolution note of at least 10 characters is required." : "Approval is blocked by the current gate."); return; } try { const updated = await api<CaseView>(`/cases/${caseView.case_id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision_id: caseView.revision.revision_id, content_hash: caseView.revision.content_hash, decision, resolution_note: resolutionNote || null }) }); setCaseView(updated); setMessage(null); } catch (error) { setMessage(error instanceof ApiError && error.status === 409 ? "Review conflict: this revision is stale or blocked. Reload and review the current revision." : "The review could not be saved."); } };
  const revision = caseView?.revision;
  return <main><header><div><p className="eyebrow">BridgeCare</p><h1>Discharge instruction review</h1></div>{revision?.provider_mode === "mock" && <span className="badge">MOCK</span>}</header>{message && <p className="notice" role="status">{message}</p>}<section className="toolbar"><label>Fixture<select defaultValue="" onChange={(event) => event.target.value && createAndProcess(event.target.value)}><option value="" disabled>Select a synthetic fixture</option>{fixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.title}</option>)}</select></label>{role === "reviewer" ? <button onClick={logout}>Log out reviewer</button> : <form onSubmit={login}><label>Reviewer password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button>Log in</button></form>}</section>{caseView && <><p className="case-status">Case status: <strong>{caseView.status}</strong>{caseView.failure_reason ? ` (${caseView.failure_reason})` : ""}</p>{revision ? <div className="review-layout"><SourcePages documents={caseView.source_documents} selected={selected} /><div><ExtractedFields revision={revision} onSelect={setSelected} /><GatePanel gate={revision.gate} /><section className="review-controls"><h2>Reviewer decision</h2>{role === "reviewer" ? <><textarea aria-label="Resolution note" placeholder="Resolution note required for conflicts" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} /><button disabled={!revision.gate.approvable} onClick={() => review("approve")}>Approve current revision</button><button onClick={() => review("reject")}>Reject current revision</button></> : <p>Log in as a reviewer to make a decision.</p>}</section><PatientViewPanel caseId={caseView.case_id} /></div></div> : <p className="error">Processing did not produce a reviewable revision.</p>}</>}</main>;
}
