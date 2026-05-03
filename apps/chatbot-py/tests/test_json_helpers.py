"""Contract tests for app.utils.json_helpers.

Covers the documented spec for C12:
  - extract_first_json on pure JSON, prose-wrapped JSON, JSON+trailing
    text, malformed inputs, empty string, None, deeply nested objects.
  - is_static_response for prompts with / without the static_response
    column, plus non-mapping defensive paths.
"""

from __future__ import annotations

import pytest
from app.utils.json_helpers import extract_first_json, is_static_response

# ---------------------------------------------------------------------------
# extract_first_json — happy paths
# ---------------------------------------------------------------------------


def test_extract_first_json_returns_dict_on_pure_json() -> None:
    result = extract_first_json('{"verdict": "amelioration", "delta": 5}')
    assert result == {"verdict": "amelioration", "delta": 5}


def test_extract_first_json_recovers_dict_from_prose_prefix() -> None:
    """LLM glissé une intro avant le JSON malgré le JSON mode."""
    payload = 'Voici le JSON demandé : {"intent_type": "zoom", "confidence": 0.92}'
    assert extract_first_json(payload) == {"intent_type": "zoom", "confidence": 0.92}


def test_extract_first_json_recovers_dict_from_prose_suffix() -> None:
    """LLM ajouté du commentaire après le JSON."""
    payload = '{"answer": "OK"} voici la réponse complète.'
    assert extract_first_json(payload) == {"answer": "OK"}


def test_extract_first_json_recovers_dict_with_prose_on_both_sides() -> None:
    payload = 'Préambule. {"a": 1, "b": [2, 3]} Postambule.'
    assert extract_first_json(payload) == {"a": 1, "b": [2, 3]}


def test_extract_first_json_recovers_deeply_nested_object() -> None:
    nested = '{"outer": {"middle": {"inner": [1, 2, {"leaf": "value"}]}}, "sibling": null}'
    parsed = extract_first_json(nested)
    assert parsed is not None
    assert parsed["outer"]["middle"]["inner"][2]["leaf"] == "value"
    assert parsed["sibling"] is None


def test_extract_first_json_strips_leading_and_trailing_whitespace() -> None:
    assert extract_first_json('   \n\t {"k": 1}  \n  ') == {"k": 1}


def test_extract_first_json_handles_markdown_fence() -> None:
    """Common LLM wrapping pattern — ```json ... ```."""
    payload = '```json\n{"wrapped": true}\n```'
    assert extract_first_json(payload) == {"wrapped": True}


# ---------------------------------------------------------------------------
# extract_first_json — defensive null-return paths
# ---------------------------------------------------------------------------


def test_extract_first_json_returns_none_on_text_without_json() -> None:
    assert extract_first_json("Aucun JSON ici, juste du texte.") is None


def test_extract_first_json_returns_none_on_empty_string() -> None:
    assert extract_first_json("") is None


def test_extract_first_json_returns_none_on_whitespace_only() -> None:
    assert extract_first_json("   \n\t  ") is None


def test_extract_first_json_returns_none_on_none_input() -> None:
    assert extract_first_json(None) is None


@pytest.mark.parametrize("non_string", [42, 3.14, [1, 2, 3], {"already": "dict"}])
def test_extract_first_json_returns_none_on_non_string_inputs(non_string: object) -> None:
    """The contract demands a string — non-string types return None."""
    assert extract_first_json(non_string) is None


def test_extract_first_json_returns_none_on_top_level_array() -> None:
    """Top-level arrays are not accepted — only dicts."""
    assert extract_first_json("[1, 2, 3]") is None


def test_extract_first_json_returns_none_on_top_level_scalar() -> None:
    """A bare number / string is not a JSON object — refuse."""
    assert extract_first_json('"a string"') is None
    assert extract_first_json("42") is None


def test_extract_first_json_returns_none_on_unbalanced_braces() -> None:
    """Truncated JSON with no closing brace — recoverable forms exhausted."""
    assert extract_first_json('{"unterminated": ') is None


# ---------------------------------------------------------------------------
# is_static_response
# ---------------------------------------------------------------------------


def test_is_static_response_true_when_field_is_non_empty_string() -> None:
    row = {"static_response": "Cette demande sort du périmètre."}
    assert is_static_response(row) is True


def test_is_static_response_false_when_field_is_none() -> None:
    row = {"static_response": None}
    assert is_static_response(row) is False


def test_is_static_response_false_when_field_is_missing() -> None:
    row = {"agent_type": "regalica", "function_name": "router"}
    assert is_static_response(row) is False


def test_is_static_response_false_when_field_is_empty_string() -> None:
    row = {"static_response": ""}
    assert is_static_response(row) is False


def test_is_static_response_false_when_field_is_whitespace_only() -> None:
    row = {"static_response": "   \n\t  "}
    assert is_static_response(row) is False


def test_is_static_response_false_on_non_mapping_input() -> None:
    """Defensive — non-mapping inputs (None, list, scalar) cannot carry
    a static_response, return False.
    """
    assert is_static_response(None) is False
    assert is_static_response([1, 2, 3]) is False
    assert is_static_response(42) is False
    assert is_static_response("just a string") is False
