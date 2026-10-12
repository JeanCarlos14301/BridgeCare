import json
from pathlib import Path

from app.main import app


def test_exported_openapi_is_current() -> None:
    contract_path = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "openapi.json"
    committed = json.loads(contract_path.read_text(encoding="utf-8"))
    assert committed == app.openapi(), (
        "Run python scripts/export_contract.py and regenerate TS types"
    )
