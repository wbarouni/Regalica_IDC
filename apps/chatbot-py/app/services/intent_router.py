"""LLM-based intent router for Regalica.

The router LLM reads the user's free-form message and emits a JSON
object `{intent_type, confidence, reasoning?}` whose `intent_type`
must belong to the closed enum loaded from `intent_specialists`
(commit C7, table) via `intent_grammar.load_intent_grammar`. The
function returns an `IntentResult` dataclass; on any decode error
or out-of-enum value, it returns the conservative `general_help`
fallback with `confidence = 0.0` so the downstream orchestrator
always has a defined branch.

Zero hardcoding: the closed intent-type set comes from the DB
grammar (commit C8 wires the loader into the orchestrator), NOT a
frozenset in this module. The fallback intent string itself
("general_help") is documented as a code-level convention naming
a row guaranteed to exist in `intent_specialists` — seeded by
migration 065 and promoted by 066.

Doctrine reference: docs/10-ORCHESTRATION-REGALICA.md §15
(`RegalicaRouter`); docs/05 §7 (router `temperature=0.0`).
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Final

from app.llm.base import LLMClient, LLMRequest

# Conservative fallback when the LLM returns an unparseable JSON
# blob or an intent_type outside the enum. `general_help` keeps
# the user-facing path unblocked via the Regalica aggregator.
# This string MUST exist as an intent_type row in
# intent_specialists (seeded + promoted by migrations 065 + 066);
# the orchestrator's loader will surface a clear error if the row
# is missing.
FALLBACK_INTENT: Final[str] = "general_help"

# Router LLM is deterministic per docs/05 §7 (temperature=0.0).
_ROUTER_TEMPERATURE: Final[float] = 0.0

# Router output is short — a single JSON object with at most three
# keys. 64 tokens fits the closed enum for `intent_type`, a float
# `confidence`, and a brief `reasoning` string. Long reasoning is
# truncated by the LLM; a truncated JSON makes `detect_intent` fall
# back to FALLBACK_INTENT via the JSONDecodeError branch — safe.
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
    valid_intents: Iterable[str],
) -> IntentResult:
    """Return the intent decided by the router LLM as an `IntentResult`.

    `valid_intents` is the closed enum the router output must match —
    typically `IntentGrammar.intent_types` from the DB-driven grammar
    (commit C7+C8). The router prompt itself (regalica/router) lists
    the same enum so the LLM picks one of those values; this function
    defends against drift by re-checking on the way back.
    """
    valid_set: frozenset[str] = frozenset(valid_intents)

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
    if not isinstance(intent_type, str) or intent_type not in valid_set:
        return _fallback_result()

    raw_confidence = parsed.get("confidence")
    if isinstance(raw_confidence, bool) or not isinstance(raw_confidence, int | float):
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
