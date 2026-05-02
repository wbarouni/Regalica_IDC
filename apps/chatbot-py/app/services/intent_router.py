"""LLM-based intent router for Regalica.

The router LLM reads the user's free-form message and emits a JSON
object `{intent, confidence}` whose `intent` value must belong to the
closed enum loaded from `intent_specialists` (commit C7, table) via
`intent_grammar.load_intent_grammar`. The function returns an
`IntentResult` dataclass; on any decode error or out-of-enum value, it
returns the conservative `general_help` fallback with `confidence = 0.0`
so the downstream orchestrator always has a defined branch.

Strict output contract — only `intent` and `confidence` are read. The
v2 router prompt forbids extra keys (`additionalProperties: false` in
the seed `output_schema`); a verbose model that emits e.g. `reasoning`,
`explanation`, or `chain_of_thought` is logged at WARNING level and the
extra value is dropped on the floor. Parsing does not fail — defence in
depth lets a slightly out-of-spec model still be useful while making
the drift visible in logs.

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
import logging
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

# Router output is short — a single JSON object with exactly two keys
# (`intent` + `confidence`). 64 tokens fits the closed enum value plus
# the float; a truncated JSON makes `detect_intent` fall back to
# FALLBACK_INTENT via the JSONDecodeError branch — safe.
_ROUTER_MAX_TOKENS: Final[int] = 64

# Closed allow-list of keys the parser will read from the LLM payload.
# Keys outside this set are tolerated (the response is not rejected)
# but logged at WARNING level so contract drift on the upstream prompt
# or model is observable.
_ALLOWED_OUTPUT_KEYS: Final[frozenset[str]] = frozenset({"intent", "confidence"})

_logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IntentResult:
    """Canonical router output consumed by the orchestrator."""

    intent_type: str
    confidence: float


def _fallback_result() -> IntentResult:
    return IntentResult(intent_type=FALLBACK_INTENT, confidence=0.0)


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

    # Mirror the `additionalProperties: false` clause of the seed
    # `output_schema`. Extra keys are dropped, never consumed; warnings
    # surface drift without breaking on a verbose model.
    extra_keys = set(parsed.keys()) - _ALLOWED_OUTPUT_KEYS
    if extra_keys:
        _logger.warning("router LLM emitted unexpected output keys: %s", sorted(extra_keys))

    intent_type = parsed.get("intent")
    if not isinstance(intent_type, str) or intent_type not in valid_set:
        return _fallback_result()

    raw_confidence = parsed.get("confidence")
    if isinstance(raw_confidence, bool) or not isinstance(raw_confidence, int | float):
        confidence = 0.0
    else:
        confidence = float(raw_confidence)

    return IntentResult(
        intent_type=intent_type,
        confidence=confidence,
    )
