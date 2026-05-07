"""P1 — rule-id extraction + fail-context narrowing tests.

The diagnostic from 2026-05-06 showed that Regalica systematically
analysed the largest-gap FAIL regardless of which rule the user named
in their message. The orchestrator now extracts the rule number from
the message text (regex) and narrows `top_fails[]` to the matching
row before dispatching to the investigator. These pure-Python tests
lock both helpers — no DB, no LLM, no asyncpg.
"""

from __future__ import annotations

import pytest
from app.services.orchestrator import (
    _extract_rule_number_from_message,
    _narrow_fail_context_to_rule,
)


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("regarde la règle 102", 102),
        ("regarde la regle 102", 102),
        ("REGARDE LA REGLE 380", 380),
        ("Pourquoi la règle 27 a-t-elle échoué ?", 27),
        ("explique le FAIL 380", 380),
        ("rule 12345 please", 12345),
        ("règle n°102 et son écart", 102),
        ("règle n° 102", 102),
        ("compare la règle 102 à la 380", 102),  # FIRST match wins
        ("règle 1023", 1023),  # 4-digit number kept
        # Parametric proof — no upper bound on the rule number. The
        # extractor must work with ANY XML / annexe. Future BCT annexes
        # may expose 6-7 digit rule IDs — the regex must NOT cap.
        ("règle 999999", 999999),
        ("règle 1234567", 1234567),
        # Correction A (2026-05-08, docs/analysis/regalica-intent-
        # reading-vs-claude.md §4) — broader anchor vocabulary so
        # production phrasing reaches the narrowing path. Each new
        # anchor stays word-bounded; precision floor unchanged.
        ("le contrôle 102 a échoué", 102),
        ("le controle 102", 102),
        ("control 102 fails", 102),
        ("la ligne 102 du tableau", 102),
        ("explique l'item 102", 102),
        ("le point 102 de cette annexe", 102),
        ("CONTRÔLE 380 — pourquoi cet écart ?", 380),
    ],
)
def test_extract_rule_number_matches_canonical_patterns(message: str, expected: int) -> None:
    assert _extract_rule_number_from_message(message) == expected


@pytest.mark.parametrize(
    "message",
    [
        "",
        "explique-moi tous les ecarts",
        "regarde ce FAIL",  # 'fail' without a number
        "que penses-tu de ce run ?",
        "1023",  # bare number, no canonical anchor
        "règle xyz",
    ],
)
def test_extract_rule_number_returns_none_when_no_canonical_anchor(message: str) -> None:
    assert _extract_rule_number_from_message(message) is None


def _ctx_with_fails(fails: list[dict[str, object]]) -> dict[str, object]:
    return {
        "run_id": "00000000-0000-7000-8000-0000000000aa",
        "total_count": len(fails),
        "top_fails": fails,
    }


def test_narrow_fail_context_keeps_only_named_rule() -> None:
    ctx = _ctx_with_fails(
        [
            {"num_regle": 380, "ax_term": "630", "severity": "severe"},
            {"num_regle": 102, "ax_term": "630", "severity": "severe"},
            {"num_regle": 306, "ax_term": "630", "severity": "severe"},
        ]
    )
    narrowed = _narrow_fail_context_to_rule(ctx, 102)
    assert narrowed is not None
    assert narrowed["total_count"] == 1
    assert narrowed["top_fails"] == [{"num_regle": 102, "ax_term": "630", "severity": "severe"}]
    assert narrowed["narrowed_to_rule"] == 102


def test_narrow_fail_context_returns_unchanged_when_rule_absent() -> None:
    ctx = _ctx_with_fails(
        [
            {"num_regle": 380, "ax_term": "630", "severity": "severe"},
            {"num_regle": 306, "ax_term": "630", "severity": "severe"},
        ]
    )
    narrowed = _narrow_fail_context_to_rule(ctx, 999)
    # Identical reference is fine — caller treats it as a no-op.
    assert narrowed is ctx
    # The "narrowed_to_rule" marker MUST NOT leak when no narrowing occurred.
    assert "narrowed_to_rule" not in ctx


def test_narrow_fail_context_passthrough_when_target_is_none() -> None:
    ctx = _ctx_with_fails([{"num_regle": 102}])
    assert _narrow_fail_context_to_rule(ctx, None) is ctx


def test_narrow_fail_context_passthrough_when_ctx_is_none() -> None:
    assert _narrow_fail_context_to_rule(None, 102) is None


def test_narrow_fail_context_passthrough_when_top_fails_missing() -> None:
    ctx = {"run_id": "x", "total_count": 0}
    assert _narrow_fail_context_to_rule(ctx, 102) is ctx
