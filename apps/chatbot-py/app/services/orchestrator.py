"""Regalica orchestrator — full Phase 3 chat pipeline.

End-to-end flow per docs/10 §2:

  1. (Phase 3-bis) Run T0 agents when the request carries an XML
     payload. Phase 3 minimal skips this stage — the chat route
     does not yet accept XML uploads, so `xml_content` is always
     None at the boundary. The branch is kept so Phase 3-bis can
     wire the upload pipeline without revisiting orchestrate().
  2. Load `regalica/router` from `prompt_bank` and ask the LLM to
     classify the user's message intent.
  3. Map the intent to a specialist (agent_type, function_name)
     and load that prompt from `prompt_bank`.
  4. Invoke the matching T2 specialist (Investigator / Citation /
     Historical) or fall back to a direct LLM call when the
     intent is `direct` (general help) or the router returned an
     unknown label.
  5. Build the canonical `OrchestratorResult` with a thinking
     trace consistent with the Regalica persona contract:
       « L'utilisateur demande ... mais je pense ... donc je vais ... »

Zero hardcoded keywords: routing is entirely the router LLM's
job, driven by the prompt loaded from `prompt_bank`. The
intent → specialist mapping below is part of the orchestrator
protocol grammar, not user-facing dispatch — same doctrine as
the FSM enum `Settings.env: development|test|production`.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any

import asyncpg

from app.agents.t2 import CitationAgent, HistoricalAgent, InvestigatorAgent
from app.config import settings
from app.llm.base import LLMClient, LLMRequest
from app.services.intent_router import DIRECT_INTENT, detect_intent
from app.services.prompt_loader import PromptMeta, load_active_prompt

# Intent -> (agent_type, function_name) mapping for the four
# Phase 3 intents. Phase 3-bis may extend this when the
# RegalicaPlanner replaces the simple router (docs/10 §16) and
# the seven Q-types become individually routable.
_INTENT_DISPATCH: dict[str, tuple[str, str]] = {
    "investigator": ("investigator", "analyze_fail"),
    "citation": ("citation", "find_regulatory_source"),
    "historical": ("historical", "compare_runs_history"),
    DIRECT_INTENT: ("regalica", "aggregate_general_help"),
}

# Persona-aligned thinking trace template. Phase 3-bis can move
# this to prompt_bank once the trace itself becomes a prompt.
_THINKING_PREFIX = "L'utilisateur demande"
_THINKING_MID = "mais je pense"
_THINKING_END = "donc je vais"

# Fallback user-facing message when no router prompt is active.
_NO_ROUTER_PROMPT_MESSAGE = (
    "Aucun prompt actif pour le routeur Regalica — "
    "une promotion 4-yeux est requise pour activer regalica/router."
)


# Fallback user-facing message when the chosen specialist prompt
# is not yet active. The text identifies the pair so the operator
# knows which prompt_bank row to promote.
def _no_specialist_prompt_message(agent_type: str, function_name: str) -> str:
    return (
        f"Aucun prompt actif pour {agent_type}/{function_name} — une promotion 4-yeux est requise."
    )


@dataclass(frozen=True)
class OrchestratorResult:
    """Canonical orchestrator output consumed by the chat route."""

    thinking_trace: str
    response_markdown: str
    agents_called: list[str] = field(default_factory=list)
    tokens_input: int = 0
    tokens_output: int = 0
    tokens_thinking: int = 0
    latency_ms: int = 0


async def orchestrate(
    message: str,
    tenant_id: str,
    pool: asyncpg.Pool,
    llm_client: LLMClient,
    fail_context: dict[str, Any] | None = None,
    rule_context: dict[str, Any] | None = None,
    current_run_id: str | None = None,
) -> OrchestratorResult:
    """Run the full Phase 3 chat pipeline and return the canonical result."""
    start = time.monotonic()

    # 1. T0 agents — Phase 3-bis. The chat route does not (yet)
    # forward XML payloads, so this stage is intentionally a no-op.

    # 2. Router prompt + intent detection. The router bearer is
    # env-driven (settings.chatbot_router_*) so no agent key is
    # baked into source.
    router_meta = await load_active_prompt(
        pool=pool,
        tenant_id=tenant_id,
        agent_type=settings.chatbot_router_agent_type,
        function_name=settings.chatbot_router_function_name,
    )
    if router_meta is None:
        return _fallback_result(
            message=message,
            fallback_text=_NO_ROUTER_PROMPT_MESSAGE,
            agents_called=[],
            start=start,
        )

    intent = await detect_intent(
        message=message,
        llm_client=llm_client,
        router_template=router_meta["template"],
    )

    specialist_key = _INTENT_DISPATCH.get(intent, _INTENT_DISPATCH[DIRECT_INTENT])
    specialist_agent_type, specialist_function_name = specialist_key
    bearer_label = f"{specialist_agent_type}/{specialist_function_name}"

    specialist_meta = await load_active_prompt(
        pool=pool,
        tenant_id=tenant_id,
        agent_type=specialist_agent_type,
        function_name=specialist_function_name,
    )
    if specialist_meta is None:
        return _fallback_result(
            message=message,
            fallback_text=_no_specialist_prompt_message(
                specialist_agent_type, specialist_function_name
            ),
            agents_called=[bearer_label],
            start=start,
        )

    # 4. Invoke specialist.
    specialist_outcome = await _invoke_specialist(
        intent=intent,
        message=message,
        specialist_meta=specialist_meta,
        llm_client=llm_client,
        pool=pool,
        tenant_id=tenant_id,
        fail_context=fail_context,
        rule_context=rule_context,
        current_run_id=current_run_id,
    )

    # 5. Compose Regalica response.
    return OrchestratorResult(
        thinking_trace=_build_thinking_trace(message, intent, bearer_label),
        response_markdown=specialist_outcome["response_markdown"],
        agents_called=[bearer_label],
        tokens_input=int(specialist_outcome["tokens_input"]),
        tokens_output=int(specialist_outcome["tokens_output"]),
        tokens_thinking=int(specialist_outcome["tokens_thinking"]),
        latency_ms=int((time.monotonic() - start) * 1000),
    )


async def _invoke_specialist(
    intent: str,
    message: str,
    specialist_meta: PromptMeta,
    llm_client: LLMClient,
    pool: asyncpg.Pool,
    tenant_id: str,
    fail_context: dict[str, Any] | None,
    rule_context: dict[str, Any] | None,
    current_run_id: str | None,
) -> dict[str, Any]:
    """Dispatch to the right T2 agent and normalise its output."""
    if intent == "investigator":
        agent_result = await InvestigatorAgent().analyze(
            fail=fail_context or {},
            rule=rule_context or {},
            llm_client=llm_client,
            prompt_template=specialist_meta["template"],
            temperature=specialist_meta["temperature"],
            max_tokens=specialist_meta["max_tokens"],
            thinking_enabled=specialist_meta["thinking_enabled"],
        )
    elif intent == "citation":
        agent_result = await CitationAgent().find_source(
            rule=rule_context or {},
            llm_client=llm_client,
            prompt_template=specialist_meta["template"],
            temperature=specialist_meta["temperature"],
            max_tokens=specialist_meta["max_tokens"],
            thinking_enabled=specialist_meta["thinking_enabled"],
        )
    elif intent == "historical":
        agent_result = await HistoricalAgent().compare(
            current_run_id=current_run_id or "",
            tenant_id=tenant_id,
            pool=pool,
            llm_client=llm_client,
            prompt_template=specialist_meta["template"],
            temperature=specialist_meta["temperature"],
            max_tokens=specialist_meta["max_tokens"],
            thinking_enabled=specialist_meta["thinking_enabled"],
        )
    else:
        return await _direct_response(
            message=message,
            specialist_meta=specialist_meta,
            llm_client=llm_client,
        )

    if not agent_result.success:
        return {
            "response_markdown": (f"Erreur agent {agent_result.agent_name} : {agent_result.error}"),
            "tokens_input": 0,
            "tokens_output": 0,
            "tokens_thinking": 0,
        }
    return {
        "response_markdown": _markdown_from_agent_output(agent_result.output),
        "tokens_input": 0,
        "tokens_output": 0,
        "tokens_thinking": 0,
    }


async def _direct_response(
    message: str,
    specialist_meta: PromptMeta,
    llm_client: LLMClient,
) -> dict[str, Any]:
    """Direct LLM call when the router returned `direct` (general help)."""
    request = LLMRequest(
        prompt=message,
        temperature=specialist_meta["temperature"],
        max_tokens=specialist_meta["max_tokens"],
        thinking_enabled=specialist_meta["thinking_enabled"],
        system_prompt=specialist_meta["template"],
    )
    try:
        response = await llm_client.complete(request)
    except Exception as exc:
        return {
            "response_markdown": f"Erreur LLM : {exc}",
            "tokens_input": 0,
            "tokens_output": 0,
            "tokens_thinking": 0,
        }
    return {
        "response_markdown": response.content,
        "tokens_input": response.tokens_input,
        "tokens_output": response.tokens_output,
        "tokens_thinking": response.tokens_thinking,
    }


def _markdown_from_agent_output(output: dict[str, Any]) -> str:
    """Pick a sensible markdown rendering from the agent's structured output."""
    if "response_markdown" in output and isinstance(output["response_markdown"], str):
        return output["response_markdown"]
    return json.dumps(output, ensure_ascii=False)


def _build_thinking_trace(message: str, intent: str, bearer_label: str) -> str:
    """Compose the Regalica-style thinking trace shown alongside the answer."""
    return (
        f"{_THINKING_PREFIX} : « {message} ». "
        f"{_THINKING_MID} que l'intention détectée par le routeur LLM est « {intent} ». "
        f"{_THINKING_END} invoquer l'agent {bearer_label}."
    )


def _fallback_result(
    message: str,
    fallback_text: str,
    agents_called: list[str],
    start: float,
) -> OrchestratorResult:
    """Build an OrchestratorResult for the no-active-prompt branches."""
    return OrchestratorResult(
        thinking_trace=(
            f"{_THINKING_PREFIX} : « {message} ». "
            f"{_THINKING_MID} qu'aucun prompt actif n'est disponible. "
            f"{_THINKING_END} retourner un message explicite à l'utilisateur."
        ),
        response_markdown=fallback_text,
        agents_called=agents_called,
        tokens_input=0,
        tokens_output=0,
        tokens_thinking=0,
        latency_ms=int((time.monotonic() - start) * 1000),
    )
