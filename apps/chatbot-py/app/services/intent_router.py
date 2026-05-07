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

import logging
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Final

from app.llm.base import LLMClient, LLMRequest
from app.utils.json_helpers import extract_first_json

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

# Router output is short — a single JSON object with `intent` +
# `confidence`, optionally a `reasoning` field per the v3 router prompt
# (migrations 077/079/080). However Gemini 2.5 Flash silently consumes
# part of `max_output_tokens` on its internal "thinking" pass even when
# `thinking_enabled=False`, so we bump the budget well above the visible
# JSON footprint to leave room for both the hidden reasoning and the
# fence-wrapped JSON body. 1024 tokens is still negligible cost-wise
# and eliminates the systemic truncation that previously caused every
# router classification to fall back to FALLBACK_INTENT silently.
_ROUTER_MAX_TOKENS: Final[int] = 1024

# Closed allow-list of keys the parser will read from the LLM payload.
# Keys outside this set are tolerated (the response is not rejected)
# but logged at WARNING level so contract drift on the upstream prompt
# or model is observable.
#
# Correction A (analysis report 2026-05-08, docs/analysis/regalica-
# intent-reading-vs-claude.md §4) — the router LLM is now ALSO asked
# to extract `target_rule_number` (the rule the user named, or null)
# in the same forward pass. This achieves Claude-level NLU on the
# anchor-vocabulary question without adding a second LLM round-trip:
# the LLM already reads the message to classify intent, asking it to
# also surface the rule number costs nothing in latency. The regex
# extractor stays as a deterministic backstop for canonical phrasing
# (no LLM cost when the message is unambiguous).
_ALLOWED_OUTPUT_KEYS: Final[frozenset[str]] = frozenset(
    {"intent", "confidence", "target_rule_number"}
)

_logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IntentResult:
    """Canonical router output consumed by the orchestrator.

    Correction A — `target_rule_number` is the rule the user named in
    free-form prose (e.g. "explique-moi le contrôle 102 stp"), as
    inferred by the router LLM. None means the LLM did not detect a
    specific rule mention. Orchestrator combines this with the
    deterministic regex (`_extract_rule_number_from_message`) using a
    "first non-None wins" strategy: regex first (free), LLM second
    (covers natural-language phrasing the regex rejects).
    """

    intent_type: str
    confidence: float
    target_rule_number: int | None = None


def _fallback_result() -> IntentResult:
    return IntentResult(intent_type=FALLBACK_INTENT, confidence=0.0, target_rule_number=None)


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

    # Gemini occasionally wraps the JSON payload in ```json … ``` markdown
    # fences (or other prose) even when JSON mode is requested. Route the
    # raw content through `extract_first_json` so we transparently recover
    # the intended dict instead of falling back to `general_help`.
    parsed = extract_first_json(response.content)
    if parsed is None:
        _logger.warning("router LLM produced no parsable JSON object: %r", response.content[:300])
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

    # Correction A — extract target_rule_number when the LLM emits it.
    # The router prompt (migration 102) instructs the LLM to surface the
    # numeric rule identifier the user named, or null if absent. We
    # tolerate three shapes for robustness: int, float-with-no-fraction
    # (Gemini occasionally emits 102.0 for an integer field), and string
    # of digits ("102"). Anything else collapses to None so the
    # orchestrator silently falls back to the regex extractor.
    raw_target = parsed.get("target_rule_number")
    target_rule_number: int | None
    if isinstance(raw_target, bool) or raw_target is None:
        target_rule_number = None
    elif isinstance(raw_target, int):
        target_rule_number = raw_target
    elif isinstance(raw_target, float) and raw_target.is_integer():
        target_rule_number = int(raw_target)
    elif isinstance(raw_target, str) and raw_target.strip().isdigit():
        target_rule_number = int(raw_target.strip())
    else:
        target_rule_number = None

    return IntentResult(
        intent_type=intent_type,
        confidence=confidence,
        target_rule_number=target_rule_number,
    )
