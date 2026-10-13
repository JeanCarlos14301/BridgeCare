import { useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  type CaseView,
  type Fixture,
  isConflict,
  postJson,
  type ProviderMode,
  type Role,
} from "./api";
import { AppShell, ThemeToggle } from "./components/AppShell";
import { CaseHeader } from "./components/CaseHeader";
import { CaseNav } from "./components/CaseNav";
import { CaseOverview } from "./components/CaseOverview";
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

export default function App() {
  const [providerMode, setProviderMode] = useState<ProviderMode | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const [role, setRole] = useState<Role>("visitor");
  const [resolutionNote, setResolutionNote] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped on logout so responses to requests started before it are dropped (B-12.6).
  const sessionEpoch = useRef(0);
  const toastId = useRef(0);

  const notify = useCallback((text: string, tone: ToastTone = "info") => {
    toastId.current += 1;
    setToast({ id: toastId.current, text, tone });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    // The MOCK badge must be visible before any case is processed (B-12.1).
    api<{ provider_mode: ProviderMode }>("/health")
      .then((health) => setProviderMode(health.provider_mode))
      .catch(() => setProviderMode(null));
    // The fixture list needs the session cookie, so it waits for the session to exist.
    api<Session>("/session", { method: "POST" })
      .then(async (session) => {
        setRole(session.role);
        setFixtures(await api<Fixture[]>("/fixtures"));
      })
      .catch(() => notify("The session or fixture list could not be loaded.", "error"));
  }, [notify]);

  const createAndProcess = async (fixtureId: string) => {
    const epoch = sessionEpoch.current;
    setBusy(true);
    setProcessingId(fixtureId);
    setCaseView(null);
    setToast(null);
    try {
      const created = await postJson<CaseView>("/cases/from-fixture", { fixture_id: fixtureId });
      const processed = await api<CaseView>(`/cases/${created.case_id}/process`, { method: "POST" });
      if (epoch !== sessionEpoch.current) return;
      setCaseView(processed);
      setResolutionNote("");
      if (processed.status === "failed") notify("Processing failed visibly; nothing was approved.", "error");
    } catch (error) {
      if (epoch !== sessionEpoch.current) return;
      notify(isConflict(error) ? "This case is already processing." : "The case could not be processed.", "error");
    } finally {
      if (epoch === sessionEpoch.current) {
        setBusy(false);
        setProcessingId(null);
      }
    }
  };

  const login = async (password: string) => {
    try {
      const session = await postJson<Session>("/session/login", { password });
      setRole(session.role);
      notify("Logged in as a reviewer.", "success");
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
    setResolutionNote("");
    setBusy(false);
    setProcessingId(null);
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
      <ProviderPill mode={providerMode ?? revision?.provider_mode ?? null} revision={revision} />
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

  const toolbar = caseView ? (
    <CaseHeader caseView={caseView} title={fixtureTitle} />
  ) : (
    <div className="toolbar-content">
      <div className="case-title">
        <h1>{processing ? "Processing document…" : "No document open"}</h1>
      </div>
      <p className="muted toolbar-hint">Review. Verify. Approve.</p>
    </div>
  );

  return (
    <AppShell
      sidebar={
        <CaseNav
          fixtures={fixtures}
          activeId={processingId ?? caseView?.fixture_id ?? null}
          activeStatus={caseView?.status ?? null}
          processingId={processingId}
          onPick={createAndProcess}
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
            railTop={<CaseOverview revision={revision} />}
            after={
              <>
                <ReviewBar
                  role={role}
                  revision={revision}
                  review={caseView.review}
                  note={resolutionNote}
                  onNoteChange={setResolutionNote}
                  onDecide={review}
                  busy={busy}
                />
                <PatientSheet
                  key={`${revision.revision_id}-${caseView.status}`}
                  caseId={caseView.case_id}
                  approved={caseView.status === "approved"}
                />
              </>
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
