import asyncio
import hashlib
import json
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal, cast

from sqlalchemy import text
from sqlalchemy.engine import CursorResult, Engine
from sqlalchemy.orm import Session

from app.core.errors import DomainError, ProviderError
from app.core.sessions import SessionInfo
from app.prompts.extraction import PROMPT_VERSION, SYSTEM_PROMPT, build_user_prompt
from app.providers.base import ExtractionRequest, LLMProvider
from app.schemas.domain import (
    CaseStatus,
    CaseSummary,
    CaseView,
    DraftUpdateRequest,
    ExtractedFields,
    FailureReason,
    PatientFollowUp,
    PatientMedicationRow,
    PatientView,
    ReviewRecord,
    ReviewRequest,
    RevisionView,
    SourceDocument,
)
from app.services.fixtures import FixtureCatalog
from app.services.localization import localize_patient_view
from app.services.validation import (
    MIN_DOCUMENT_CHARACTERS,
    document_text_length,
    evaluate_gate,
    extracted_fields_of,
    parse_model_output,
)

MIN_RESOLUTION_NOTE = 10
MAX_VISITOR_PROCESSINGS_PER_SESSION = 3
MAX_VISITOR_PROCESSINGS_PER_MINUTE = 2
MAX_GLOBAL_VISITOR_PROCESSINGS_PER_MINUTE = 10
VISITOR_RATE_WINDOW_SECONDS = 60.0
PATIENT_NOTICE = (
    "This sheet was prepared with AI assistance and approved by a care team reviewer. "
    "Follow your care team's instructions and contact them with any questions."
)


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="microseconds")


def _rowcount(result: object) -> int:
    # UPDATE and DELETE statements return a CursorResult; Session.execute is typed as Result.
    return cast(CursorResult[Any], result).rowcount


