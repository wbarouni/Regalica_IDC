"""LLM-based intent router for Regalica.

The router LLM reads the user's free-form message and emits a
single intent token. The token is one of the canonical Regalica
intents (`investigator`, `citation`, `historical`, `direct`); any
other value or any decode error falls back to `direct` so the
orchestrator always has a defined branch to take.

Zero hardcoding of keyword matching: the heuristics live entirely
in the prompt template loaded from `prompt_bank`
(`regalica/router`). The router function below does no string
inspection on the user message — it only forwards it.

Doctrine reference: docs/10-ORCHESTRATION-REGALICA.md §15
(`RegalicaRouter`).
"""

from __future__ import annotations

import json
from typing import Final

from app.llm.base import LLMClient, LLMRequest

# Conservative fallback when the LLM returns an unparseable JSON
# blob. Phase 3-bis may surface a clarification flow instead, but
# `direct` keeps the user-facing path unblocked.
DIRECT_INTENT: Final[str] = "direct"

# Router LLM is deterministic per docs/05 §7 (temperature=0.0).
_ROUTER_TEMPERATURE: Final[float] = 0.0

# Router output is short — a single JSON object with a single key.
# 64 tokens is enough headroom for `{"intent": "investigator"}`.
_ROUTER_MAX_TOKENS: Final[int] = 64


async def detect_intent(
    message: str,
    llm_client: LLMClient,
    router_template: str,
) -> str:
    """Return the intent label decided by the router LLM.

    The intent string is whatever the LLM emitted under the
    `intent` JSON key. The orchestrator is responsible for the
    intent → specialist mapping and applies its own fallback for
    unknown values.
    """
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
        return DIRECT_INTENT

    try:
        parsed = json.loads(response.content)
    except json.JSONDecodeError:
        return DIRECT_INTENT

    if not isinstance(parsed, dict):
        return DIRECT_INTENT
    intent = parsed.get("intent")
    if not isinstance(intent, str) or not intent:
        return DIRECT_INTENT
    return intent
