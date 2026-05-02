"""Regalica orchestrator — full Phase 3-bis chat pipeline.

End-to-end flow per docs/10 §2 (5-step pipeline):

  1. (Phase 3-bis) Run T0 agents when the request carries an XML
     payload. The chat route does not yet forward XML uploads, so
     this stage is intentionally a no-op.
  2. Load `regalica/router` from `prompt_bank` AND the intent
     grammar from `intent_specialists` (commit C7+C8 — DB-driven
     replacement of the prior frozen Python dicts). Ask the LLM
     to classify the user's intent into one of the IntentGrammar
     values.
  3. Look up the specialists to invoke for that intent in the
     loaded grammar. Specialists run in parallel via
     `asyncio.gather`. Their prompts are loaded from `prompt_bank`
     concurrently with the aggregator prompt.
  4. Aggregator step — load
     `<aggregator_agent_type>/<aggregator_function_name>` from
     `prompt_bank` (both fields come from the intent_specialists
     row, no convention) and ask the LLM to compose the user-
     facing French response from the specialists' JSON outputs.
  5. Build the canonical `OrchestratorResult` with a thinking
     trace consistent with the Regalica persona contract:
       « L'utilisateur demande … . Mais je pense … . Donc je vais … . »

Zero hardcoded keywords / prompts / dispatch tables: the routing
LLM and the prompts come from `prompt_bank`; the intent →
specialists + aggregator mapping AND the specialist_id → bearer
table both come from `intent_specialists` / `intent_specialist_bearers`
via `intent_grammar.load_intent_grammar`. The only thing that
remains in source is the (specialist_id → Python invoker callable)
table — handlers are code, not values.
"""

from __future__ import annotations

import asyncio
import contextlib
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
from app.services.intent_grammar import (
    IntentGrammar,
    SpecialistBearer,
    load_intent_grammar,
)
from app.services.intent_router import FALLBACK_INTENT, detect_intent
from app.services.prompt_loader import PromptMeta, load_active_prompt
from app.services.router_context import (
    build_run_context,
    load_question_types_list,
    render_router_template,
)

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


def _no_aggregator_prompt_message(agent_type: str, function_name: str) -> str:
    """User-facing fallback when the aggregator prompt is missing."""
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


# ---------------------------------------------------------------------------
# Specialist invokers — table dispatch, no if/elif on agent_id values.
# Each invoker takes the loaded PromptMeta + the shared context and returns
# the agent's `AgentResult`. The (specialist_id → bearer) mapping is loaded
# from `intent_specialist_bearers` (commit C7); the (specialist_id → invoker)
# table below stays in source because handlers are code, not values. Both
# tables must agree on the keys at runtime — a specialist_id present in the
# DB but absent from `_SPECIALIST_INVOKERS` surfaces as a clear error in
# `_invoke_specialist`.
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


# (specialist_id) -> async callable that does (load+run) the agent.
# This is the ONLY in-source dispatch table that survives commit C8 —
# every other key list (intent enum, specialists per intent, bearer
# (agent_type, function_name)) is loaded from the DB grammar.
_SPECIALIST_INVOKERS: dict[
    str, Callable[[PromptMeta, _SpecialistContext], Awaitable[AgentResult]]
] = {
    "investigator": _call_investigator,
    "citation": _call_citation,
    "historical": _call_historical,
}