def canonical_json(content: dict[str, Any]) -> str:
    return json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def hash_content(content: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(content).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class CaseRow:
    id: str
    session_id: str
    fixture_id: str
    status: CaseStatus
    current_revision_id: str | None
    failure_reason: FailureReason | None
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class RevisionRow:
    id: str
    number: int
    content_hash: str
    content: dict[str, Any]
    created_at: str


def mark_interrupted_jobs(engine: Engine) -> int:
    """Cases left in processing by a restart cannot finish; mark them failed."""
    with engine.begin() as connection:
        result = connection.execute(
            text(
                "UPDATE cases SET status = 'failed', failure_reason = 'interrupted', "
                "updated_at = :now WHERE status = 'processing'"
            ),
            {"now": _now()},
        )
        return result.rowcount


class CaseService:
    """Server-owned case lifecycle. No model output or request body ever sets a status."""

    def __init__(self, catalog: FixtureCatalog, provider: LLMProvider) -> None:
        self.catalog = catalog
        self.provider = provider
        # One processing job per API instance.
        self._processing = asyncio.Lock()
        # Track processing timestamps per visitor session to protect Token Factory quota.
        self._visitor_processings: dict[str, list[float]] = {}
        self._global_visitor_processings: list[float] = []

    def _check_visitor_processing_limit(self, session: SessionInfo) -> None:
        if session.role != "visitor":
            return
        now = time.monotonic()
        cutoff = now - VISITOR_RATE_WINDOW_SECONDS
        self._global_visitor_processings = [
            t for t in self._global_visitor_processings if t > cutoff
        ]
        if len(self._global_visitor_processings) >= MAX_GLOBAL_VISITOR_PROCESSINGS_PER_MINUTE:
            raise DomainError(
                "Global visitor processing limit reached to protect API quota. "
                "Please wait a moment or log in as a reviewer.",
                status_code=429,
            )
        history = self._visitor_processings.setdefault(session.id, [])
        if len(history) >= MAX_VISITOR_PROCESSINGS_PER_SESSION:
            raise DomainError(
                "Visitor processing limit reached (maximum 3 runs per session). "
                "Please log in as a reviewer for unlimited access.",
                status_code=429,
            )
        recent = [t for t in history if now - t <= VISITOR_RATE_WINDOW_SECONDS]
        if len(recent) >= MAX_VISITOR_PROCESSINGS_PER_MINUTE:
            raise DomainError(
                "Processing rate limit exceeded. Please wait a moment before trying again.",
                status_code=429,
            )

    def _record_visitor_processing(self, session: SessionInfo) -> None:
        if session.role != "visitor":
            return
        now = time.monotonic()
        history = self._visitor_processings.setdefault(session.id, [])
        history.append(now)
        self._global_visitor_processings.append(now)

    def _check_and_record_visitor_processing(self, session: SessionInfo) -> None:
        self._check_visitor_processing_limit(session)
        self._record_visitor_processing(session)

    def record_review_opened(
        self, db: Session, case: CaseRow, reviewer: SessionInfo
    ) -> None:
        if (
            reviewer.role != "reviewer"
            or case.status != "needs_review"
            or case.current_revision_id is None
        ):
            return
        db.execute(
            text(
                "INSERT OR IGNORE INTO review_timers (revision_id, opened_at) "
                "VALUES (:revision_id, :now)"
            ),
            {"revision_id": case.current_revision_id, "now": _now()},
        )
        db.commit()

    # --- reads ---

    def get(self, db: Session, case_id: str) -> CaseRow | None:
        row = db.execute(
            text("SELECT * FROM cases WHERE id = :id"), {"id": case_id}
        ).mappings().one_or_none()
        return CaseRow(**row) if row is not None else None

    def list_for_session(self, db: Session, session: SessionInfo) -> list[CaseSummary]:
        rows = db.execute(
            text(
                "SELECT id, fixture_id, status, updated_at FROM cases "
                "WHERE session_id = :session_id ORDER BY created_at DESC"
            ),
            {"session_id": session.id},
        ).mappings()
        return [
            CaseSummary(
                case_id=row["id"],
                fixture_id=row["fixture_id"],
                status=row["status"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]

    def _revision(self, db: Session, revision_id: str | None) -> RevisionRow | None:
        if revision_id is None:
            return None
        row = db.execute(
            text(
                "SELECT id, number, content_hash, content, created_at FROM revisions "
                "WHERE id = :id"
            ),
            {"id": revision_id},
        ).mappings().one_or_none()
        if row is None:
            return None
        return RevisionRow(
            id=row["id"],
            number=row["number"],
            content_hash=row["content_hash"],
            content=json.loads(row["content"]),
            created_at=row["created_at"],
        )

    def _latest_review(self, db: Session, revision_id: str | None) -> ReviewRecord | None:
        if revision_id is None:
            return None
        row = db.execute(
            text(
                "SELECT revision_id, content_hash, decision, resolution_note, created_at, "
                "opened_at, duration_ms "
                "FROM reviews WHERE revision_id = :revision_id "
                "ORDER BY created_at DESC LIMIT 1"
            ),
            {"revision_id": revision_id},
        ).mappings().one_or_none()
        if row is None:
            return None
        return ReviewRecord(
            revision_id=row["revision_id"],
            content_hash=row["content_hash"],
            decision=row["decision"],
            resolution_note=row["resolution_note"],
            reviewed_at=row["created_at"],
            opened_at=datetime.fromisoformat(row["opened_at"]) if row["opened_at"] else None,
            duration_ms=row["duration_ms"],
        )

    def _source_documents(self, fixture_id: str) -> list[SourceDocument]:
        fixture = self.catalog.get(fixture_id)
        return [fixture.document] if fixture is not None else []

    def view(self, db: Session, case: CaseRow) -> CaseView:
        revision = self._revision(db, case.current_revision_id)
        return CaseView(
            case_id=case.id,
            fixture_id=case.fixture_id,
            status=case.status,
            failure_reason=case.failure_reason,
            created_at=datetime.fromisoformat(case.created_at),
            updated_at=datetime.fromisoformat(case.updated_at),
            source_documents=self._source_documents(case.fixture_id),
            revision=self._revision_view(revision) if revision is not None else None,
            review=self._latest_review(db, case.current_revision_id),
        )

    @staticmethod
    def _revision_view(revision: RevisionRow) -> RevisionView:
        return RevisionView.model_validate(
            {
                **revision.content,
                "revision_id": revision.id,
                "number": revision.number,
                "content_hash": revision.content_hash,
                "created_at": revision.created_at,
            }
        )

    # --- writes ---

    def create_from_fixture(self, db: Session, session: SessionInfo, fixture_id: str) -> CaseRow:
        if self.catalog.get(fixture_id) is None:
            raise DomainError("Fixture not found", status_code=404)
        now = _now()
        case_id = uuid.uuid4().hex
        db.execute(
            text(
                "INSERT INTO cases (id, session_id, fixture_id, status, created_at, updated_at) "
                "VALUES (:id, :session_id, :fixture_id, 'received', :now, :now)"
            ),
            {"id": case_id, "session_id": session.id, "fixture_id": fixture_id, "now": now},
        )
        db.commit()
        case = self.get(db, case_id)
        assert case is not None
        return case

    def delete(self, db: Session, case: CaseRow) -> None:
        if case.status == "processing":
            raise DomainError("Case is processing and cannot be deleted yet", status_code=409)
        db.execute(text("DELETE FROM cases WHERE id = :id"), {"id": case.id})
        db.commit()

    def _fail(self, db: Session, case_id: str, reason: FailureReason) -> None:
        db.execute(
            text(
                "UPDATE cases SET status = 'failed', failure_reason = :reason, updated_at = :now "
                "WHERE id = :id AND status = 'processing'"
            ),
            {"id": case_id, "reason": reason, "now": _now()},
        )
        db.commit()

    def _add_revision(
        self,
        db: Session,
        case_id: str,
        content: dict[str, Any],
        *,
        expected_status: str | None = None,
        expected_revision_id: str | None = None,
    ) -> None:
        number = db.execute(
            text("SELECT COALESCE(MAX(number), 0) + 1 FROM revisions WHERE case_id = :id"),
            {"id": case_id},
        ).scalar_one()
        revision_id = uuid.uuid4().hex
        now = _now()
        db.execute(
            text(
                "INSERT INTO revisions (id, case_id, number, content_hash, content, created_at) "
                "VALUES (:id, :case_id, :number, :hash, :content, :now)"
            ),
            {
                "id": revision_id,
                "case_id": case_id,
                "number": number,
                "hash": hash_content(content),
                "content": canonical_json(content),
                "now": now,
            },
        )
        # Compare-and-set: the case must still be in the state this revision was built from.
        condition = (
            "status = :expected_status"
            if expected_status is not None
            else "current_revision_id = :expected_revision_id"
        )
        updated = _rowcount(db.execute(
            text(
                "UPDATE cases SET current_revision_id = :revision_id, status = 'needs_review', "
                f"failure_reason = NULL, updated_at = :now WHERE id = :id AND {condition}"
            ),
            {
                "revision_id": revision_id,
                "now": now,
                "id": case_id,
                "expected_status": expected_status,
                "expected_revision_id": expected_revision_id,
            },
        ))
        if updated != 1:
            db.rollback()
            raise DomainError("Revision is stale; reload the case", status_code=409)
        db.commit()

    async def process(
        self, db: Session, case: CaseRow, session: SessionInfo | None = None
    ) -> None:
        if session is not None:
            self._check_visitor_processing_limit(session)
        if self._processing.locked():
            raise DomainError("Another case is being processed; try again shortly", status_code=409)
        claimed = _rowcount(db.execute(
            text(
                "UPDATE cases SET status = 'processing', failure_reason = NULL, updated_at = :now "
                "WHERE id = :id AND status != 'processing'"
            ),
            {"id": case.id, "now": _now()},
        ))
        db.commit()
        if claimed != 1:
            raise DomainError("Case is already processing", status_code=409)
        if session is not None:
            self._record_visitor_processing(session)
        async with self._processing:
            try:
                await self._run_extraction(db, case)
            except Exception:
                self._fail(db, case.id, "provider_error")
                raise

    async def _run_extraction(self, db: Session, case: CaseRow) -> None:
        started = time.perf_counter()
        fixture = self.catalog.get(case.fixture_id)
        if fixture is None:
            self._fail(db, case.id, "fixture_unavailable")
            return
        documents = [fixture.document]
        if document_text_length(documents) < MIN_DOCUMENT_CHARACTERS:
            self._fail(db, case.id, "insufficient_text")
            return
        request = ExtractionRequest(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=build_user_prompt(documents),
            fixture_id=fixture.meta.id,
        )
        model_started = time.perf_counter()
        try:
            result = await self.provider.extract(request)
        except ProviderError:
            self._fail(db, case.id, "provider_error")
            return
        model_ms = round((time.perf_counter() - model_started) * 1000, 2)
        if result.truncated:
            self._fail(db, case.id, "truncated_output")
            return
        parsed = parse_model_output(result.raw_text)
        if parsed.extraction is None:
            self._fail(db, case.id, "schema_invalid")
            return
        fields = extracted_fields_of(parsed.extraction)
        content = {
            "origin": "model",
            "source_documents": [document.model_dump() for document in documents],
            "extracted_fields": fields.model_dump(),
            "patient_draft": {"summary": parsed.extraction.patient_summary},
            "uncertainties": [u.model_dump() for u in parsed.extraction.uncertainties],
            "gate": evaluate_gate(fields, documents).model_dump(),
            "provider_mode": result.provider_mode,
            "model": result.model,
            "prompt_version": PROMPT_VERSION,
            "timings": {
                "model_ms": model_ms,
                "total_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        }
        self._add_revision(db, case.id, content, expected_status="processing")

    def _current(
        self, db: Session, case: CaseRow, revision_id: str, content_hash: str
    ) -> RevisionRow:
        revision = self._revision(db, case.current_revision_id)
        if (
            revision is None
            or revision.id != revision_id
            or revision.content_hash != content_hash
        ):
            raise DomainError("Revision is stale; reload the case", status_code=409)
        return revision

    def update_draft(self, db: Session, case: CaseRow, request: DraftUpdateRequest) -> None:
        if case.status not in ("needs_review", "approved", "rejected"):
            raise DomainError("Case has no draft to edit", status_code=409)
        revision = self._current(db, case, request.revision_id, request.content_hash)
        documents = [
            SourceDocument.model_validate(document)
            for document in revision.content["source_documents"]
        ]
        content = {
            **revision.content,
            "origin": "reviewer_edit",
            "extracted_fields": request.extracted_fields.model_dump(),
            "patient_draft": request.patient_draft.model_dump(),
            "gate": evaluate_gate(request.extracted_fields, documents).model_dump(),
            "timings": {"model_ms": None, "total_ms": 0.0},
        }
        # A new revision always returns the case to needs_review and orphans prior approvals.
        self._add_revision(db, case.id, content, expected_revision_id=revision.id)

    def review(
        self, db: Session, case: CaseRow, reviewer: SessionInfo, request: ReviewRequest
    ) -> None:
        if case.status != "needs_review":
            raise DomainError("Case is not awaiting review", status_code=409)
        revision = self._current(db, case, request.revision_id, request.content_hash)
        note = (request.resolution_note or "").strip() or None
        if request.decision == "approve":
            gate = self._revision_view(revision).gate
            if not gate.approvable:
                codes = sorted({reason.code for reason in gate.blocking_reasons})
                raise DomainError(
                    "Approval is blocked: " + ", ".join(codes), status_code=409
                )
            if gate.requires_resolution_note and (
                note is None or len(note) < MIN_RESOLUTION_NOTE
            ):
                raise DomainError(
                    "Approving a conflicting field requires a resolution note "
                    f"of at least {MIN_RESOLUTION_NOTE} characters",
                    status_code=409,
                )
        new_status = "approved" if request.decision == "approve" else "rejected"
        now = _now()
        timer_row = db.execute(
            text("SELECT opened_at FROM review_timers WHERE revision_id = :revision_id"),
            {"revision_id": revision.id},
        ).mappings().one_or_none()
        opened_at_raw = timer_row["opened_at"] if timer_row is not None else None
        if isinstance(opened_at_raw, str):
            opened_at_str: str | None = opened_at_raw
            opened_dt = datetime.fromisoformat(opened_at_raw)
            now_dt = datetime.fromisoformat(now)
            duration_ms: float | None = max(
                round((now_dt - opened_dt).total_seconds() * 1000, 2), 0.0
            )
        else:
            opened_at_str = None
            duration_ms = None

        updated = _rowcount(db.execute(
            text(
                "UPDATE cases SET status = :status, updated_at = :now WHERE id = :id "
                "AND status = 'needs_review' AND current_revision_id = :revision_id"
            ),
            {"status": new_status, "now": now, "id": case.id, "revision_id": revision.id},
        ))
        if updated != 1:
            db.rollback()
            raise DomainError("Revision is stale; reload the case", status_code=409)
        db.execute(
            text(
                "INSERT INTO reviews (id, case_id, revision_id, content_hash, decision, "
                "resolution_note, reviewer_session_id, created_at, opened_at, duration_ms) "
                "VALUES (:id, :case_id, :revision_id, :hash, :decision, :note, :reviewer, "
                ":now, :opened_at, :duration_ms)"
            ),
            {
                "id": uuid.uuid4().hex,
                "case_id": case.id,
                "revision_id": revision.id,
                "hash": revision.content_hash,
                "decision": request.decision,
                "note": note,
                "reviewer": reviewer.id,
                "now": now,
                "opened_at": opened_at_str,
                "duration_ms": duration_ms,
            },
        )
        db.commit()

    def _build_patient_view(
        self, case: CaseRow, revision: RevisionRow, approved_at: datetime
    ) -> PatientView:
        fields = ExtractedFields.model_validate(revision.content["extracted_fields"])
        return PatientView(
            case_id=case.id,
            revision_id=revision.id,
            content_hash=revision.content_hash,
            approved_at=approved_at,
            provider_mode=revision.content["provider_mode"],
            language="en",
            summary=revision.content["patient_draft"].get("summary"),
            medications=[
                PatientMedicationRow(
                    name=m.name,
                    dose=m.dose,
                    unit=m.unit,
                    route=m.route,
                    frequency=m.frequency,
                    duration=m.duration,
                )
                for m in fields.medications
            ],
            follow_up=[
                PatientFollowUp(instruction=f.instruction, timeframe=f.timeframe)
                for f in fields.follow_up
            ],
            warning_signs=[s.text for s in fields.warning_signs if s.text],
            activity=fields.activity.text,
            diet=fields.diet.text,
            notice=PATIENT_NOTICE,
        )

    def patient_view(
        self, db: Session, case: CaseRow, lang: Literal["en", "es"] = "en"
    ) -> PatientView:
        revision = self._revision(db, case.current_revision_id)
        review = self._latest_review(db, case.current_revision_id)
        if (
            case.status != "approved"
            or revision is None
            or review is None
            or review.decision != "approve"
            or review.revision_id != revision.id
            or review.content_hash != revision.content_hash
        ):
            raise DomainError(
                "Patient view requires an approved current revision", status_code=409
            )
        view = self._build_patient_view(case, revision, review.reviewed_at)
        if lang == "es":
            return localize_patient_view(view, "es")
        return view

    def preview_patient_view(
        self, db: Session, case: CaseRow, lang: Literal["en", "es"] = "en"
    ) -> PatientView:
        revision = self._revision(db, case.current_revision_id)
        if revision is None:
            raise DomainError("Case has no revision to preview", status_code=409)
        view = self._build_patient_view(
            case, revision, datetime.fromisoformat(case.updated_at)
        )
        if lang == "es":
            return localize_patient_view(view, "es")
        return view
