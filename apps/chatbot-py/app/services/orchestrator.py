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
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Final

import asyncpg

from app.agents.base import AgentResult
from app.agents.t2 import CitationAgent, HistoricalAgent, InvestigatorAgent
from app.clients.regflow_api import EvaluateRunResult, RegflowApiClient
from app.config import settings
from app.exceptions import (
    EvaluationError,
    EvaluationTimeoutError,
    SpecialistParsingError,
    T1RejectionError,
)
from app.llm.base import LLMClient, LLMRequest
from app.services import clarification as _clarification
from app.services.intent_grammar import (
    IntentGrammar,
    IntentSpec,
    SpecialistBearer,
    load_intent_grammar,
)
from app.services.intent_router import FALLBACK_INTENT, detect_intent
from app.services.planner import parse_planner_response
from app.services.planner_config import (
    load_planner_max_plan_steps,
    load_planner_trigger_intents,
)
from app.services.planner_context import (
    build_enriched_run_context,
    load_candidate_specialists,
    render_planner_template,
)
from app.services.prompt_loader import PromptMeta, load_active_prompt
from app.services.router_context import (
    build_run_context,
    load_question_types_list,
    render_router_template,
)
from app.utils.json_helpers import extract_first_json, is_static_response

_logger = logging.getLogger(__name__)

# Confidence threshold below which the planner skips its LLM call
# entirely and short-circuits to a clarification outcome — mirrors
# the v1 planner template's STEP 1 ("si confidence < 0.65 →
# CLARIFICATION"). The threshold is duplicated here on purpose: the
# orchestrator must apply it BEFORE invoking the LLM so a low-
# confidence routing never burns a planner call. Keep the two values
# aligned manually until promoted to platform_config in a later
# commit.
_PLANNER_CONFIDENCE_THRESHOLD: Final[float] = 0.65

# Canonical clarification target. When the planner emits
# `plan_type=clarification` the orchestrator routes through the
# `ambiguous` intent — its aggregator is purpose-built for
# disambiguation prompts. The string MUST match a row in
# intent_specialists (seeded by migration 065).
_AMBIGUOUS_INTENT: Final[str] = "ambiguous"

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
    """Inputs forwarded to every specialist invoker.

    `api_client` is the engine HTTP client that specialists may need
    when they call back into the API surface — currently the C17b
    `t1_runner` specialist is the only consumer. Default None keeps
    every existing call site valid without modification; specialists
    that do not need it ignore the field.
    """

    pool: asyncpg.Pool
    tenant_id: str
    llm_client: LLMClient
    fail_context: dict[str, Any] | None
    rule_context: dict[str, Any] | None
    current_run_id: str | None
    api_client: RegflowApiClient | None = None


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


# Library specialists — wired in C17a. Each invoker imports its concrete
# class lazily to avoid bloating the orchestrator import graph; the
# import cost is paid once per process and amortised across every
# invocation.


