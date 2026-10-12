import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.core.settings import Settings
from app.schemas.domain import FixtureSummary, Scenario, SourceDocument

FIXTURE_ID = re.compile(r"^fx\d{2}_[a-z0-9_]+$")
logger = logging.getLogger("bridgecare.fixtures")


class FixtureMeta(BaseModel):
    id: str
    title: str = Field(max_length=200)
    scenario: Scenario
    description: str = Field(max_length=500)
    mock_behavior: Literal["respond", "timeout", "invalid_json"] = "respond"


@dataclass(frozen=True)
class Fixture:
    meta: FixtureMeta
    document: SourceDocument

    def summary(self) -> FixtureSummary:
        return FixtureSummary(
            id=self.meta.id,
            title=self.meta.title,
            scenario=self.meta.scenario,
            description=self.meta.description,
        )


def resolve_fixtures_dir(settings: Settings) -> Path:
    if settings.fixtures_dir:
        return Path(settings.fixtures_dir)
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "fixtures" / "discharge"
        if candidate.is_dir():
            return candidate
    return Path("fixtures/discharge")


class FixtureCatalog:
    """Read-only access to synthetic fixtures. Files are re-read on each call (they are small)."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def list(self) -> list[FixtureSummary]:
        if not self.directory.is_dir():
            return []
        fixtures = (self.get(path.name) for path in sorted(self.directory.iterdir()))
        return [fixture.summary() for fixture in fixtures if fixture is not None]

    def get(self, fixture_id: str) -> Fixture | None:
        if not FIXTURE_ID.match(fixture_id):
            return None
        folder = self.directory / fixture_id
        try:
            meta = FixtureMeta.model_validate_json(
                (folder / "fixture.json").read_text(encoding="utf-8")
            )
            document = SourceDocument.model_validate(
                json.loads((folder / "document.json").read_text(encoding="utf-8"))
            )
        except (OSError, ValueError, ValidationError):
            logger.warning(json.dumps({"event": "fixture_invalid", "fixture_id": fixture_id}))
            return None
        if meta.id != fixture_id:
            logger.warning(json.dumps({"event": "fixture_id_mismatch", "fixture_id": fixture_id}))
            return None
        return Fixture(meta=meta, document=document)
