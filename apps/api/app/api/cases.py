from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request, Response, status

from app.api.dependencies import (
    CurrentSession,
    DbSession,
    ReviewerSession,
    ensure_case_owner,
)
from app.core.errors import DomainError
from app.core.sessions import SessionInfo
from app.schemas.domain import (
    CaseSummary,
    CaseView,
    CreateCaseRequest,
    DraftUpdateRequest,
    FixtureSummary,
    PatientView,
    ReviewRequest,
)
from app.services.cases import CaseRow, CaseService

router = APIRouter(tags=["cases"])
CONFLICT: dict[int | str, dict[str, Any]] = {
    409: {"description": "Conflict with the current case state"}
}
NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"description": "Case not found for this session"}
}
TOO_MANY_REQUESTS: dict[int | str, dict[str, Any]] = {
    429: {"description": "Visitor processing limit or rate limit exceeded"}
}


def get_case_service(request: Request) -> CaseService:
    return request.app.state.case_service  # type: ignore[no-any-return]


Service = Annotated[CaseService, Depends(get_case_service)]


def _owned(service: CaseService, db: DbSession, current: SessionInfo, case_id: str) -> CaseRow:
    case = service.get(db, case_id)
    if case is None:
        raise DomainError("Case not found", status_code=404)
    ensure_case_owner(current, case.session_id)
    return case


@router.get("/fixtures", response_model=list[FixtureSummary])
async def list_fixtures(service: Service, _current: CurrentSession) -> list[FixtureSummary]:
    return service.catalog.list()


@router.post(
    "/cases/from-fixture",
    response_model=CaseView,
    status_code=status.HTTP_201_CREATED,
    responses={404: {"description": "Fixture not found"}},
)
async def create_case_from_fixture(
    payload: CreateCaseRequest, service: Service, db: DbSession, current: CurrentSession
) -> CaseView:
    case = service.create_from_fixture(db, current, payload.fixture_id)
    return service.view(db, case)


@router.get("/cases", response_model=list[CaseSummary])
async def list_cases(service: Service, db: DbSession, current: CurrentSession) -> list[CaseSummary]:
    return service.list_for_session(db, current)


@router.get("/cases/{case_id}", response_model=CaseView, responses=NOT_FOUND)
async def read_case(
    case_id: str, service: Service, db: DbSession, current: CurrentSession
) -> CaseView:
    case = _owned(service, db, current, case_id)
    if current.role == "reviewer":
        service.record_review_opened(db, case, current)
    return service.view(db, case)


@router.post(
    "/cases/{case_id}/process",
    response_model=CaseView,
    responses=NOT_FOUND | CONFLICT | TOO_MANY_REQUESTS,
)
async def process_case(
    case_id: str, service: Service, db: DbSession, current: CurrentSession
) -> CaseView:
    case = _owned(service, db, current, case_id)
    await service.process(db, case, current)
    return service.view(db, _owned(service, db, current, case_id))


@router.patch("/cases/{case_id}/draft", response_model=CaseView, responses=NOT_FOUND | CONFLICT)
async def update_draft(
    case_id: str,
    payload: DraftUpdateRequest,
    service: Service,
    db: DbSession,
    reviewer: ReviewerSession,
) -> CaseView:
    service.update_draft(db, _owned(service, db, reviewer, case_id), payload)
    return service.view(db, _owned(service, db, reviewer, case_id))


@router.post("/cases/{case_id}/review", response_model=CaseView, responses=NOT_FOUND | CONFLICT)
async def review_case(
    case_id: str,
    payload: ReviewRequest,
    service: Service,
    db: DbSession,
    reviewer: ReviewerSession,
) -> CaseView:
    service.review(db, _owned(service, db, reviewer, case_id), reviewer, payload)
    return service.view(db, _owned(service, db, reviewer, case_id))


@router.get(
    "/cases/{case_id}/patient-view", response_model=PatientView, responses=NOT_FOUND | CONFLICT
)
async def read_patient_view(
    case_id: str,
    service: Service,
    db: DbSession,
    current: CurrentSession,
    lang: Literal["en", "es"] = "en",
) -> PatientView:
    return service.patient_view(db, _owned(service, db, current, case_id), lang=lang)


@router.delete(
    "/cases/{case_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=NOT_FOUND | CONFLICT,
)
async def delete_case(
    case_id: str, service: Service, db: DbSession, current: CurrentSession
) -> None:
    service.delete(db, _owned(service, db, current, case_id))