async def _invoke_specialist(
    specialist_id: str,
    ctx: _SpecialistContext,
    bearer: SpecialistBearer | None,
) -> _SpecialistOutcome:
    """Load the specialist's prompt, invoke it, normalise the outcome.

    `bearer` is fetched by the caller from `IntentGrammar.bearers` so
    this function does no DB-dependent lookup itself. None means the
    DB grammar lacks an entry for the specialist_id (drift between
    intent_specialists.specialist_ids and intent_specialist_bearers).
    """
    invoker = _SPECIALIST_INVOKERS.get(specialist_id)
    if bearer is None or invoker is None:
        # Defensive path; reachable only if intent_specialists.specialist_ids
        # references an id absent from intent_specialist_bearers
        # (DB drift) OR from `_SPECIALIST_INVOKERS` (Python handler
        # missing). Both are operator misconfiguration; surface a
        # clear error rather than crashing.
        reason = "no DB bearer" if bearer is None else "no Python invoker"
        return _SpecialistOutcome(
            bearer_label=f"unknown/{specialist_id}",
            output={},
            success=False,
            error=f"Unknown specialist id {specialist_id!r}: {reason}",
        )

    bearer_label = f"{bearer.agent_type}/{bearer.function_name}"

    meta = await load_active_prompt(
        pool=ctx.pool,
        tenant_id=ctx.tenant_id,
        agent_type=bearer.agent_type,
        function_name=bearer.function_name,
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

    # 2. Router prompt + intent grammar + question_types + run_context
    # (parallel) + intent detection. The four loads are independent
    # so we await them as a fan-in instead of a serial chain.
    grammar_task = asyncio.create_task(load_intent_grammar(pool))
    question_types_task = asyncio.create_task(load_question_types_list(pool))
    run_context_task: asyncio.Task[dict[str, Any]] | None = None
    if current_run_id is not None:
        run_context_task = asyncio.create_task(
            build_run_context(pool=pool, run_id=current_run_id, tenant_id=tenant_id)
        )

    router_meta = await load_active_prompt(
        pool=pool,
        tenant_id=tenant_id,
        agent_type=settings.chatbot_router_agent_type,
        function_name=settings.chatbot_router_function_name,
    )
    if router_meta is None:
        # Drain the parallel tasks so pool connections release
        # cleanly even when we short-circuit.
        with contextlib.suppress(Exception):
            await grammar_task
        with contextlib.suppress(Exception):
            await question_types_task
        if run_context_task is not None:
            with contextlib.suppress(Exception):
                await run_context_task
        return _build_no_router_result(message, start)

    grammar: IntentGrammar = await grammar_task
    question_types_list = await question_types_task
    run_context: dict[str, Any] | None = (
        await run_context_task if run_context_task is not None else None
    )
    valid_intents = grammar.intent_types

    rendered_router_template = render_router_template(
        router_meta["template"],
        run_context=run_context,
        question_types_list=question_types_list,
        message=message,
    )

    intent_result = await detect_intent(
        message=message,
        llm_client=llm_client,
        router_template=rendered_router_template,
        valid_intents=valid_intents,
    )
    intent = intent_result.intent_type
    if intent not in grammar.intents:
        # Defensive: detect_intent already maps unknown values to
        # FALLBACK_INTENT, but we re-anchor here so the rest of the
        # pipeline never indexes the grammar with a stranger.
        intent = FALLBACK_INTENT
    if intent not in grammar.intents:
        # FALLBACK_INTENT is a documented contract — if even that row
        # is missing the operator misconfigured the catalogue. Surface
        # the no-router fallback message as the best we can do.
        return _build_no_router_result(message, start)

    intent_spec = grammar.intents[intent]

    # 3. Specialists (parallel) + aggregator-prompt fetch (parallel).
    specialist_ids = list(intent_spec.specialist_ids)
    ctx = _SpecialistContext(
        pool=pool,
        tenant_id=tenant_id,
        llm_client=llm_client,
        fail_context=fail_context,
        rule_context=rule_context,
        current_run_id=current_run_id,
    )

    aggregator_label = f"{intent_spec.aggregator_agent_type}/{intent_spec.aggregator_function_name}"
    # Kick off the aggregator-prompt load concurrently with the
    # specialists so the latency is bounded by max(specialists,
    # aggregator-fetch) rather than their sum.
    aggregator_meta_task = asyncio.create_task(
        load_active_prompt(
            pool=pool,
            tenant_id=tenant_id,
            agent_type=intent_spec.aggregator_agent_type,
            function_name=intent_spec.aggregator_function_name,
        )
    )
    if specialist_ids:
        specialist_outcomes: list[_SpecialistOutcome] = list(
            await asyncio.gather(
                *(_invoke_specialist(sid, ctx, grammar.bearers.get(sid)) for sid in specialist_ids)
            )
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
            response_markdown=_no_aggregator_prompt_message(
                intent_spec.aggregator_agent_type,
                intent_spec.aggregator_function_name,
            ),
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
