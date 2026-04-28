"""Regalica orchestrator — full Phase 3-bis chat pipeline.

End-to-end flow per docs/10 §2 (5-step pipeline):

  1. (Phase 3-bis) Run T0 agents when the request carries an XML
     payload. The chat route does not yet forward XML uploads, so
     this stage is intentionally a no-op.
  2. Load `regalica/router` from `prompt_bank` and ask the LLM to
     classify the user's intent into one of the 10 enum values
     defined in `intent_router.VALID_INTENTS` (docs/10 §3).
  3. Look up the specialists to invoke for that intent in the
     protocol-grammar constant `_SPECIALISTS_BY_INTENT`
     (docs/10 §15). Specialists run in parallel via
     `asyncio.gather`. Their prompts are loaded from `prompt_bank`
     concurrently with the aggregator prompt.
  4. Aggregator step — load `regalica/aggregate_<intent>` from
     `prompt_bank` (function_name derived by convention, no static
     map) and ask the LLM to compose the user-facing French
     response from the specialists' JSON outputs.
  5. Build the canonical `OrchestratorResult` with a thinking
     trace consistent with the Regalica persona contract:
       « L'utilisateur demande … . Mais je pense … . Donc je vais … . »

Zero hardcoded keywords / prompts: routing is the router LLM's
job, prompts come from `prompt_bank`. The intent → specialists
table and the (agent_id → bearer / invoker) tables are protocol
grammar — same doctrine as the FSM enum
`Settings.env: development|test|production` (docs/10 §15 says
explicitly to keep the dispatch table hardcoded for determinism).
"""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

import asyncpg

from app.agents.base import AgentResult
from app.agents.t2 import CitationAgent, HistoricalAgent, InvestigatorAgent
from app.config import settings
from app.llm.base import LLMClient, LLMRequest
from app.services.intent_router import FALLBACK_INTENT, detect_intent
from app.services.prompt_loader import PromptMeta, load_active_prompt

# Specialists per intent — protocol grammar per docs/10 §15.
# Keys are the 10 router enum values; values are ordered lists of
# specialist agent IDs to invoke in parallel via asyncio.gather.
# Empty list = no specialist; the aggregator runs alone (typical
# of `general_help`, `ambiguous`, `out_of_scope`).
_SPECIALISTS_BY_INTENT: dict[str, list[str]] = {
    "zoom_fail": ["investigator", "citation"],
    "grappe_cause_racine": ["investigator"],
    "historique_recurrence": ["historical"],
    "citation_reglementaire": ["citation"],
    "simulation_impact": [],
    "estimation_sanction": [],
    "plan_optimal": ["investigator", "historical"],
    "ambiguous": [],
    "out_of_scope": [],
    "general_help": [],
}

# Aggregator bearer namespace — protocol grammar (Regalica is the
# sole aggregator persona per docs/10 §1). Used as the
# `agent_type` argument when looking up `aggregate_<intent>`
# prompts in `prompt_bank`. The `function_name` is derived by
# convention so the orchestrator never needs a side table.
_AGGREGATOR_BEARER_NS: str = "regalica"

# Persona-aligned thinking trace template (docs/10 §5). Phase 3-bis
# may move this to prompt_bank once the trace itself becomes a
# prompt.
_THINKING_PREFIX = "L'utilisateur demande"
_THINKING_MID = "Mais je pense"
_THINKING_END = "Donc je vais"

# Fallback user-facing message when the router prompt is not
# active in `prompt_bank`. The 4-eyes promotion is required per
# migration 023.
_NO_ROUTER_PROMPT_MESSAGE = (
    "Aucun prompt actif pour le routeur Regalica — "
    "une promotion 4-yeux est requise pour activer regalica/router."
)


