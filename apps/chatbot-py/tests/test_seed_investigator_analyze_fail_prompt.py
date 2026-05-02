"""Contract tests for the investigator/analyze_fail seed entry — v2 schema.

The v2 schema (commit aggregate_zoom_fail v1) extends InvestigatorOutput
with the numeric trio (lhs, rhs, gap, gap_relative) and the
rubriques[] list so the regalica/aggregate_zoom_fail aggregator can
compose SECTION 2 (numeric values) and SECTION 3 (rubrique enumeration)
from typed JSON instead of pulling them out of the explanation_fr free
text. All new fields are nullable — existing emit paths that don't yet
populate them stay valid (backward compatibility).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_investigator_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if entry["agent_type"] == "investigator" and entry["function_name"] == "analyze_fail":
            return entry
    raise AssertionError("investigator/analyze_fail entry missing from prompts.json")


@pytest.fixture
def investigator_seed() -> dict[str, object]:
    return _load_investigator_entry()


def test_investigator_seed_declares_output_contract_json(
    investigator_seed: dict[str, object],
) -> None:
    """Specialist prompts emit JSON envelopes parsed against output_schema."""
    assert investigator_seed["output_contract"] == "json"


def test_investigator_seed_marks_contract_version_2(
    investigator_seed: dict[str, object],
) -> None:
    assert investigator_seed["_output_contract_version"] == 2


def test_investigator_seed_output_schema_includes_numeric_trio(
    investigator_seed: dict[str, object],
) -> None:
    """lhs, rhs, gap, gap_relative all present and nullable."""
    schema = investigator_seed["output_schema"]
    assert isinstance(schema, dict)
    props = schema["properties"]
    for field in ("lhs", "rhs", "gap", "gap_relative"):
        assert field in props, f"{field} missing from investigator output_schema"
        assert props[field]["type"] == ["number", "null"], (
            f"{field} must be nullable number for backward compatibility"
        )


def test_investigator_seed_gap_relative_carries_calc_doctrine(
    investigator_seed: dict[str, object],
) -> None:
    """gap_relative description must pin the calculation to the engine."""
    schema = investigator_seed["output_schema"]
    description = schema["properties"]["gap_relative"]["description"]
    assert "moteur RDG" in description
    assert "(lhs-rhs)/rhs*100" in description


def test_investigator_seed_rubriques_is_nullable_array(
    investigator_seed: dict[str, object],
) -> None:
    schema = investigator_seed["output_schema"]
    rubriques = schema["properties"]["rubriques"]
    assert rubriques["type"] == ["array", "null"]


def test_investigator_seed_rubriques_item_is_strict_code_libelle(
    investigator_seed: dict[str, object],
) -> None:
    """RubriqueRef = {code: str, libelle: str}, additionalProperties false."""
    schema = investigator_seed["output_schema"]
    item = schema["properties"]["rubriques"]["items"]
    assert item["type"] == "object"
    assert set(item["required"]) == {"code", "libelle"}
    assert item["additionalProperties"] is False
    assert item["properties"]["code"]["type"] == "string"
    assert item["properties"]["libelle"]["type"] == "string"


def test_investigator_seed_existing_fields_preserved(
    investigator_seed: dict[str, object],
) -> None:
    """Backward compatibility — explanation, suggested_action, confidence still required."""
    schema = investigator_seed["output_schema"]
    required = set(schema["required"])
    assert {"explanation", "suggested_action", "confidence"}.issubset(required)
    # New fields are NOT required (nullable, backward-compat).
    assert "lhs" not in required
    assert "rubriques" not in required
