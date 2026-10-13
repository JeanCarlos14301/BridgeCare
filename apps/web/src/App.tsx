import { useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  ApiError,
  type CaseSummary,
  type CaseView,
  errorDetail,
  type Fixture,
  type Health,
  isConflict,
  postJson,
  type ProviderMode,
  type Role,
} from "./api";
import { AppShell, ThemeToggle } from "./components/AppShell";
import { CaseHeader } from "./components/CaseHeader";
import { CaseNav } from "./components/CaseNav";
import { CitationInspector } from "./components/CitationInspector";
import { Icon } from "./components/Icon";
import { LoginDialog } from "./components/LoginDialog";
import { PatientSheet } from "./components/PatientSheet";
import { Pipeline } from "./components/Pipeline";
import { ProviderPill } from "./components/ProviderPill";
import { ReviewBar } from "./components/ReviewBar";
import { Toast, type ToastMessage, type ToastTone } from "./components/Toast";
import { WorkspaceSkeleton } from "./components/WorkspaceSkeleton";

type Session = { role: Role };

// A processed case can be reopened without calling the model again.
const REUSABLE: CaseView["status"][] = ["needs_review", "approved", "rejected"];

/** The newest reusable case of this session for each document. */
function latestByFixture(cases: CaseSummary[]): Record<string, CaseSummary> {
  const latest: Record<string, CaseSummary> = {};
  for (const item of cases) {
    if (!REUSABLE.includes(item.status) || latest[item.fixture_id]) continue;
    latest[item.fixture_id] = item;
  }
  return latest;
}

function summaryOf(view: CaseView): CaseSummary {
  return { case_id: view.case_id, fixture_id: view.fixture_id, status: view.status, updated_at: view.updated_at };
}

/** Whole seconds since `start`, updated every second while `start` is set. */
function useElapsedSeconds(start: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (start === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [start]);
  return start === null ? 0 : Math.max(0, Math.floor((now - start) / 1000));
}