def _no_aggregator_prompt_message(function_name: str) -> str:
    """User-facing fallback when the aggregator prompt is missing."""
    return (
        f"Aucun prompt actif pour {_AGGREGATOR_BEARER_NS}/{function_name} — "
        "une promotion 4-yeux est requise."
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


@dataclass(frozen=True)
class _SpecialistContext:
    """Inputs forwarded to every specialist invoker."""

    pool: asyncpg.Pool
    tenant_id: str
    llm_client: LLMClient
    fail_context: dict[str, Any] | None
    rule_context: dict[str, Any] | None
    current_run_id: str | None


@dataclass(frozen=True)
class _SpecialistOutcome:
    """Normalised result of one specialist invocation."""

    bearer_label: str
    output: dict[str, Any]
    success: bool
    error: str | None = None


def _aggregator_function_name(intent: str) -> str:
    """Derive the aggregator prompt function_name by convention."""
    return f"aggregate_{intent}"


# ---------------------------------------------------------------------------
# Specialist invokers — table dispatch, no if/elif on agent_id values.
# Each invoker takes the loaded PromptMeta + the shared context and returns
# the agent's `AgentResult`. The (id → bearer) and (id → invoker) tables
# stay in sync; an entry must exist in BOTH or the orchestrator skips.
# ---------------------------------------------------------------------------


async def _call_investigator(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    return await InvestigatorAgent().analyze(
        fail=ctx.fail_context or {},
        rule=ctx.rule_context or {},
        llm_client=ctx.llm_client,
        prompt_template=meta["template"],
        temperature=meta["temperature"],
        max_tokens=meta["max_tokens"],
        thinking_enabled=meta["thinking_enabled"],
    )


async def _call_citation(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    return await CitationAgent().find_source(
        rule=ctx.rule_context or {},
        llm_client=ctx.llm_client,
        prompt_template=meta["template"],
        temperature=meta["temperature"],
        max_tokens=meta["max_tokens"],
        thinking_enabled=meta["thinking_enabled"],
    )


async def _call_historical(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    return await HistoricalAgent().compare(
        current_run_id=ctx.current_run_id or "",
        tenant_id=ctx.tenant_id,
        pool=ctx.pool,
        llm_client=ctx.llm_client,
        prompt_template=meta["template"],
        temperature=meta["temperature"],
        max_tokens=meta["max_tokens"],
        thinking_enabled=meta["thinking_enabled"],
    )


# (specialist_id) -> (agent_type, function_name) for prompt_bank lookup.
_SPECIALIST_BEARERS: dict[str, tuple[str, str]] = {
    "investigator": ("investigator", "analyze_fail"),
    "citation": ("citation", "find_regulatory_source"),
    "historical": ("historical", "compare_runs_history"),
}

# (specialist_id) -> async callable that does (load+run) the agent.
_SPECIALIST_INVOKERS: dict[
    str, Callable[[PromptMeta, _SpecialistContext], Awaitable[AgentResult]]
] = {
    "investigator": _call_investigator,
    "citation": _call_citation,
    "historical": _call_historical,
}


async def _invoke_specialist(specialist_id: str, ctx: _SpecialistContext) -> _SpecialistOutcome:
    """Load the specialist's prompt, invoke it, normalise the outcome."""
    bearer = _SPECIALIST_BEARERS.get(specialist_id)
    invoker = _SPECIALIST_INVOKERS.get(specialist_id)
    if bearer is None or invoker is None:
        # Defensive path; reachable only if _SPECIALISTS_BY_INTENT
        # references an id absent from the bearer/invoker tables.
        label = f"unknown/{specialist_id}"
        return _SpecialistOutcome(
            bearer_label=label,
            output={},
            success=False,
            error=f"Unknown specialist id: {specialist_id}",
        )

    agent_type, function_name = bearer
    bearer_label = f"{agent_type}/{function_name}"

    meta = await load_active_prompt(
        pool=ctx.pool,
        tenant_id=ctx.tenant_id,
        agent_type=agent_type,
        function_name=function_name,
    )
    if meta is None:
        return _SpecialistOutcome(
            bearer_label=bearer_label,
            output={},
            success=False,
            error=f"Aucun prompt actif pour {bearer_label}",
        )

    agent_result = await invoker(meta, ctx)
    return _SpecialistOutcome(
        bearer_label=bearer_label,
        output=agent_result.output,
        success=agent_result.success,
        error=agent_result.error,
    )


# ---------------------------------------------------------------------------
# Aggregator — composes the user-facing response from specialist outputs.
# ---------------------------------------------------------------------------


async def _invoke_aggregator(
    *,
    message: str,
    intent: str,
    specialist_outcomes: list[_SpecialistOutcome],
    aggregator_meta: PromptMeta,
    llm_client: LLMClient,
) -> dict[str, Any]:
    """Call the aggregator LLM and return tokens + response_markdown."""
    payload = {
        "user_message": message,
        "intent_type": intent,
        "specialist_outputs": [
            {
                "bearer": outcome.bearer_label,
                "success": outcome.success,
                "output": outcome.output,
                "error": outcome.error,
            }
            for outcome in specialist_outcomes
        ],
    }
    request = LLMRequest(
        prompt=json.dumps(payload, ensure_ascii=False),
        temperature=aggregator_meta["temperature"],
        max_tokens=aggregator_meta["max_tokens"],
        thinking_enabled=aggregator_meta["thinking_enabled"],
        system_prompt=aggregator_meta["template"],
    )
    try:
        response = await llm_client.complete(request)
    except Exception as exc:
        return {
            "response_markdown": f"Erreur LLM aggregator : {exc}",
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


# ---------------------------------------------------------------------------
# Public pipeline entrypoint.
# ---------------------------------------------------------------------------


async def orchestrate(
    message: str,
    tenant_id: str,
    pool: asyncpg.Pool,
    llm_client: LLMClient,
    fail_context: dict[str, Any] | None = None,
    rule_context: dict[str, Any] | None = None,
    current_run_id: str | None = None,
) -> OrchestratorResult:
    """Run the full Phase 3-bis chat pipeline and return the canonical result."""
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
        return _build_no_router_result(message, start)

    intent_result = await detect_intent(
        message=message,
        llm_client=llm_client,
        router_template=router_meta["template"],
    )
    intent = intent_result.intent_type
    if intent not in _SPECIALISTS_BY_INTENT:
        # Defensive: detect_intent already maps unknown values to
        # FALLBACK_INTENT, but we re-anchor here so the rest of the
        # pipeline never indexes the table with a stranger.
        intent = FALLBACK_INTENT

    # 3. Specialists (parallel) + aggregator-prompt fetch (parallel).
    specialist_ids = _SPECIALISTS_BY_INTENT[intent]
    ctx = _SpecialistContext(
        pool=pool,
        tenant_id=tenant_id,
        llm_client=llm_client,
        fail_context=fail_context,
        rule_context=rule_context,
        current_run_id=current_run_id,
    )

    aggregator_function = _aggregator_function_name(intent)
    aggregator_label = f"{_AGGREGATOR_BEARER_NS}/{aggregator_function}"
    # Kick off the aggregator-prompt load concurrently with the
    # specialists so the latency is bounded by max(specialists,
    # aggregator-fetch) rather than their sum.
    aggregator_meta_task = asyncio.create_task(
        load_active_prompt(
            pool=pool,
            tenant_id=tenant_id,
            agent_type=_AGGREGATOR_BEARER_NS,
            function_name=aggregator_function,
        )
    )
    if specialist_ids:
        specialist_outcomes: list[_SpecialistOutcome] = list(
            await asyncio.gather(*(_invoke_specialist(sid, ctx) for sid in specialist_ids))
        )
    else:
        specialist_outcomes = []
    aggregator_meta = await aggregator_meta_task

    agents_called: list[str] = [outcome.bearer_label for outcome in specialist_outcomes]
    agents_called.append(aggregator_label)

    # 4. Aggregator — compose the final user-facing response.
    if aggregator_meta is None:
        return OrchestratorResult(
            thinking_trace=_build_thinking_trace(
                message=message,
                intent=intent,
                specialist_ids=specialist_ids,
                aggregator_label=aggregator_label,
            ),
            response_markdown=_no_aggregator_prompt_message(aggregator_function),
            agents_called=agents_called,
            tokens_input=0,
            tokens_output=0,
            tokens_thinking=0,
            latency_ms=int((time.monotonic() - start) * 1000),
        )

    aggregator_outcome = await _invoke_aggregator(
        message=message,
        intent=intent,
        specialist_outcomes=specialist_outcomes,
        aggregator_meta=aggregator_meta,
        llm_client=llm_client,
    )

    # 5. Compose Regalica response.
    return OrchestratorResult(
        thinking_trace=_build_thinking_trace(
            message=message,
            intent=intent,
            specialist_ids=specialist_ids,
            aggregator_label=aggregator_label,
        ),
        response_markdown=str(aggregator_outcome["response_markdown"]),
        agents_called=agents_called,
        tokens_input=int(aggregator_outcome["tokens_input"]),
        tokens_output=int(aggregator_outcome["tokens_output"]),
        tokens_thinking=int(aggregator_outcome["tokens_thinking"]),
        latency_ms=int((time.monotonic() - start) * 1000),
    )


def _build_thinking_trace(
    *,
    message: str,
    intent: str,
    specialist_ids: list[str],
    aggregator_label: str,
) -> str:
    """Compose the Regalica thinking trace as natural French prose."""
    if not specialist_ids:
        action = (
            f"composer directement la réponse via {aggregator_label} sans invoquer de spécialiste"
        )
    elif len(specialist_ids) == 1:
        action = (
            f"consulter le spécialiste {specialist_ids[0]} "
            f"puis composer la réponse via {aggregator_label}"
        )
    else:
        joined = ", ".join(specialist_ids[:-1]) + f" et {specialist_ids[-1]}"
        action = (
            f"consulter en parallèle les spécialistes {joined}, "
            f"puis composer la réponse via {aggregator_label}"
        )
    return (
        f"{_THINKING_PREFIX} : « {message} ». "
        f"{_THINKING_MID} que l'intention détectée est « {intent} ». "
        f"{_THINKING_END} {action}."
    )


def _build_no_router_result(message: str, start: float) -> OrchestratorResult:
    """Fallback path when the regalica/router prompt is not active."""
    return OrchestratorResult(
        thinking_trace=(
            f"{_THINKING_PREFIX} : « {message} ». "
            f"{_THINKING_MID} qu'aucun prompt actif n'est disponible pour le routeur. "
            f"{_THINKING_END} retourner un message explicite à l'utilisateur."
        ),
        response_markdown=_NO_ROUTER_PROMPT_MESSAGE,
        agents_called=[],
        tokens_input=0,
        tokens_output=0,
        tokens_thinking=0,
        latency_ms=int((time.monotonic() - start) * 1000),
    )
