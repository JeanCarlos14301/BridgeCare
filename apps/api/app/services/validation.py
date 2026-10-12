import json
import re
from dataclasses import dataclass, field

from pydantic import ValidationError

from app.schemas.domain import (
    BlockingReason,
    Citation,
    EvidenceState,
    ExtractedFields,
    Gate,
    ModelExtraction,
    SourceDocument,
)

MEDICATION_FIELDS = ("name", "dose", "unit", "route", "frequency", "duration")
MIN_DOCUMENT_CHARACTERS = 200


def normalize(value: str) -> str:
    return " ".join(value.split())


def contains_phrase(haystack: str, needle: str) -> bool:
    """Case-insensitive match on token boundaries.

    Plain substring matching would accept an altered dose such as "50" inside "500 mg",
    or "5" inside "5.5", so neighbouring letters, digits and decimal parts are excluded.
    """
    if not needle:
        return False
    pattern = (
        r"(?<![0-9A-Za-z])(?<!\d\.)" + re.escape(needle) + r"(?![0-9A-Za-z])(?!\.\d)"
    )
    return re.search(pattern, haystack, flags=re.IGNORECASE) is not None


@dataclass
class ParseOutcome:
    extraction: ModelExtraction | None
    failure: str | None = None


def parse_model_output(raw_text: str) -> ParseOutcome:
    """Parse and schema-check model output. Any failure is schema_invalid."""
    try:
        data = json.loads(raw_text)
        return ParseOutcome(ModelExtraction.model_validate(data))
    except (ValueError, ValidationError):
        return ParseOutcome(None, "schema_invalid")


def document_text_length(documents: list[SourceDocument]) -> int:
    return sum(len(normalize(page.text)) for document in documents for page in document.pages)


@dataclass
class _Checker:
    pages: dict[tuple[str, int], str]
    reasons: list[BlockingReason] = field(default_factory=list)

    def verified_quotes(self, path: str, citations: list[Citation]) -> list[str]:
        verified: list[str] = []
        for index, citation in enumerate(citations):
            page_text = self.pages.get((citation.document_id, citation.page))
            quote = normalize(citation.quote)
            if page_text is None or not quote or quote not in page_text:
                message = (
                    "The cited document or page does not exist."
                    if page_text is None
                    else "Quoted text was not found on the cited page."
                )
                self.reasons.append(
                    BlockingReason(
                        code="citation_not_found",
                        field=f"{path}.citations[{index}]",
                        message=message,
                    )
                )
            else:
                verified.append(quote)
        return verified

    def check_item(
        self, path: str, evidence_state: EvidenceState, citations: list[Citation]
    ) -> list[str]:
        if evidence_state == "conflicting":
            self.reasons.append(
                BlockingReason(
                    code="conflicting_field",
                    field=path,
                    message="The document states conflicting values.",
                )
            )
        if evidence_state != "missing" and not citations:
            self.reasons.append(
                BlockingReason(
                    code="citation_not_found",
                    field=path,
                    message="Item has no citation.",
                )
            )
        return self.verified_quotes(path, citations)


def evaluate_gate(fields: ExtractedFields, documents: list[SourceDocument]) -> Gate:
    """Compute blocking reasons for a revision.

    A verified quote proves the text exists on the page; it does not prove the extraction
    is semantically correct. That judgement belongs to the human reviewer.
    """
    checker = _Checker(
        pages={
            (document.document_id, page.page): normalize(page.text)
            for document in documents
            for page in document.pages
        }
    )
    for index, medication in enumerate(fields.medications):
        path = f"medications[{index}]"
        quotes = checker.check_item(path, medication.evidence_state, medication.citations)
        for name in MEDICATION_FIELDS:
            value = getattr(medication, name)
            if value is None:
                continue
            needle = normalize(value)
            if not any(contains_phrase(quote, needle) for quote in quotes):
                checker.reasons.append(
                    BlockingReason(
                        code="medication_not_verbatim",
                        field=f"{path}.{name}",
                        message="Value does not appear verbatim in a verified citation.",
                    )
                )
    for index, follow_up in enumerate(fields.follow_up):
        checker.check_item(f"follow_up[{index}]", follow_up.evidence_state, follow_up.citations)
    for index, sign in enumerate(fields.warning_signs):
        checker.check_item(f"warning_signs[{index}]", sign.evidence_state, sign.citations)
    checker.check_item("activity", fields.activity.evidence_state, fields.activity.citations)
    checker.check_item("diet", fields.diet.evidence_state, fields.diet.citations)

    reasons = checker.reasons
    only_conflicts = bool(reasons) and all(r.code == "conflicting_field" for r in reasons)
    return Gate(
        approvable=not reasons or only_conflicts,
        requires_resolution_note=only_conflicts,
        blocking_reasons=reasons,
    )


def extracted_fields_of(extraction: ModelExtraction) -> ExtractedFields:
    return ExtractedFields.model_validate(
        extraction.model_dump(exclude={"patient_summary", "uncertainties"})
    )
