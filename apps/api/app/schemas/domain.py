from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.providers.base import ProviderMode

EvidenceState = Literal["supported", "missing", "ambiguous", "conflicting"]
CaseStatus = Literal["received", "processing", "needs_review", "approved", "rejected", "failed"]
BlockReasonCode = Literal[
    "schema_invalid",
    "citation_not_found",
    "medication_not_verbatim",
    "conflicting_field",
    "insufficient_text",
    "provider_error",
    "truncated_output",
]
FailureReason = Literal[
    "schema_invalid",
    "provider_error",
    "truncated_output",
    "insufficient_text",
    "fixture_unavailable",
    "interrupted",
]
Scenario = Literal[
    "clear", "missing_fields", "contradictory", "prompt_injection", "provider_failure"
]
ShortText = Annotated[str | None, Field(max_length=300)]


class StrictModel(BaseModel):
    # Unknown keys are rejected, so a model cannot smuggle state such as "status": "approved".
    model_config = ConfigDict(extra="forbid")


# --- Model output schema (docs/domain-spec.md section 2) ---


class Citation(StrictModel):
    document_id: str = Field(min_length=1, max_length=100)
    page: int = Field(ge=1)
    quote: str = Field(min_length=1, max_length=1000)


class Medication(StrictModel):
    name: ShortText = None
    dose: ShortText = None
    unit: ShortText = None
    route: ShortText = None
    frequency: ShortText = None
    duration: ShortText = None
    evidence_state: EvidenceState
    citations: list[Citation] = Field(default_factory=list, max_length=10)


class FollowUp(StrictModel):
    instruction: str | None = Field(default=None, max_length=500)
    timeframe: ShortText = None
    evidence_state: EvidenceState
    citations: list[Citation] = Field(default_factory=list, max_length=10)


class TextItem(StrictModel):
    text: str | None = Field(default=None, max_length=1000)
    evidence_state: EvidenceState
    citations: list[Citation] = Field(default_factory=list, max_length=10)


class Uncertainty(StrictModel):
    field: str = Field(max_length=200)
    note: str = Field(max_length=500)


class ExtractedFields(StrictModel):
    medications: list[Medication] = Field(max_length=30)
    follow_up: list[FollowUp] = Field(max_length=20)
    warning_signs: list[TextItem] = Field(max_length=20)
    activity: TextItem
    diet: TextItem


class ModelExtraction(ExtractedFields):
    patient_summary: str | None = Field(default=None, max_length=2000)
    uncertainties: list[Uncertainty] = Field(default_factory=list, max_length=30)


# --- Fixtures ---


class SourcePage(BaseModel):
    page: int = Field(ge=1)
    text: str


class SourceDocument(BaseModel):
    document_id: str
    title: str
    pages: list[SourcePage]


class FixtureSummary(BaseModel):
    id: str
    title: str
    scenario: Scenario
    description: str


# --- Cases, revisions and review ---


class BlockingReason(BaseModel):
    code: BlockReasonCode
    field: str | None = None
    message: str


class Gate(BaseModel):
    approvable: bool
    requires_resolution_note: bool
    blocking_reasons: list[BlockingReason]


class PatientDraft(StrictModel):
    summary: str | None = Field(default=None, max_length=2000)


class Timings(BaseModel):
    model_ms: float | None
    total_ms: float


class RevisionView(BaseModel):
    revision_id: str
    number: int
    content_hash: str
    origin: Literal["model", "reviewer_edit"]
    source_documents: list[SourceDocument]
    extracted_fields: ExtractedFields
    patient_draft: PatientDraft
    uncertainties: list[Uncertainty]
    gate: Gate
    provider_mode: ProviderMode
    model: str
    prompt_version: str
    timings: Timings
    created_at: datetime


class ReviewRecord(BaseModel):
    revision_id: str
    content_hash: str
    decision: Literal["approve", "reject"]
    resolution_note: str | None
    reviewed_at: datetime
    opened_at: datetime | None = None
    duration_ms: float | None = None


class CaseView(BaseModel):
    case_id: str
    fixture_id: str
    status: CaseStatus
    failure_reason: FailureReason | None
    created_at: datetime
    updated_at: datetime
    source_documents: list[SourceDocument]
    revision: RevisionView | None
    review: ReviewRecord | None


class CaseSummary(BaseModel):
    case_id: str
    fixture_id: str
    status: CaseStatus
    updated_at: datetime


class CreateCaseRequest(BaseModel):
    fixture_id: str = Field(min_length=1, max_length=100)


class DraftUpdateRequest(StrictModel):
    revision_id: str
    content_hash: str
    extracted_fields: ExtractedFields
    patient_draft: PatientDraft


class ReviewRequest(StrictModel):
    revision_id: str
    content_hash: str
    decision: Literal["approve", "reject"]
    resolution_note: str | None = Field(default=None, max_length=2000)


class PatientMedicationRow(BaseModel):
    name: str | None
    dose: str | None
    unit: str | None
    route: str | None
    frequency: str | None
    duration: str | None


class PatientFollowUp(BaseModel):
    instruction: str | None
    timeframe: str | None


class PatientView(BaseModel):
    case_id: str
    revision_id: str
    content_hash: str
    approved_at: datetime
    provider_mode: ProviderMode
    language: Literal["en", "es"] = "en"
    summary: str | None
    medications: list[PatientMedicationRow]
    follow_up: list[PatientFollowUp]
    warning_signs: list[str]
    activity: str | None
    diet: str | None
    notice: str
