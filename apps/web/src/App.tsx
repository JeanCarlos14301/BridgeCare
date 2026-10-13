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
import { AppShell } from "./components/AppShell";
import { CaseHeader } from "./components/CaseHeader";
import { CaseOverview } from "./components/CaseOverview";
import { CitationInspector } from "./components/CitationInspector";
import { Icon } from "./components/Icon";
import { LoginDialog } from "./components/LoginDialog";
import { PatientSheet } from "./components/PatientSheet";
import { Pipeline } from "./components/Pipeline";
import { ProviderPill } from "./components/ProviderPill";
import { ReviewBar } from "./components/ReviewBar";
import { ScenarioPicker } from "./components/ScenarioPicker";
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
  const session =
    role === "reviewer" ? (
      <>
        <span className="pill pill-role">
          <Icon name="userCheck" size={14} />
          Reviewer
        </span>
        <button type="button" className="button button-sm" onClick={logout}>
          <Icon name="logout" size={14} />
          Log out
        </button>
      </>
    ) : (
      <LoginDialog onLogin={login} />
    );

  return (
    <AppShell
      status={<ProviderPill mode={providerMode ?? revision?.provider_mode ?? null} revision={revision} />}
      session={session}
    >
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow hero-eyebrow">
            <Icon name="shieldCheck" size={14} />
            Synthetic documents only
          </p>
          <h1 id="hero-title">
            Review. Verify. <span className="brand-text">Approve.</span>
          </h1>
          <p className="lede">
            BridgeCare turns a discharge document into a patient sheet. Every value links to its quote, unsafe output
            is blocked, and only a reviewer can release it.
          </p>
        </div>
        <ScenarioPicker
          fixtures={fixtures}
          activeId={caseView?.fixture_id ?? null}
          processingId={processingId}
          onPick={createAndProcess}
        />
      </section>

      <Pipeline caseView={caseView} processing={processingId !== null} />

      {processingId !== null && <WorkspaceSkeleton />}

      {caseView && (
        <div className="case-area">
          <CaseHeader caseView={caseView} title={fixtureTitle} />
          {revision ? (
            <>
              <CaseOverview revision={revision} />
              <CitationInspector
                key={revision.revision_id}
                documents={caseView.source_documents}
                revision={revision}
                approved={caseView.status === "approved"}
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
            </>
          ) : (
            <div className="card failure-card">
              <Icon name="alert" size={22} />
              <div>
                <h2>Processing did not produce a reviewable revision.</h2>
                <p className="muted">
                  The failure is shown as it happened. No content was generated, so there is nothing to approve.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </AppShell>
  );
}