export default function App() {
  const [providerMode, setProviderMode] = useState<ProviderMode | null>(null);
  const [inferenceHost, setInferenceHost] = useState<string | null>(null);
  // X-Request-ID of the processing call, shown as AMD evidence for the demo (B-12.3).
  const [requestId, setRequestId] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const [role, setRole] = useState<Role>("visitor");
  const [resolutionNote, setResolutionNote] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingStart, setProcessingStart] = useState<number | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [knownCases, setKnownCases] = useState<Record<string, CaseSummary>>({});
  const [busy, setBusy] = useState(false);
  // X-Request-ID of each processing call, so a reopened case still shows its evidence.
  const requestIds = useRef(new Map<string, string>());
  const elapsed = useElapsedSeconds(processingStart);
  // Bumped on logout so responses to requests started before it are dropped (B-12.6).
  const sessionEpoch = useRef(0);
  const toastId = useRef(0);

  const notify = useCallback((text: string, tone: ToastTone = "info") => {
    toastId.current += 1;
    setToast({ id: toastId.current, text, tone });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  // Cases already processed in this session; failing to list them only costs a reprocess.
  const loadCases = useCallback(() => {
    const epoch = sessionEpoch.current;
    api<CaseSummary[]>("/cases")
      .then((cases) => epoch === sessionEpoch.current && setKnownCases(latestByFixture(cases)))
      .catch(() => undefined);
  }, []);
  const remember = (view: CaseView) => {
    if (REUSABLE.includes(view.status)) setKnownCases((known) => ({ ...known, [view.fixture_id]: summaryOf(view) }));
  };

  useEffect(() => {
    // The MOCK badge must be visible before any case is processed (B-12.1).
    api<Health>("/health")
      .then((health) => {
        setProviderMode(health.provider_mode);
        setInferenceHost(health.inference_host ?? null);
      })
      .catch(() => setProviderMode(null));
    // The fixture list needs the session cookie, so it waits for the session to exist.
    api<Session>("/session", { method: "POST" })
      .then(async (session) => {
        setRole(session.role);
        setFixtures(await api<Fixture[]>("/fixtures"));
        loadCases();
      })
      .catch(() => notify("The session or fixture list could not be loaded.", "error"));
  }, [notify, loadCases]);

  const fetchCase = (caseId: string) => api<CaseView>(`/cases/${caseId}`);

  const createAndProcess = async (fixtureId: string) => {
    const epoch = sessionEpoch.current;
    setBusy(true);
    setProcessingId(fixtureId);
    setProcessingStart(Date.now());
    setCaseView(null);
    setRequestId(null);
    setToast(null);
    try {
      const created = await postJson<CaseView>("/cases/from-fixture", { fixture_id: fixtureId });
      let processRequestId: string | null = null;
      let processed = await api<CaseView>(`/cases/${created.case_id}/process`, { method: "POST" }, (headers) => {
        processRequestId = headers.get("X-Request-ID");
      });
      // A reviewer reading the case starts the server-side review timer (B-11). If that read fails,
      // the processed case is still shown; only the timing is lost.
      if (role === "reviewer" && processed.status === "needs_review") {
        processed = await fetchCase(processed.case_id).catch(() => processed);
      }
      if (epoch !== sessionEpoch.current) return;
      if (processRequestId) requestIds.current.set(processed.case_id, processRequestId);
      setRequestId(processRequestId);
      setCaseView(processed);
      remember(processed);
      setResolutionNote("");
      if (processed.status === "failed") notify("Processing failed visibly; nothing was approved.", "error");
    } catch (error) {
      if (epoch !== sessionEpoch.current) return;
      if (error instanceof ApiError && error.status === 429) {
        notify(errorDetail(error) ?? "Processing limit reached. Wait a moment or log in as a reviewer.", "error");
      } else {
        notify(isConflict(error) ? "This case is already processing." : "The case could not be processed.", "error");
      }
    } finally {
      if (epoch === sessionEpoch.current) {
        setBusy(false);
        setProcessingId(null);
        setProcessingStart(null);
      }
    }
  };

  /** Open a document: reuse this session's processed case when there is one, otherwise process it. */
  const openFixture = async (fixtureId: string) => {
    const known = knownCases[fixtureId];
    if (!known) return createAndProcess(fixtureId);
    if (known.case_id === caseView?.case_id) return;
    const epoch = sessionEpoch.current;
    setOpeningId(fixtureId);
    try {
      const view = await fetchCase(known.case_id);
      if (epoch !== sessionEpoch.current) return;
      setCaseView(view);
      setRequestId(requestIds.current.get(view.case_id) ?? null);
      setResolutionNote("");
      remember(view);
    } catch {
      if (epoch !== sessionEpoch.current) return;
      // The stored case is gone (for example after a server reset): process the document again.
      setKnownCases((current) => {
        const next = { ...current };
        delete next[fixtureId];
        return next;
      });
      await createAndProcess(fixtureId);
    } finally {
      if (epoch === sessionEpoch.current) setOpeningId(null);
    }
  };

  const login = async (password: string) => {
    try {
      const session = await postJson<Session>("/session/login", { password });
      setRole(session.role);
      notify("Logged in as a reviewer.", "success");
      // Login carries this session's cases over to the reviewer session.
      loadCases();
      // Re-read an open case as the reviewer so the server starts its review timer (B-11).
      if (caseView) {
        const epoch = sessionEpoch.current;
        fetchCase(caseView.case_id)
          .then((fresh) => epoch === sessionEpoch.current && setCaseView(fresh))
          .catch(() => notify("The open case could not be refreshed.", "error"));
      }
      return true;
    } catch {
      return false;
    }
  };

  const logout = async () => {
    // Clear the case view on logout so the next person does not see it (B-12.6), even if the
    // request fails; the role only drops to visitor once the server has revoked the session.
    sessionEpoch.current += 1;
    setCaseView(null);
    setKnownCases({});
    requestIds.current.clear();
    setRequestId(null);
    setResolutionNote("");
    setBusy(false);
    setProcessingId(null);
    setProcessingStart(null);
    try {
      await api<void>("/session/logout", { method: "POST" });
    } catch {
      notify("Logout failed. You are still logged in as a reviewer; try again.", "error");
      return;
    }
    setRole("visitor");
    notify("Logged out.", "success");
    // Logout revokes the session cookie; start a fresh visitor session for the next case.
    try {
      setRole((await api<Session>("/session", { method: "POST" })).role);
    } catch {
      notify("Logged out. Reload the page to start a new session.", "error");
    }
  };

  const review = async (decision: "approve" | "reject") => {
    const revision = caseView?.revision;
    if (!caseView || !revision) return;
    const { gate } = revision;
    const noteMissing = gate.requires_resolution_note && resolutionNote.trim().length < 10;
    if (decision === "approve" && (!gate.approvable || noteMissing)) {
      notify(
        gate.requires_resolution_note
          ? "A resolution note of at least 10 characters is required."
          : "Approval is blocked by the current gate.",
        "error",
      );
      return;
    }
    const epoch = sessionEpoch.current;
    setBusy(true);
    try {
      const updated = await postJson<CaseView>(`/cases/${caseView.case_id}/review`, {
        revision_id: revision.revision_id,
        content_hash: revision.content_hash,
        decision,
        resolution_note: resolutionNote || null,
      });
      if (epoch !== sessionEpoch.current) return;
      setCaseView(updated);
      remember(updated);
      notify(decision === "approve" ? "Revision approved." : "Revision rejected.", "success");
    } catch (error) {
      if (epoch !== sessionEpoch.current) return;
      notify(
        isConflict(error)
          ? "Review conflict: this revision is stale or blocked. Reload and review the current revision."
          : "The review could not be saved.",
        "error",
      );
    } finally {
      if (epoch === sessionEpoch.current) setBusy(false);
    }
  };

  const revision = caseView?.revision ?? null;
  const fixtureTitle = fixtures.find((fixture) => fixture.id === caseView?.fixture_id)?.title ?? null;
  const processing = processingId !== null;

  const sidebarFooter = (
    <>
      <ProviderPill
        mode={providerMode ?? revision?.provider_mode ?? null}
        host={inferenceHost}
        revision={revision}
        requestId={requestId}
      />
      <div className="session-row">
        {role === "reviewer" ? (
          <>
            <span className="pill pill-role">
              <Icon name="userCheck" size={14} />
              Reviewer
            </span>
            <button type="button" className="button button-sm button-ghost" onClick={logout}>
              <Icon name="logout" size={14} />
              Log out
            </button>
          </>
        ) : (
          <LoginDialog onLogin={login} />
        )}
        <ThemeToggle />
      </div>
    </>
  );

  const openFixtureData = fixtures.find((fixture) => fixture.id === caseView?.fixture_id) ?? null;
  const toolbar = caseView ? (
    <CaseHeader
      caseView={caseView}
      title={fixtureTitle}
      description={openFixtureData?.description ?? null}
      actions={
        <button
          type="button"
          className="button button-sm"
          disabled={busy || openingId !== null}
          title="Run the model on this document again. Each run uses the shared model quota."
          onClick={() => createAndProcess(caseView.fixture_id)}
        >
          <Icon name="cpu" size={14} />
          Run again
        </button>
      }
    />
  ) : (
    <div className="toolbar-content">
      <div className="case-title">
        <h1>{processing ? "Processing document…" : "No document open"}</h1>
        {processing && (
          <span className="elapsed" role="timer" aria-live="off">
            {elapsed} s elapsed
          </span>
        )}
      </div>
      <p className="muted toolbar-hint">Review. Verify. Approve.</p>
    </div>
  );
  const statuses = Object.fromEntries(Object.values(knownCases).map((item) => [item.fixture_id, item.status]));

  return (
    <AppShell
      sidebar={
        <CaseNav
          fixtures={fixtures}
          activeId={processingId ?? openingId ?? caseView?.fixture_id ?? null}
          statuses={statuses}
          processingId={processingId}
          openingId={openingId}
          elapsedSeconds={elapsed}
          onPick={openFixture}
        />
      }
      sidebarFooter={sidebarFooter}
      toolbar={toolbar}
      strip={caseView || processing ? <Pipeline caseView={caseView} processing={processing} variant="strip" /> : null}
    >
      {processing && <WorkspaceSkeleton />}

      {!processing && !caseView && (
        <div className="empty-state">
          <div className="empty-intro">
            <span className="empty-icon">
              <Icon name="file" size={24} />
            </span>
            <h2>Select a discharge document</h2>
            <p className="muted">
              Choose a synthetic document from the list. BridgeCare extracts every field with its quote, blocks unsafe
              output, and waits for a reviewer before anything reaches the patient.
            </p>
            <p className="empty-note">
              <Icon name="shieldCheck" size={14} />
              Synthetic documents only. Uploads are disabled.
            </p>
          </div>
          <Pipeline caseView={null} processing={false} variant="guide" />
        </div>
      )}

      {caseView &&
        (revision ? (
          <CitationInspector
            key={revision.revision_id}
            documents={caseView.source_documents}
            revision={revision}
            approved={caseView.status === "approved"}
            decision={
              <ReviewBar
                role={role}
                revision={revision}
                review={caseView.review}
                note={resolutionNote}
                onNoteChange={setResolutionNote}
                onDecide={review}
                busy={busy}
              />
            }
            after={
              <PatientSheet
                key={`${revision.revision_id}-${caseView.status}-${role}`}
                caseId={caseView.case_id}
                approved={caseView.status === "approved"}
                role={role}
              />
            }
          />
        ) : (
          <div className="empty-state">
            <div className="card failure-card">
              <Icon name="alert" size={22} />
              <div>
                <h2>Processing did not produce a reviewable revision.</h2>
                <p className="muted">
                  The failure is shown as it happened. No content was generated, so there is nothing to approve.
                </p>
              </div>
            </div>
          </div>
        ))}

      <Toast toast={toast} onDismiss={dismissToast} />
    </AppShell>
  );
}
