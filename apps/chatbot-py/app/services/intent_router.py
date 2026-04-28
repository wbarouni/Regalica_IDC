"""LLM-based intent router for Regalica.

The router LLM reads the user's free-form message and emits a JSON
object `{intent_type, confidence, reasoning?}` whose `intent_type`
belongs to the closed 10-value enum from docs/10 §3 (the seven T2
canonical types + `ambiguous` + `out_of_scope` + `general_help`).
The function returns an `IntentResult` dataclass; on any decode
error or out-of-enum value, it returns the conservative
`general_help` fallback with `confidence = 0.0` so the downstream
orchestrator always has a defined branch.

Zero hardcoding of keyword matching: the heuristics live entirely
in the prompt template loaded from `prompt_bank`
(`regalica/router`). The router function below does no string
inspection on the user message — it only forwards it.

Doctrine reference: docs/10-ORCHESTRATION-REGALICA.md §15
(`RegalicaRouter`); docs/05 §7 (router `temperature=0.0`).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Final

from app.llm.base import LLMClient, LLMRequest

# Closed 10-value enum per docs/10 §3. The names match the
# `aggregate_<intent_type>` convention used in `prompt_bank` so
# the orchestrator can derive the aggregator function name without
# any side table. Order is the canonical order from docs/10.
VALID_INTENTS: Final[frozenset[str]] = frozenset(
    {
        "zoom_fail",
        "grappe_cause_racine",
        "historique_recurrence",
        "citation_reglementaire",
        "simulation_impact",
        "estimation_sanction",
        "plan_optimal",
        "ambiguous",
        "out_of_scope",
        "general_help",
    }
)

# Conservative fallback when the LLM returns an unparseable JSON
# blob or an intent_type outside the enum. `general_help` keeps
# the user-facing path unblocked via the Regalica aggregator.
FALLBACK_INTENT: Final[str] = "general_help"

# Router LLM is deterministic per docs/05 §7 (temperature=0.0).
_ROUTER_TEMPERATURE: Final[float] = 0.0

# Router output is short — a single JSON object with at most three
# keys. 64 tokens fits the closed enum for `intent_type`, a float
# `confidence`, and a brief `reasoning` string. Long reasoning is
# truncated by the LLM; a truncated JSON makes `detect_intent` fall
# back to `general_help` via the JSONDecodeError branch — safe.
_ROUTER_MAX_TOKENS: Final[int] = 64


@dataclass(frozen=True)
class IntentResult:
    """Canonical router output consumed by the orchestrator."""

    intent_type: str
    confidence: float
    reasoning: str | None = None


def _fallback_result() -> IntentResult:
    return IntentResult(intent_type=FALLBACK_INTENT, confidence=0.0, reasoning=None)


async def detect_intent(
    message: str,
    llm_client: LLMClient,
    router_template: str,
) -> IntentResult:
    """Return the intent decided by the router LLM as an `IntentResult`."""
    request = LLMRequest(
        prompt=message,
        temperature=_ROUTER_TEMPERATURE,
        max_tokens=_ROUTER_MAX_TOKENS,
        thinking_enabled=False,
        system_prompt=router_template,
    )

    try:
        response = await llm_client.complete(request)
    except Exception:
        return _fallback_result()

    try:
        parsed = json.loads(response.content)
    except json.JSONDecodeError:
        return _fallback_result()

    if not isinstance(parsed, dict):
        return _fallback_result()

    intent_type = parsed.get("intent_type")
    if not isinstance(intent_type, str) or intent_type not in VALID_INTENTS:
        return _fallback_result()

    raw_confidence = parsed.get("confidence")
    if isinstance(raw_confidence, bool) or not isinstance(raw_confidence, (int, float)):
        confidence = 0.0
    else:
        confidence = float(raw_confidence)

    raw_reasoning = parsed.get("reasoning")
    reasoning = raw_reasoning if isinstance(raw_reasoning, str) and raw_reasoning else None

    return IntentResult(
        intent_type=intent_type,
        confidence=confidence,
        reasoning=reasoning,
    )