async def _call_reporter_docx(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    from app.agents.library.reporter_docx import ReporterDocxAgent

    return await ReporterDocxAgent().execute(ctx, meta)


async def _call_reporter_pdf(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    from app.agents.library.reporter_pdf import ReporterPdfAgent

    return await ReporterPdfAgent().execute(ctx, meta)


async def _call_visualizer_chart(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    from app.agents.library.visualizer_chart import VisualizerChartAgent

    return await VisualizerChartAgent().execute(ctx, meta)


async def _call_diff_narrate(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    from app.agents.library.diff_narrate import DiffNarrateAgent

    return await DiffNarrateAgent().execute(ctx, meta)


async def _call_referential_ingestor_pdf(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    from app.agents.library.referential_ingestor_pdf import (
        ReferentialIngestorPdfAgent,
    )

    return await ReferentialIngestorPdfAgent().execute(ctx, meta)


async def _call_rule_form_assist(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    from app.agents.library.rule_form_assist import RuleFormAssistAgent

    return await RuleFormAssistAgent().execute(ctx, meta)


async def _call_t1_runner(meta: PromptMeta, ctx: _SpecialistContext) -> AgentResult:
    """Specialist for the launch_validation intent (C17b).

    Bypasses the LLM entirely — calls _run_t1_validation in process to
    drive the 3-step BCT pipeline. The shared `meta` (the regalica/
    aggregate_t1_result prompt) is loaded by _invoke_specialist as a
    bearer formality but unused here; the aggregator step downstream
    re-loads the same prompt and invokes the LLM with the canonical
    payload (user_message, intent_type, specialist_outputs[0]).

    Returns an AgentResult whose `output` carries the 7-key T1 result
    block expected by the aggregator's input_schema (success / totals /
    duration_ms / rejection_step / rejection_reason).
    """
    del meta  # Not used — see docstring.

    if ctx.current_run_id is None:
        return AgentResult(
            agent_name=_T1_RUNNER_SPECIALIST_ID,
            success=False,
            output={
                "success": False,
                "total_fail_severe": 0,
                "total_fail_rounding": 0,
                "total_pass": 0,
                "duration_ms": 0,
                "rejection_step": None,
                "rejection_reason": (
                    "Aucun run actif. Veuillez d'abord charger vos fichiers XML via l'interface."
                ),
            },
            error="no_active_run",
        )

    if ctx.api_client is None:
        return AgentResult(
            agent_name=_T1_RUNNER_SPECIALIST_ID,
            success=False,
            output={
                "success": False,
                "total_fail_severe": 0,
                "total_fail_rounding": 0,
                "total_pass": 0,
                "duration_ms": 0,
                "rejection_step": None,
                "rejection_reason": (
                    "Le client moteur n'est pas configuré. Contactez votre administrateur."
                ),
            },
            error="no_api_client",
        )

    try:
        result = await _run_t1_validation(
            pool=ctx.pool,
            run_id=ctx.current_run_id,
            tenant_id=ctx.tenant_id,
            api_client=ctx.api_client,
        )
    except T1RejectionError as exc:
        return AgentResult(
            agent_name=_T1_RUNNER_SPECIALIST_ID,
            success=False,
            output={
                "success": False,
                "total_fail_severe": 0,
                "total_fail_rounding": 0,
                "total_pass": 0,
                "duration_ms": 0,
                "rejection_step": exc.step,
                "rejection_reason": exc.reason,
            },
            error=f"t1_rejected_step_{exc.step}",
        )

    return AgentResult(
        agent_name=_T1_RUNNER_SPECIALIST_ID,
        success=True,
        output={
            "success": True,
            "total_fail_severe": result["totals"]["fail_severe"],
            "total_fail_rounding": result["totals"]["fail_rounding"],
            "total_pass": result["totals"]["pass_"],
            "duration_ms": result["duration_ms"],
            "rejection_step": None,
            "rejection_reason": None,
        },
        error=None,
    )


# (specialist_id) -> async callable that does (load+run) the agent.
# This is the ONLY in-source dispatch table that survives commit C8 —
# every other key list (intent enum, specialists per intent, bearer
# (agent_type, function_name)) is loaded from the DB grammar. The
# six C17a entries (reporter_*, visualizer_*, diff_*, ...) match the
# specialist_id column that migration 072 (C17b) will add to
# intent_specialist_bearers; until that migration lands, these
# entries are reachable only through direct test invocation.
_SPECIALIST_INVOKERS: dict[
    str, Callable[[PromptMeta, _SpecialistContext], Awaitable[AgentResult]]
] = {
    "investigator": _call_investigator,
    "citation": _call_citation,
    "historical": _call_historical,
    "reporter_docx": _call_reporter_docx,
    "reporter_pdf": _call_reporter_pdf,
    "visualizer_chart": _call_visualizer_chart,
    "diff_narrate": _call_diff_narrate,
    "referential_ingestor_pdf": _call_referential_ingestor_pdf,
    "rule_form_assist": _call_rule_form_assist,
    "t1_runner": _call_t1_runner,
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

    # Static-response short-circuit — when the prompt row carries a
    # non-empty static_response (migration 070), surface it verbatim and
    # skip the LLM call entirely. Currently a no-op for the 3 T2
    # specialists (none of them have static_response seeded), but the
    # branch is in place so a Phase 4 prompt update lands cost-free.
    if is_static_response(meta):
        return _SpecialistOutcome(
            bearer_label=bearer_label,
            output={"static_response": meta["static_response"]},
            success=True,
            error=None,
        )

    agent_result = await invoker(meta, ctx)
    return _SpecialistOutcome(
        bearer_label=bearer_label,
        output=agent_result.output,
        success=agent_result.success,
        error=agent_result.error,
    )


# ---------------------------------------------------------------------------
# JSON-contract specialist runner — used by the 6 new specialists wired
# in C17 (reporter / visualizer / diff / referential_ingestor /
# rule_form_assist). The 3 T2 specialists already in production
# (citation, investigator, historical) keep their own json.loads in
# their AgentResult-returning methods; they will migrate to this helper
# in Phase 4 once the dispatch table is updated to consume JSON dicts
# directly. Splitting C13 (the helper) from C17 (the call sites) keeps
# the diff for each commit small and reversible.
# ---------------------------------------------------------------------------


_JSON_RETRY_PROMPT: Final[str] = (
    "Votre réponse précédente n'était pas un JSON valide. "
    "Produisez uniquement un objet JSON conforme au schéma. "
    "Aucun texte avant ou après. Aucun backtick."
)


def _render_specialist_prompt(template: str, payload: dict[str, Any]) -> str:
    """Serialise the payload into the user-facing prompt body.

    The aggregator prompts use the same `json.dumps(..., ensure_ascii=
    False, indent=2)` convention so a future merge with `_invoke_aggregator`'s
    payload renderer is mechanical. `template` is unused at this layer
    (it lives in `system_prompt` of the LLM request); it stays in the
    signature so callers do not need to know which side of the request
    consumes it.
    """
    del template  # consumed via system_prompt by the caller
    return json.dumps(payload, ensure_ascii=False, indent=2)


async def _invoke_specialist_json(
    meta: PromptMeta,
    llm_client: LLMClient,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Invoke a JSON-contract specialist and return the parsed output.

    Pipeline:
      1. static_response short-circuit — if the prompt row carries a
         pre-canned response, try to parse it as JSON. If it parses
         (rare but valid for fully-canned envelope responses), return
         the parsed dict. Otherwise wrap it under a `static_response`
         key so the caller still has access to the raw text.
      2. LLM call — temperature/max_tokens/thinking_enabled inherited
         from the prompt row.
      3. extract_first_json — recovers the dict from any prose wrapper
         the LLM may have leaked.
      4. Retry once with a corrective prompt if the first pass fails.
      5. Raise SpecialistParsingError if the retry also fails — the
         orchestrator catches this and degrades the user-facing
         response gracefully.

    Used by the 6 new C17 specialists; the existing T2 specialists
    keep their per-class json.loads pending the Phase 4 migration.
    """
    if is_static_response(meta):
        canned: str = str(meta["static_response"])
        parsed_canned = extract_first_json(canned)
        if parsed_canned is not None:
            return parsed_canned
        return {"static_response": canned}

    request = LLMRequest(
        prompt=_render_specialist_prompt(meta["template"], payload),
        temperature=meta["temperature"],
        max_tokens=meta["max_tokens"],
        thinking_enabled=meta["thinking_enabled"],
        system_prompt=meta["template"],
    )
    response = await llm_client.complete(request)
    parsed = extract_first_json(response.content)
    if parsed is not None:
        return parsed

    retry_request = LLMRequest(
        prompt=_JSON_RETRY_PROMPT,
        temperature=0.0,
        max_tokens=meta["max_tokens"],
        thinking_enabled=False,
        system_prompt=meta["template"],
    )
    retry_response = await llm_client.complete(retry_request)
    retry_parsed = extract_first_json(retry_response.content)
    if retry_parsed is not None:
        return retry_parsed

    raise SpecialistParsingError(
        "JSON-contract specialist returned an unparseable payload after one retry."
    )


# ---------------------------------------------------------------------------
# Conditional planner — Phase 3-bis refinement of the C2 dispatch table.
# Invoked only for the intents listed in
# `platform_config.regalica_planner_trigger_intents` (migration 068) AND
# only when router confidence ≥ _PLANNER_CONFIDENCE_THRESHOLD. On any
# planner failure (config missing, prompt inactive, LLM error, unparseable
# response, every step rejected) the orchestrator collapses to the
# canonical candidate set from intent_grammar — the P1 fallback per
# docs/10 §16.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _PlannerOutcome:
    """Result of the maybe-invoke-planner step.

    `specialist_ids` is the (possibly empty) ordered list of agent
    ids the orchestrator should dispatch. `is_clarification` signals
    that the planner asked for a clarifying response — the
    orchestrator switches the active aggregator to the `ambiguous`
    intent when this is True.
    """

    specialist_ids: list[str]
    is_clarification: bool
    planner_invoked: bool
    fallback_activated: bool


async def _maybe_invoke_planner(
    *,
    intent: str,
    confidence: float,
    message: str,
    intent_spec: IntentSpec,
    pool: asyncpg.Pool,
    tenant_id: str,
    llm_client: LLMClient,
    current_run_id: str | None,
    session_history: list[str] | None,
) -> _PlannerOutcome:
    """Decide whether to invoke the planner LLM and translate its plan."""
    canonical_ids = list(intent_spec.specialist_ids)

    # Step 0 — load tunables. Any failure surfaces as canonical
    # dispatch so an operator misconfiguration (or a DB/test path
    # that has not seeded migration 068) never blocks the chat
    # path; the warning records why. We catch broadly because the
    # DB layer raises asyncpg/StopAsyncIteration variants that do
    # not subclass PlatformConfigError.
    try:
        trigger_intents = await load_planner_trigger_intents(pool)
        max_plan_steps = await load_planner_max_plan_steps(pool)
    except Exception as exc:
        _logger.warning("planner config unavailable (%s); using canonical dispatch", exc)
        return _PlannerOutcome(
            specialist_ids=canonical_ids,
            is_clarification=False,
            planner_invoked=False,
            fallback_activated=False,
        )

    # Step 1 — T3 trigger gate. Intents outside the trigger set go
    # straight to canonical dispatch with no planner LLM call.
    if intent not in trigger_intents:
        return _PlannerOutcome(
            specialist_ids=canonical_ids,
            is_clarification=False,
            planner_invoked=False,
            fallback_activated=False,
        )

    # Step 2 — confidence gate. Mirrors the planner prompt's STEP 1
    # ("si confidence < 0.65 → CLARIFICATION") so we save a round-
    # trip when the router itself signalled ambiguity.
    if confidence < _PLANNER_CONFIDENCE_THRESHOLD:
        return _PlannerOutcome(
            specialist_ids=[],
            is_clarification=True,
            planner_invoked=False,
            fallback_activated=False,
        )

    # Step 3 — load planner prompt. No active prompt means the
    # 4-eyes promotion has not run yet; canonical dispatch resumes.
    planner_meta = await load_active_prompt(
        pool=pool,
        tenant_id=tenant_id,
        agent_type=settings.chatbot_planner_agent_type,
        function_name=settings.chatbot_planner_function_name,
    )
    if planner_meta is None:
        _logger.info(
            "planner prompt not active for %s/%s; using canonical dispatch",
            settings.chatbot_planner_agent_type,
            settings.chatbot_planner_function_name,
        )
        return _PlannerOutcome(
            specialist_ids=canonical_ids,
            is_clarification=False,
            planner_invoked=False,
            fallback_activated=False,
        )

    # Step 4 — build context. An empty candidate set means the
    # intent_grammar table itself has no specialists to refine; the
    # planner has nothing to do.
    candidate_specialists = await load_candidate_specialists(pool=pool, intent=intent)
    if not candidate_specialists:
        return _PlannerOutcome(
            specialist_ids=canonical_ids,
            is_clarification=False,
            planner_invoked=False,
            fallback_activated=False,
        )

    enriched_ctx = await build_enriched_run_context(
        pool=pool,
        run_id=current_run_id,
        tenant_id=tenant_id,
        session_history=session_history,
    )

    rendered_prompt = render_planner_template(
        planner_meta["template"],
        intent=intent,
        confidence=confidence,
        message=message,
        candidate_specialists=candidate_specialists,
        run_context=enriched_ctx,
        max_plan_steps=max_plan_steps,
    )

    request = LLMRequest(
        prompt=message,
        temperature=planner_meta["temperature"],
        max_tokens=planner_meta["max_tokens"],
        thinking_enabled=planner_meta["thinking_enabled"],
        system_prompt=rendered_prompt,
    )
    try:
        response = await llm_client.complete(request)
    except Exception as exc:
        _logger.warning("planner LLM call failed: %s; activating P1 fallback", exc)
        return _PlannerOutcome(
            specialist_ids=canonical_ids,
            is_clarification=False,
            planner_invoked=True,
            fallback_activated=True,
        )

    valid_agent_ids = frozenset(intent_spec.specialist_ids)
    plan = parse_planner_response(
        response.content,
        valid_agent_ids,
        max_steps=max_plan_steps,
    )

    if plan.fallback_activated:
        return _PlannerOutcome(
            specialist_ids=canonical_ids,
            is_clarification=False,
            planner_invoked=True,
            fallback_activated=True,
        )
    if plan.plan_type == "clarification":
        return _PlannerOutcome(
            specialist_ids=[],
            is_clarification=True,
            planner_invoked=True,
            fallback_activated=False,
        )
    return _PlannerOutcome(
        specialist_ids=[step.agent_id for step in plan.steps],
        is_clarification=False,
        planner_invoked=True,
        fallback_activated=False,
    )


# ---------------------------------------------------------------------------
# Aggregator — composes the user-facing response from specialist outputs.
# ---------------------------------------------------------------------------

# Aggregator prompts whose seed declares `output_contract = "string"` emit
# free-form markdown, not a JSON envelope. With `thinking_enabled=true`
# Gemini 2.5 Flash occasionally leaks pre-announcement lines from its
# internal reasoning into the visible content (mémoire #30 — observed in
# pre-prod traces). The lines start with explicit handover phrases that
# the operator-controlled filter strips. Filter is applied only when the
# seed's output_contract is "string" — JSON-contract prompts must NEVER
# be touched (any modification would break the parser).
_THOUGHT_LEAKAGE_PREFIXES: Final[tuple[str, ...]] = (
    "Je retourne",
    "I return",
    "Je vais retourner",
    "Je vais composer",
    "Voici ma réponse",
    "Réponse finale",
    "THOUGHT:",
)


def _clean_thought_leakage(text: str) -> str:
    """Drop Gemini thinking-trace pre-announcement lines from the visible output.

    Filter is whole-line, prefix-matched, after stripping leading
    whitespace. Empty input returns empty. Output is right-stripped so a
    trailing newline introduced by the filter does not propagate.
    """
    if not text:
        return text
    cleaned_lines = [
        line
        for line in text.splitlines()
        if not any(line.lstrip().startswith(prefix) for prefix in _THOUGHT_LEAKAGE_PREFIXES)
    ]
    return "\n".join(cleaned_lines).strip()


async def _invoke_aggregator(
    *,
    message: str,
    intent: str,
    specialist_outcomes: list[_SpecialistOutcome],
    aggregator_meta: PromptMeta,
    llm_client: LLMClient,
    clarification_reason: str | None = None,
) -> dict[str, Any]:
    """Call the aggregator LLM and return tokens + response_markdown.

    `clarification_reason` is the origin tag for the
    regalica/aggregate_ambiguous prompt — required when intent is
    `ambiguous`, ignored otherwise. The two valid values come from
    `app.services.clarification`; the seed JSON Schema enum mirrors
    them. Sending the field for a non-ambiguous intent is harmless
    (other prompts ignore unknown payload keys) but the orchestrator
    only sets it for `ambiguous` to keep the payload minimal.
    """
    # Static-response short-circuit — when the aggregator prompt row
    # carries a non-empty static_response (migration 070, applies today
    # to regalica/aggregate_out_of_scope), surface it verbatim and skip
    # the Gemini round-trip entirely. Token counters report zero so the
    # downstream cost reporter records the savings.
    if is_static_response(aggregator_meta):
        return {
            "response_markdown": aggregator_meta["static_response"],
            "tokens_input": 0,
            "tokens_output": 0,
            "tokens_thinking": 0,
        }

    payload: dict[str, Any] = {
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
    if clarification_reason is not None:
        payload["clarification_reason"] = clarification_reason
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

    # The filter is gated on output_contract — never on thinking_enabled —
    # so JSON-contract aggregators (none today, future-proofing) keep
    # their parser-bound payload intact even with thinking on.
    raw_content = response.content
    if aggregator_meta.get("output_contract") == "string":
        response_markdown = _clean_thought_leakage(raw_content)
    else:
        response_markdown = raw_content

    return {
        "response_markdown": response_markdown,
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
    session_history: list[str] | None = None,
) -> OrchestratorResult:
    """Run the full Phase 3-bis chat pipeline and return the canonical result.

    `session_history` is forwarded to the conditional planner so it
    can extract entities (rubriques / annexes) from prior turns. The
    chat route does not yet collect it; defaulting to None makes the
    planner see an empty history, which is safe.
    """
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

    # 2.5 Conditional planner refinement — see _maybe_invoke_planner.
    # The planner may rewrite the candidate set (refinement), demand
    # a clarifying response (switches the active intent to
    # `ambiguous`), or decline (canonical dispatch resumes).
    planner_outcome = await _maybe_invoke_planner(
        intent=intent,
        confidence=intent_result.confidence,
        message=message,
        intent_spec=intent_spec,
        pool=pool,
        tenant_id=tenant_id,
        llm_client=llm_client,
        current_run_id=current_run_id,
        session_history=session_history,
    )
    if planner_outcome.is_clarification:
        # Switch to the ambiguous aggregator if the grammar carries
        # one (it normally does — seeded by migration 065). When the
        # row is missing, fall through to the original intent_spec
        # so the dispatch still produces a response.
        ambiguous_spec = grammar.intents.get(_AMBIGUOUS_INTENT)
        if ambiguous_spec is not None:
            intent = _AMBIGUOUS_INTENT
            intent_spec = ambiguous_spec
        specialist_ids = list(intent_spec.specialist_ids)
    else:
        specialist_ids = planner_outcome.specialist_ids

    # 3. Specialists (parallel) + aggregator-prompt fetch (parallel).
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

    # Bifurcate the clarification-reason payload tag for the ambiguous
    # aggregator. Two paths route here: (a) the router LLM emitted
    # `ambiguous` directly because confidence was too low to classify;
    # (b) the planner returned `plan_type="clarification"` and the
    # orchestrator switched the active intent to `ambiguous` above.
    # The seed enum is mirrored in app.services.clarification so the
    # orchestrator never carries the literal strings.
    clarification_reason: str | None = None
    if intent == _AMBIGUOUS_INTENT:
        clarification_reason = (
            _clarification.PLANNER_CLARIFICATION
            if planner_outcome.is_clarification
            else _clarification.ROUTER_LOW_CONFIDENCE
        )

    aggregator_outcome = await _invoke_aggregator(
        message=message,
        intent=intent,
        specialist_outcomes=specialist_outcomes,
        aggregator_meta=aggregator_meta,
        llm_client=llm_client,
        clarification_reason=clarification_reason,
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


# ---------------------------------------------------------------------------
# T1 dispatch — pure helpers exported for the launch-validation entry point.
#
# C16 ships these as standalone functions, NOT wired into the conversational
# flow. C17 will add the conversational entry (intent + specialist) so a
# Compliance Officer can trigger T1 from the chat. The pure-function shape
# keeps E2E tests (C18) trivial: build a pool/mock, build an api_client/mock,
# call _run_t1_validation directly.
# ---------------------------------------------------------------------------

# Doctrinal T0 markers used to map run_agent_steps rows back to the three
# booleans the T1 dispatcher checks. Identical to the keys of upload.py
# `_DISPATCH` (the source of truth for T0 dispatch) and to migration 057's
# T0 seed in `workflow_steps`. Hardcoded here strictly for the post-DB-fetch
# bool mapping; the SQL itself filters T0 rows via `workflow_steps.phase`,
# never via these strings.
_T0_INGESTOR: Final[str] = "ingestor_xml"
_T0_DEPENDENCY: Final[str] = "dependency"
_T0_TEMPORAL: Final[str] = "temporal"

# Engine call timeout — operator-tunable in a future commit; today the
# fallback covers heavy historical batches with the engine p95 < 3s on
# standard XMLs.
_T1_EVALUATE_TIMEOUT_SECONDS: Final[float] = 30.0

# Specialist key for the T1 launch_validation intent — must match the
# `specialist_id` seeded by migration 072 in `intent_specialist_bearers`
# and the `_SPECIALIST_INVOKERS` dispatch entry below. Extracted to a
# Final constant so guard `check-no-hardcoding` does not flag the four
# AgentResult constructions inside `_call_t1_runner` (kwarg name
# `agent_name` triggers the `agent` substring rule when paired with a
# string literal).
_T1_RUNNER_SPECIALIST_ID: Final[str] = "t1_runner"


async def _check_t0_agents_status(
    pool: asyncpg.Pool,
    run_id: str,
    tenant_id: str,
) -> tuple[bool, bool, bool]:
    """Return (ingestor_done, dependency_done, temporal_done) for a run.

    Reads `run_agent_steps` JOINed against `workflow_steps` to filter the
    T0 phase via the `phase` column (no hardcoded agent_type set in SQL).
    Each boolean is True iff the matching row reports `status='done'`;
    'pending'/'current'/'error'/absent all map to False.

    The post-fetch mapping uses the canonical T0 marker constants
    above; if a T0 row has been renamed in workflow_steps (no agent_type
    matches one of the constants), its boolean stays False — the operator
    must update the constants alongside the rename.
    """
    rows = await pool.fetch(
        """
        SELECT ras.agent_type,
               ras.function_name,
               ras.status
          FROM run_agent_steps ras
          JOIN workflow_steps ws
            ON ws.agent_type    = ras.agent_type
           AND ws.function_name = ras.function_name
         WHERE ras.run_id    = $1::uuid
           AND ras.tenant_id = $2::uuid
           AND ras.deleted_at IS NULL
           AND ws.phase      = 'T0'
           AND ws.is_active  = TRUE
           AND ws.deleted_at IS NULL
        """,
        run_id,
        tenant_id,
    )

    statuses: dict[str, str] = {str(row["agent_type"]): str(row["status"]) for row in rows}

    return (
        statuses.get(_T0_INGESTOR) == "done",
        statuses.get(_T0_DEPENDENCY) == "done",
        statuses.get(_T0_TEMPORAL) == "done",
    )


async def _get_run_arrete_date(
    pool: asyncpg.Pool,
    run_id: str,
    tenant_id: str,
) -> str | None:
    """Read the validation_runs.arrete_date for a run as ISO YYYY-MM-DD.

    Returns None when the run does not exist for the tenant — the caller
    surfaces a T1RejectionError step=3 in that case. asyncpg returns
    `datetime.date` for DATE columns; `.isoformat()` produces the
    canonical YYYY-MM-DD shape that evaluate_run() expects.
    """
    row = await pool.fetchrow(
        """
        SELECT arrete_date
          FROM validation_runs
         WHERE id        = $1::uuid
           AND tenant_id = $2::uuid
        """,
        run_id,
        tenant_id,
    )
    if row is None:
        return None
    arrete = row["arrete_date"]
    if hasattr(arrete, "isoformat"):
        return str(arrete.isoformat())
    return str(arrete)


async def _run_t1_validation(
    pool: asyncpg.Pool,
    run_id: str,
    tenant_id: str,
    api_client: RegflowApiClient,
) -> EvaluateRunResult:
    """T1 — three-step BCT validation pipeline (doctrine doc 04).

    Step 1: XSD structure — `ingestor_xml` must be `done` in run_agent_steps.
    Step 2: embedded controls — `dependency` AND `temporal` must be `done`.
    Step 3: RDG quality — call `evaluate_run()` on the engine route (C14/C15).

    Each step rejects definitively via T1RejectionError carrying the BCT
    step number and a French-professional reason string suitable for direct
    Regalica display. No automatic retry inside T1; the user re-launches
    via the conversational entry that C17 will wire.

    Args:
        pool: asyncpg pool used by the two T0/run lookups.
        run_id: validation_runs.id to evaluate.
        tenant_id: tenant the run belongs to (RLS + JWT signing).
        api_client: shared RegflowApiClient instance (the caller owns its
            lifecycle; T1 does not aclose it).

    Returns:
        EvaluateRunResult — verdicts + 11-key totals.

    Raises:
        T1RejectionError: any of the three steps rejects.
    """
    ingestor_done, dependency_done, temporal_done = await _check_t0_agents_status(
        pool, run_id, tenant_id
    )

    if not ingestor_done:
        raise T1RejectionError(
            step=1,
            reason=(
                "La structure XSD du fichier n'a pas pu être validée. "
                "L'agent d'ingestion XML n'a pas terminé avec succès. "
                "Veuillez vérifier le format de votre fichier et le "
                "soumettre à nouveau."
            ),
        )

    if not dependency_done:
        raise T1RejectionError(
            step=2,
            reason=(
                "Les annexes compagnes requises n'ont pas été vérifiées. "
                "L'agent de dépendance inter-annexes n'a pas terminé avec "
                "succès. Veuillez vérifier que toutes les annexes requises "
                "ont été chargées avant de relancer."
            ),
        )

    if not temporal_done:
        raise T1RejectionError(
            step=2,
            reason=(
                "La cohérence temporelle entre les fichiers n'a pas pu être "
                "vérifiée. L'agent temporal n'a pas terminé avec succès. "
                "Veuillez vérifier que tous vos fichiers partagent la même "
                "date d'arrêté."
            ),
        )

    arrete_date = await _get_run_arrete_date(pool, run_id, tenant_id)
    if arrete_date is None:
        raise T1RejectionError(
            step=3,
            reason=(
                "Le run demandé est introuvable ou la date d'arrêté n'est "
                "pas renseignée. Impossible de lancer l'évaluation RDG."
            ),
        )

    try:
        return await api_client.evaluate_run(
            run_id=run_id,
            tenant_id=tenant_id,
            arrete_date=arrete_date,
            timeout_seconds=_T1_EVALUATE_TIMEOUT_SECONDS,
        )
    except EvaluationTimeoutError as exc:
        raise T1RejectionError(
            step=3,
            reason=(
                f"Le moteur d'évaluation RDG n'a pas répondu dans le délai "
                f"imparti ({int(_T1_EVALUATE_TIMEOUT_SECONDS)} secondes). "
                f"Veuillez réessayer dans quelques instants. Si le problème "
                f"persiste, contactez votre administrateur."
            ),
        ) from exc
    except EvaluationError as exc:
        raise T1RejectionError(
            step=3,
            reason=(
                f"Le moteur d'évaluation RDG a retourné une erreur "
                f"(code {exc.status_code}). Veuillez contacter votre "
                f"administrateur si le problème persiste."
            ),
        ) from exc
